//
// Shinobi - Tensorflow Plugin
// Copyright (C) 2016-2025 Moe Alam, moeiscool
//
// # Donate
//
// If you like what I am doing here and want me to continue please consider donating :)
// PayPal : paypal@m03.ca
//
// Base Init >>
var fs = require('fs');
var config = require('./conf.json')
var dotenv = require('dotenv').config()
var s
try{
    s = require('../pluginBase.js')(__dirname,config)
}catch(err){
    console.log(err)
    try{
        s = require('./pluginBase.js')(__dirname,config)
    }catch(err){
        console.log(err)
        return console.log(config.plug,'Plugin start has failed. pluginBase.js was not found.')
    }
}
const {
    haltMessage,
    checkStartTime,
    setStartTime,
} = require('../pluginCheck.js');
const { log } = require('console');
if(!checkStartTime()){
    console.log(haltMessage,new Date())
    s.disconnectWebSocket()
    return
}
setStartTime()
// Base Init />>

const ObjectDetectors = require('./ObjectDetectors.js')(config);

s.detectObject = function(buffer,d,tx,frameLocation,callback){
    data = {
        'rtsp' : d.mon.auto_host,
        'image' : buffer
    }
    new ObjectDetectors(data).process().then((resp)=>{
        var results = resp.data
        console.log("results ------ > ", results[0]);
        if(results[0]){
            var mats = []
            results.forEach(function(v){
                mats.push({
                    x: v.bbox[0],
                    y: v.bbox[1],
                    width: v.bbox[2],
                    height: v.bbox[3],
                    tag: v.class,
                    confidence: v.score,
                })
            })
            var isObjectDetectionSeparate = d.mon.detector_pam === '1' && d.mon.detector_use_detect_object === '1'
            var width = parseFloat(isObjectDetectionSeparate  && d.mon.detector_scale_y_object ? d.mon.detector_scale_y_object : d.mon.detector_scale_y)
            var height = parseFloat(isObjectDetectionSeparate  && d.mon.detector_scale_x_object ? d.mon.detector_scale_x_object : d.mon.detector_scale_x)
            console.log("tx - from shinobi tensor flow " ,  tx.toString());
            
            tx({
                f:'trigger',
                id:d.id,
                ke:d.ke,
                details:{
                    plug:config.plug,
                    name:'Tensorflow',
                    reason:'object',
                    matrices:mats,
                    imgHeight:width,
                    imgWidth:height,
                    time: resp.time
                }
            })
        }
        callback()
    })
}
