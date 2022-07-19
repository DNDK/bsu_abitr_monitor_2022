const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios").default;
const mongoose = require("mongoose");
const schedule = require("node-schedule");
let fields = require("./arrays").fmt_fields;
const sc_fields = require("./arrays").scores_fields;
require("dotenv").config();

const mongoDB = process.env.MONGO_URI;
mongoose.connect(mongoDB, { useNewUrlParser: true, useUnifiedTopology: true });

const db = mongoose.connection;
db.on('error', console.error.bind(console, 'MongoDB connection error:'));

const Abit = require("./db").Abit;


const {parse} = require("node-html-parser");

const token = process.env.BOT_TOKEN;

const bot = new TelegramBot(token, {polling: true});

async function briefReport(abit){
    if(new Date().getHours() >6 && new Date().getHours < 22){
        console.log(abit.score);
        const res = await axios.get("https://abit.bsu.by/formk1?id=1");
        const html = res.data;

        const root = parse(html);
        const table = root.querySelector("#Abit_K11_TableResults");

        const rows = table.querySelectorAll("tr");
        const spec = rows.find(row => row.innerText.includes(abit.spec));
        let spec_cells = spec.querySelectorAll("td");

        let spec_places = parseInt(spec_cells[1].innerText) || 0;
        
        spec_cells.splice(0, 8);

        for(let i = 0; i<spec_cells.length; i++){
            spec_cells[i] = parseInt(spec_cells[i].innerText) || 0;
        }
        
        let behind=0;

        const rprt = {};

        for(let i = 0; i< sc_fields.length; i++){
            let spl = sc_fields[i].split(" - ");
            let n_spl = [parseInt(spl[0]), parseInt(spl[1]) || parseInt(spl[0])];
            if(abit.score <= n_spl[1] || (abit.score <= n_spl[0] && abit.score >= n_spl[1])){
                if(spec_cells[i] !== 0){
                    behind+=spec_cells[i];
                    rprt[sc_fields[i]] = spec_cells[i];
                } 
            }
        }
        
        let message = `Сейчас выше вас, или на вашем уровне ${behind} человек.\nИз них:\n`;

        Object.keys(rprt).map(k => {
            message+= `${rprt[k]} человек с баллом в дипазоне ${k},\n`
        })

        if(behind <= spec_places){
            message+=`На данный момент вы проходите! 😃`;
        }
        else{
            message += `Увы, но вы не проходите 😔`
        }

        message += `\n(Число мест - ${spec_places})`

        bot.sendMessage(abit.chat_id, message);
    }
    else{
        bot.sendMessage(abit.chat_id, "На сегодня мониторинг закончился");
    }

}

const job = schedule.scheduleJob("*/30 8-22 * * *",() => {
    Abit.find({notificate: true}).exec((err, abits) => {
        if(err){
            console.error(err);
            return;
        }

        for(const abit of abits){
            briefReport(abit);
        }
    })
})

async function sendReport(abitr){
    if(new Date().getHours() > 6 && new Date().getHours() < 22){
        const res = await axios.get("https://abit.bsu.by/formk1?id=1");
        const html = res.data;

        const root = parse(html);
        const table = root.querySelector("#Abit_K11_TableResults");

        const rows = table.querySelectorAll("tr");
        const kb = rows.find(row => row.innerText.includes(abitr.spec));
        const kb_cells = kb.querySelectorAll("td");
        const fields = require("./arrays").fmt_fields;
        const values = [];
        for(let i of kb_cells){
            values.push(i.innerText.length? i.innerText : '-');
        }
        values.splice(0,1);

        const fmt = {};

        let message = ``;


        for(let i = 0; i<fields.length; i++){
            let vl = values[i].length ? values[i] : '-'
            fmt[fields[i]] = vl;

            message+=`${fields[i]}: ${values[i]}\n`;
        }

        bot.sendMessage(abitr.chat_id, message);
    }else{
        bot.sendMessage(abitr.chat_id, "На сегодня мониторинг закончился");
    }

}


