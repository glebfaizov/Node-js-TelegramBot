const { Telegraf, session , Scenes: {BaseScene, Stage }, Markup, Scenes } = require('telegraf')

const MongoClient = require("mongodb").MongoClient;
const mongoClient = new MongoClient("mongodb://localhost:27017/", { useUnifiedTopology: true });

const bot = new Telegraf('2114550821:AAGWj5nirW-0iRxyDct2kY0oOjJ-s966hbI') //сюда помещается токен, который дал botFather

const position_keyboard = Markup.keyboard(['Работник' , 'Стажер']).oneTime() // клавиатура для выбора должности 
const reg_accept = Markup.keyboard(['Да',"Нет"]).oneTime()  // подтверждениx    е данных при регистрации

const remove_keyboard = Markup.removeKeyboard() // убираем клавиатуру 

const  nameScene = new BaseScene('nameScene') // Сцена отвечает за получение имени пользователя
nameScene.enter( ctx => ctx.reply("Введите имя")) // данный текст будет выведен при входе в данную сцену 
nameScene.on('text' , ctx => { // эта часть как бы объясняет на что наша сцена может реагировать на текст предположим или какие то команды отдельные их может быть несколько 

    ctx.session.name = ctx.message.text // тело сцены это что будет происходить когда мы выполним условие тригера 
    ctx.scene.enter("positionScene")

})
nameScene.leave(ctx => ctx.reply('Имя получено' ,remove_keyboard)) // это мы увидим при выходе 

const positionScene = new BaseScene('positionScene') // Сцена отвечает за получение должности 
positionScene.enter(ctx => ctx.reply("Выберите должность ", position_keyboard ))
positionScene.on('text', ctx => {

    ctx.session.position = ctx.message.text
    ctx.scene.enter("regScene",remove_keyboard)

})
positionScene.leave(ctx => ctx.reply('Должность получена ',remove_keyboard ))

const regScene = new BaseScene('regScene') //сцена регистрации она собирает все данные которые мы получили от пользователя и собирает их для отправки и запись в базу данных 
regScene.enter(ctx => ctx.reply("Регистрация почти завершена \n Подтвердите данные \n Имя:  " + ctx.session.name + " \n Должность:  " + ctx.session.position , reg_accept ))
regScene.hears("Да",ctx => {
    mongoClient.connect(function(err, client){

        const db = client.db("TelegramBot");
        const collection = db.collection("AllUsers");
        ctx.session.userdata = {                                      // переменная которая будет хранить все данные для отправки 
            user_chat_id: ctx.message.chat.id,
            users_first_name: ctx.message.from.first_name,
            name:  ctx.session.name ,
            position:  ctx.session.position,
            voted: []
        }
        if (ctx.session.position == "Стажер"){            // это произойдет в случае если вы стажер добавляются особые данные 
            ctx.session.userdata['score'] = 0;
            ctx.session.userdata['presentation'] = 0;
            ctx.session.userdata['code_style'] = 0;
            ctx.session.userdata['usability'] = 0;
            const trainee = db.collection("Trainee")
            trainee.updateOne({list : "trainee"}, { $addToSet : { names : ctx.session.name  } }, function(){
            }); // обновляем список стажеров для того чтобы могли более удобно понимать за кого можно голосовать 
        }
        collection.insertOne(ctx.session.userdata);
    });
    ctx.reply("Данные успешно записаны")
    ctx.scene.enter("voteScene")
});
regScene.hears("Нет",ctx => {                       // это часть которая отвечает за подтверждение данных 
    ctx.scene.enter("nameScene", remove_keyboard)
});
regScene.leave(ctx => ctx.reply(' Регистрация завершена ',remove_keyboard ))

