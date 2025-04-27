const express = require("express")
const mongoose = require("mongoose");
const {Schema, model} = require("../connection");

const Content = Schema ({
    content : {type: String,
        unique: true,
        required: [true, "Content is Required"],
        validate : {
            validator : function(v)  {
                return v && v.trim().length > 0;
            },
            message: "Content must not be empty",
        },
    },
    imageURL: {type: String},
    timestamp: {type: Date, default: Date.now}
})



module.exports = model("content", Content);