let abits_forms = [];
const spec_change = [];

bot.on("message", async (msg) => {
    const chat_id = msg.chat.id;
    if(msg.entities && msg.entities.some(e=>e.type === "bot_command")){
        if(msg.text == "/start"){
            Abit.findOne({chat_id: msg.chat.id}, (err, bt) => {
                if(err){
                    console.log(err);
                    bot.sendMessage(msg.chat.id, "Ошибка");
                    return;
                }

                if(bt === null && !abits_forms.includes(msg.chat.id)){
                    abits_forms.push({chat_id});
                    bot.sendMessage(msg.chat.id, "Скажи мне свою специальность", {
                        reply_markup: {
                            one_time_keyboard: true,
                            keyboard: require("./arrays").keyboard
                        }
                    })
                }
                else{
                    bot.sendMessage(chat_id, "Я и так запущен");
                }

            });
        }
        else if(msg.text == "/brief"){
            Abit.findOne({chat_id}).exec((err, abit) => {
                if(err){
                    console.error(err);
                    return;
                }

                if(abit === null){
                    bot.sendMessage(chat_id, "тебя нету");
                    return;
                }

                briefReport(abit);
            })
        }
        else if(msg.text === "/report"){
            Abit.findOne({chat_id}).exec((err, abit) => {
                if(err){
                    console.error(err);
                    bot.sendMessage(chat_id, "Ошибка");
                    return;
                }

                if(abit === null){
                    bot.sendMessage(chat_id, "тебя нету");
                    return;
                }

                sendReport(abit);
            })
        }
        else if(msg.text === "/change_spec"){
            spec_change.push(chat_id);
            bot.sendMessage(chat_id, "Выбери новую специальность", {
            reply_markup: {
                one_time_keyboard: true,
                keyboard: require("./arrays").keyboard
            }
            });
        }
    }
    else{
        console.log(abits_forms)
        if(abits_forms.find(a=>a.chat_id === chat_id)){
            if(!abits_forms.find(a => a.chat_id === chat_id).spec){
                let index = abits_forms.findIndex(a => a.chat_id === chat_id);
                let spec = msg.text;
                abits_forms[index].spec = spec;
                bot.sendMessage(chat_id, "Отлично, теперь скажи свой балл");
            }

            else if(!abits_forms.find(a => a.chat_id === chat_id).score){
                console.log("aaa");
                let index = abits_forms.findIndex(a => a.chat_id === chat_id);

                let score = parseInt(msg.text);
                if(isNaN(score)){
                    bot.sendMessage(msg.chat.id, "Некорректный ввод");
                }
                else if(score < 0 || score > 400){
                    bot.sendMessage(msg.chat.id, "Некорректный ввод");
                }
                else{
                    abits_forms[index].score = score;
                    let abit = new Abit(abits_forms[index]);
    
                    abit.save().then(a => {
                        let ind = abits_forms.findIndex(b => b.chat_id === a.chat_id);
                        abits_forms.splice(ind, 1);
                        bot.sendMessage(a.chat_id, "Отлично, теперь вы будуте получать краткие отчеты");
                    })

                }
            }
        }

        if(spec_change.includes(chat_id)){
            let opts = [];
            require("./arrays").keyboard.map(k => {
                opts.push(k[0]);
            });

            if(opts.includes(msg.text)){
                Abit.findOneAndUpdate({chat_id}, {spec: msg.text}).exec((err, abit) => {
                    if(err){
                        console.error(err);
                        bot.sendMessage(chat_id, "Ошибка");
                        return;
                    }
                    let ind = spec_change.findIndex(b => b.chat_id === a.chat_id);
                    spec_change.splice(ind, 1);
                    bot.sendMessage(chat_id, `Теперь твоя специальность - ${abit.spec}`);
                });
            }

            else{
                bot.sendMessage(chat_id, "Некорректный ввод");
            }
        }
    }
});

bot.on('polling_error', console.log);
