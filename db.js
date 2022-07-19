const mongoose = require("mongoose");

const abit = new mongoose.Schema({
    chat_id: {type: String, required: true},
    score: {type: Number, required: true},
    notificate: {type: Boolean, default: true},
    spec: {type: String, required: true}
})

exports.Abit = mongoose.model('Abit', abit);