const voteScene = new BaseScene('voteScene') // здесь мы начинаем голосование
voteScene.enter(ctx => {

        mongoClient.connect(function(err, client){   // мы начинаем голосование с того что узнаем за кого можно голосовать 

        const db = client.db("TelegramBot");
        const collection = db.collection("AllUsers"); // данная база данных  хранит всех пользователей и там у нас есть специальный массив который хранит людей за кого мы голосвали 
        const trainee = db.collection("Trainee"); //  а вот тут лежат все имена стажеров 
        
        trainee.findOne( {list : "trainee"}, function(err,res){
            collection.findOne( { user_chat_id : ctx.message.chat.id } , function(err, data ){

                data['voted'].push(data['name']); // это чтобы не могли голосовать за самих себя
                var i = 0;
                while(data['voted'][i] != null){
                    var k = 0;
                    while(res['names'][k] != null){
                        if(data['voted'][i] == res['names'][k]){
                            res['names'].splice(k,1); // удаляем из массива тех за кого голосовали и самих себя 
                        }
                        k++;
                    }
                    i++;
                }
            ctx.session.trainees = res['names'];
            if (res['names'][0] == null){
                ctx.scene.enter("resultScene")
            }
            else{
                const votefor = Markup.keyboard([res['names']]).oneTime() // создаем новую клавиатуру в которой будем хранить за кого можно точно голосовать
                ctx.reply("Здесь будет проходить голосование \n Оценивание проходит по 3 параметрам: \n 1.Удобность использования \n 2. Чистота кода \n 3.Презентация  \n За кого голосуем? ",  votefor )
            }
            });
            
        })

    });
});
voteScene.on("text",ctx => {  // мы выбрали из списка за кого голосовать хотим 
    var i=0;
    var checkres= 0;
    while(ctx.session.trainees[i] != null){
        if(ctx.session.trainees[i] == ctx.message.text){
            checkres = 1;
        }
        i++;
    }
    if (checkres == 0){ // это на случай если кто то решит ввести имя определенного стажера за которого он голосовать не может  вернет его назад на выбор за кого голосовать
        ctx.reply("Хитрить плохо")
        ctx.scene.enter("voteScene")
    }
    else{
        ctx.session.lastvotefor = ctx.message.text
        ctx.scene.enter("presentation")
    }
})
voteScene.leave(ctx => ctx.reply("Голосование началось помните что нужно оценивать от 0 до 10 ", remove_keyboard))  

const presentation = new BaseScene("presentation") // по факту голосование начинается здесь 
presentation.enter(ctx => ctx.reply("Презентация"))
presentation.on('text',ctx => {
    if (parseInt(ctx.message.text) > 10 || parseInt(ctx.message.text) < 0){
        ctx.scene.enter("presentation")
    }
    else{
        ctx.session.presentation = parseInt(ctx.message.text)
        ctx.scene.enter("code_style")
    }

})
presentation.leave(ctx => ctx.reply("Получили"))

const code_style = new BaseScene("code_style")
code_style.enter(ctx => ctx.reply("Красота кода"))
code_style.on('text',ctx => {
    if (parseInt(ctx.message.text) > 10 || parseInt(ctx.message.text) < 0){
        ctx.scene.enter("code_style")
    }
    else{
        ctx.session.code_style = parseInt(ctx.message.text)
        ctx.scene.enter("usability")
    }

})
code_style.leave(ctx => ctx.reply("Получили"))

const usability = new BaseScene("usability")
usability.enter(ctx => ctx.reply("Удобность"))
usability.on('text',ctx => {
    if (parseInt(ctx.message.text) > 10 || parseInt(ctx.message.text) < 0){
        ctx.scene.enter("usability")
    }
    else{
        ctx.scene.enter("voteScene")
        ctx.session.usability = parseInt(ctx.message.text)
        mongoClient.connect(function(err, client){   

            const db = client.db("TelegramBot");
            const collection = db.collection("AllUsers"); // вновь подключились к базе данных и теперь будем добавлять к текущему пользователю имя стажера за которого он проголосвал 
            
            collection.updateOne({user_chat_id : ctx.message.chat.id}, { $addToSet : { voted :  ctx.session.lastvotefor } } , function(){});
            collection.findOne({ name : ctx.session.lastvotefor }, function(err, res){
                ctx.session.presentation = parseInt(ctx.session.presentation) + parseInt(res["presentation"])
                ctx.session.code_style = parseInt(ctx.session.code_style) + parseInt(res["code_style"])
                ctx.session.usability = parseInt(ctx.session.usability) + parseInt(res["usability"])
                var finalscore = parseInt(ctx.session.presentation) + parseInt(ctx.session.code_style) + parseInt(ctx.session.usability)
                collection.updateOne({ name : ctx.session.lastvotefor } , { $set : {presentation : parseInt(ctx.session.presentation) }})
                collection.updateOne({ name : ctx.session.lastvotefor } , { $set : {code_style : parseInt(ctx.session.code_style)} })
                collection.updateOne({ name : ctx.session.lastvotefor } , { $set : {usability : parseInt(ctx.session.usability)} })
                collection.updateOne({ name : ctx.session.lastvotefor } , { $set : {score : parseInt(finalscore) }})
            })
        });
    }

})
usability.leave(ctx => ctx.reply("Получили"))

const resultScene = new BaseScene("resultScene") // результаты
resultScene.enter( ctx => {
    mongoClient.connect(async function(err, client){

        const db = client.db("TelegramBot");
        const collection = db.collection("AllUsers");
        const trainee = db.collection("Trainee");
        
        trainee.findOne({list : "trainee"},function(err,res){
            var i=0;
            while(res['names'][i] != null){
                collection.findOne({name : res['names'][i]}, function(err, result){
                    ctx.reply("Имя: " + result['name'] + "\nДолжность: "+ result['position'] + "\n 1.Удобность использования "+result['usability']+"\n 2. Чистота кода "+result['code_style']+"\n 3.Презентация "+result['presentation']+"\n Общий счет " + result['score'])
                });
                i++;
            }
        })


    });
})
resultScene.on("text" ,  ctx => {
    ctx.reply("Ась")
    return ctx.scene.leave("resultScene")
})
    resultScene.leave(ctx => ctx.reply("Ну на этом вроде все "))

bot.hears("voteScene",ctx=>function(){ctx.scene.enter("voteScene")})
const stage =  new Stage([ nameScene , positionScene, regScene, voteScene, presentation, code_style, usability,resultScene ])
//stage.hears('Отмена', ctx => ctx.scene.leave())
bot.use(session())
bot.use(stage.middleware())

bot.start((ctx) => { //события при команде старт
    mongoClient.connect(async function(err, client){

        const db = client.db("TelegramBot");
        const collection = db.collection("AllUsers");
        await ctx.reply("Бот для голосования");
        collection.findOne({user_chat_id: ctx.message.chat.id }, async function(err, response){  // это проверка есть ли записи о пользователе в базе данных до этого 
            if (response == null){ // записи в базе данных нет
                await ctx.reply("Не нашли вас в нашей БД необходимо пройти регистрацию");
                await ctx.scene.enter("nameScene") // переход в сцену для начала регистрации 
            }
            else{
                await ctx.reply('Добро пожаловать вновь '); // запись есть 
                await ctx.reply(
                    'Вы записанны здесь как: '+ response['name'] + '\n С должностью: '+ response['position']
                );
            }
        });

    });
});

bot.help((ctx) => async function (){
    await ctx.reply("Чтобы что то начало происходить нужно воспользоватьс командой /start ")
})

var CronJob = require('cron').CronJob;   // крон чтобы очищать данные  00 18 * * 4
var job = new CronJob('00 18 * * 4', function() {
    mongoClient.connect(async function(err, client){

        const db = client.db("TelegramBot");
        const collection = db.collection("AllUsers");

        collection.updateMany({},{$set : { voted : [] }},function(err, res){
        })

    });
}, null, true);
job.start();

bot.launch()    