const { log } = require('console');
var moment = require('moment');
var execSync = require('child_process').execSync;
var exec = require('child_process').exec;
var spawn = require('child_process').spawn;
var request = require('request');
// Matrix In Region Libs >
var SAT = require('sat')
var V = SAT.Vector;
var P = SAT.Polygon;
var B = SAT.Box;
// Matrix In Region Libs />
module.exports = function(s,config,lang){
    const {
        moveCameraPtzToMatrix,
    } = require('./control/ptz.js')(s,config,lang)
    const {
        splitForFFPMEG,
    } = require('./ffmpeg/utils.js')(s,config,lang)
    const countObjects = async (event) => {
        const matrices = event.details.matrices
        const eventsCounted = s.group[event.ke].activeMonitors[event.id].eventsCounted || {}
        if(matrices){
            matrices.forEach((matrix)=>{
                const id = matrix.tag
                if(!eventsCounted[id])eventsCounted[id] = {times: [], count: {}, tag: matrix.tag}
                if(!isNaN(matrix.id))eventsCounted[id].count[matrix.id] = 1
                eventsCounted[id].times.push(new Date().getTime())
            })
        }
        return eventsCounted
    }
    const isAtleastOneMatrixInRegion = function(regions,matrices,callback){
        var regionPolys = []
        var matrixPoints = []
        regions.forEach(function(region,n){
            var polyPoints = []
            region.points.forEach(function(point){
                polyPoints.push(new V(parseInt(point[0]),parseInt(point[1])))
            })
            regionPolys[n] = new P(new V(0,0), polyPoints)
        })
        var collisions = []
        var foundInRegion = false
        matrices.forEach(function(matrix){
            var matrixPoly = new B(new V(matrix.x, matrix.y), matrix.width, matrix.height).toPolygon()
            regionPolys.forEach(function(region,n){
                var response = new SAT.Response()
                var collided = SAT.testPolygonPolygon(matrixPoly, region, response)
                if(collided === true){
                    collisions.push({
                        matrix: matrix,
                        region: regions[n]
                    })
                    foundInRegion = true
                }
            })
        })
        if(callback)callback(foundInRegion,collisions)
        return foundInRegion
    }
    const scanMatricesforCollisions = function(region,matrices){
        var matrixPoints = []
        var collisions = []
        if (!region || !matrices){
            if(callback)callback(collisions)
            return collisions
        }
        var polyPoints = []
        region.points.forEach(function(point){
            polyPoints.push(new V(parseInt(point[0]),parseInt(point[1])))
        })
        var regionPoly = new P(new V(0,0), polyPoints)
        matrices.forEach(function(matrix){
            if (matrix){
                var matrixPoly = new B(new V(matrix.x, matrix.y), matrix.width, matrix.height).toPolygon()
                var response = new SAT.Response()
                var collided = SAT.testPolygonPolygon(matrixPoly, regionPoly, response)
                if(collided === true){
                    collisions.push(matrix)
                }
            }
        })
        return collisions
    }
    const nonEmpty = (element) => element.length !== 0;
    s.addEventDetailsToString = function(eventData,string,addOps){
        //d = event data
        if(!addOps)addOps = {}
        var newString = string + ''
        var d = Object.assign(eventData,addOps)
        var detailString = s.stringJSON(d.details)
        newString = newString
            .replace(/{{TIME}}/g,d.currentTimestamp)
            .replace(/{{REGION_NAME}}/g,d.details.name)
            .replace(/{{SNAP_PATH}}/g,s.dir.streams+'/'+d.ke+'/'+d.id+'/s.jpg')
            .replace(/{{MONITOR_ID}}/g,d.id)
            .replace(/{{MONITOR_NAME}}/g,s.group[d.ke].rawMonitorConfigurations[d.id].name)
            .replace(/{{GROUP_KEY}}/g,d.ke)
            .replace(/{{DETAILS}}/g,detailString)
        if(d.details.confidence){
            newString = newString
            .replace(/{{CONFIDENCE}}/g,d.details.confidence)
        }
        if(newString.includes("REASON")) {
          if(d.details.reason) {
            newString = newString
            .replace(/{{REASON}}/g, d.details.reason)
          }
        }
        return newString
    }
    s.filterEvents = function(x,d){
        switch(x){
            case'archive':
                d.videos.forEach(function(v,n){
                    s.video('archive',v)
                })
            break;
            case'delete':
                s.deleteListOfVideos(d.videos)
            break;
            case'execute':
                exec(d.execute,{detached: true})
            break;
        }
    }
    s.triggerEvent = async (d,forceSave) => {
        // console.log("Trigger Event d , forceSave---->", d);
        var didCountingAlready = false
        var filter = {
            halt : false,
            addToMotionCounter : true,
            useLock : true,
            save : true,
            webhook : true,
            command : true,
            record : true,
            indifference : false,
            countObjects : true
        }
        var detailString = JSON.stringify(d.details);
        console.log("Detailied String ----- > ", detailString);
        if(!s.group[d.ke]||!s.group[d.ke].activeMonitors[d.id]){
            return s.systemLog(lang['No Monitor Found, Ignoring Request'])
        }
        d.mon=s.group[d.ke].rawMonitorConfigurations[d.id];
        var currentConfig = s.group[d.ke].rawMonitorConfigurations[d.id].details
        s.onEventTriggerBeforeFilterExtensions.forEach(function(extender){
            console.log("extender --->",extender.toString())
            extender(d,filter)
        })
        var hasMatrices = (d.details.matrices && d.details.matrices.length > 0)
        // console.log("Has Matrices ", hasMatrices);
        //read filters
        if(
            currentConfig.use_detector_filters === '1' &&
            ((currentConfig.use_detector_filters_object === '1' && d.details.matrices) ||
            currentConfig.use_detector_filters_object !== '1')
        ){
            console.log("inside of if");
            var parseValue = function(key,val){
                var newVal
                switch(val){
                    case'':
                        newVal = filter[key]
                    break;
                    case'0':
                        newVal = false
                    break;
                    case'1':
                        newVal = true
                    break;
                    default:
                        newVal = val
                    break;
                }
                return newVal
            }
            var filters = currentConfig.detector_filters
            console.log(filters);
            Object.keys(filters).forEach(function(key){
                var conditionChain = {}
                var dFilter = filters[key]
                dFilter.where.forEach(function(condition,place){
                    conditionChain[place] = {ok:false,next:condition.p4,matrixCount:0}
                    if(d.details.matrices)conditionChain[place].matrixCount = d.details.matrices.length
                    var modifyFilters = function(toCheck,matrixPosition){
                        var param = toCheck[condition.p1]
                        var pass = function(){
                            if(matrixPosition && dFilter.actions.halt === '1'){
                                delete(d.details.matrices[matrixPosition])
                            }else{
                                conditionChain[place].ok = true
                            }
                        }
                        switch(condition.p2){
                            case'indexOf':
                                if(param.indexOf(condition.p3) > -1){
                                    pass()
                                }
                            break;
                            case'!indexOf':
                                if(param.indexOf(condition.p3) === -1){
                                    pass()
                                }
                            break;
                            default:
                                if(eval('param '+condition.p2+' "'+condition.p3.replace(/"/g,'\\"')+'"')){
                                    pass()
                                }
                            break;
                        }
                    }
                    switch(condition.p1){
                        case'tag':
                        case'x':
                        case'y':
                        case'height':
                        case'width':
		                case'confidence':
                            if(d.details.matrices){
                                d.details.matrices.forEach(function(matrix,position){
                                    modifyFilters(matrix,position)
                                })
                            }
                        break;
                        case'time':
                            var timeNow = new Date()
                            var timeCondition = new Date()
                            var doAtTime = condition.p3.split(':')
                            var atHour = parseInt(doAtTime[0]) - 1
                            var atHourNow = timeNow.getHours()
                            var atMinuteNow = timeNow.getMinutes()
                            var atSecondNow = timeNow.getSeconds()
                            if(atHour){
                                var atMinute = parseInt(doAtTime[1]) - 1 || timeNow.getMinutes()
                                var atSecond = parseInt(doAtTime[2]) - 1 || timeNow.getSeconds()
                                var nowAddedInSeconds = atHourNow * 60 * 60 + atMinuteNow * 60 + atSecondNow
                                var conditionAddedInSeconds = atHour * 60 * 60 + atMinute * 60 + atSecond
                                if(eval('nowAddedInSeconds '+condition.p2+' conditionAddedInSeconds')){
                                    conditionChain[place].ok = true
                                }
                            }
                        break;
                        default:
                            modifyFilters(d.details)
                        break;
                    }
                })
                var conditionArray = Object.values(conditionChain)
                var validationString = ''
                conditionArray.forEach(function(condition,number){
                    validationString += condition.ok+' '
                    if(conditionArray.length-1 !== number){
                        validationString += condition.next+' '
                    }
                })
                if(eval(validationString)){
                    if(dFilter.actions.halt !== '1'){
                        delete(dFilter.actions.halt)
                        Object.keys(dFilter.actions).forEach(function(key){
                            var value = dFilter.actions[key]
                            filter[key] = parseValue(key,value)
                        })
                    }else{
                        filter.halt = true
                    }
                }
            })
            if(d.details.matrices && d.details.matrices.length === 0 || filter.halt === true){
                return
            }else if(hasMatrices){
                console.log("has Matrices else loop ");
                var reviewedMatrix = []
                console.log( "hello " , d.details.matrices);
                d.details.matrices.forEach(function(matrix){
                    if(matrix)reviewedMatrix.push(matrix)
                })
                d.details.matrices = reviewedMatrix
            }
        }

        console.log("Hello im here");
        var eventTime = new Date()
        //motion counter
        if(filter.addToMotionCounter && filter.record){
            console.log("here in 1st if");
            s.group[d.ke].activeMonitors[d.id].detector_motion_count.push(d)
            console.log("iffff ----> ", s.group[d.ke].activeMonitors[d.id].detector_motion_count);
        }
        if(filter.countObjects && currentConfig.detector_obj_count === '1' && currentConfig.detector_obj_count_in_region !== '1'){
            didCountingAlready = true
            console.log("here");
            countObjects(d)
        }
        if(currentConfig.detector_ptz_follow === '1'){
            console.log("3rd if");
            moveCameraPtzToMatrix(d,currentConfig.detector_ptz_follow_target)
        }
        if(filter.useLock){
            if(s.group[d.ke].activeMonitors[d.id].motion_lock){
                return
            }
            var detector_lock_timeout
            if(!currentConfig.detector_lock_timeout||currentConfig.detector_lock_timeout===''){
                detector_lock_timeout = 2000
            }
            detector_lock_timeout = parseFloat(currentConfig.detector_lock_timeout);
            if(!s.group[d.ke].activeMonitors[d.id].detector_lock_timeout){
                s.group[d.ke].activeMonitors[d.id].detector_lock_timeout=setTimeout(function(){
                    clearTimeout(s.group[d.ke].activeMonitors[d.id].detector_lock_timeout)
                    delete(s.group[d.ke].activeMonitors[d.id].detector_lock_timeout)
                },detector_lock_timeout)
            }else{
                return
            }
        }
        console.log("tr8e =hdshf", hasMatrices && currentConfig.detector_obj_region === '1');
        // check if object should be in region
        if(hasMatrices && currentConfig.detector_obj_region === '1'){
            console.log("im in the loop");
            var regions = s.group[d.ke].activeMonitors[d.id].parsedObjects.cords
            var isMatrixInRegions = isAtleastOneMatrixInRegion(regions,d.details.matrices)
            if(isMatrixInRegions){
                s.debugLog('Matrix in region!')
                if(filter.countObjects && currentConfig.detector_obj_count === '1' && currentConfig.detector_obj_count_in_region === '1' && !didCountingAlready){
                    countObjects(d)
                }
            }else{
                return
            }
        }
        // check modified indifference
        if(filter.indifference !== false && d.details.confidence < parseFloat(filter.indifference)){
            // fails indifference check for modified indifference
            return
        }
        console.log("doObjectDetection",d);
        console.log("end");
        if(d.doObjectDetection === true){
            console.log("hererere ");
            s.ocvTx({
                f : 'frame',
                mon : s.group[d.ke].rawMonitorConfigurations[d.id].details,
                ke : d.ke,
                id : d.id,
                time : s.formattedTime(),
                frame : s.group[d.ke].activeMonitors[d.id].lastJpegDetectorFrame
            })
        }
        //
        if(currentConfig.detector_use_motion === '0' || d.doObjectDetection !== true ){
            if(currentConfig.det_multi_trig === '1'){
                s.getCamerasForMultiTrigger(d.mon).forEach(function(monitor){
                    if(monitor.mid !== d.id){
                        s.triggerEvent({
                            id: monitor.mid,
                            ke: monitor.ke,
                            details: {
                                confidence: 100,
                                name: "multiTrigger",
                                plug: d.details.plug,
                                reason: d.details.reason
                            }
                        })
                    }
                })
            }
            //save this detection result in SQL, only coords. not image.
            if(forceSave || (filter.save && currentConfig.detector_save === '1')){
                s.knexQuery({
                    action: "insert",
                    table: "Events",
                    insert: {
                        ke: d.ke,
                        mid: d.id,
                        details: detailString,
                        time: eventTime,
                    }
                })
            }
            if(currentConfig.detector === '1' && currentConfig.detector_notrigger === '1'){
                s.setNoEventsDetector(s.group[d.ke].rawMonitorConfigurations[d.id])
            }
            var detector_timeout
            if(!currentConfig.detector_timeout||currentConfig.detector_timeout===''){
                detector_timeout = 10
            }else{
                detector_timeout = parseFloat(currentConfig.detector_timeout)
            }
            if(filter.record && d.mon.mode=='start'&&currentConfig.detector_trigger==='1'&&currentConfig.detector_record_method==='sip'){
                s.createEventBasedRecording(d,moment(eventTime).subtract(5,'seconds').format('YYYY-MM-DDTHH-mm-ss'))
            }else if(filter.record && d.mon.mode!=='stop'&&currentConfig.detector_trigger=='1'&&currentConfig.detector_record_method==='hot'){
                if(!d.auth){
                    d.auth=s.gid();
                }
                if(!s.group[d.ke].users[d.auth]){
                    s.group[d.ke].users[d.auth]={system:1,details:{},lang:lang}
                }
                d.urlQuery = []
                d.url = 'http://'+config.ip+':'+config.port+'/'+d.auth+'/monitor/'+d.ke+'/'+d.id+'/record/'+detector_timeout+'/min';
                console.log("data 324234----> ", d);
                if(currentConfig.watchdog_reset!=='0'){
                    d.urlQuery.push('reset=1')
                }
                if(currentConfig.detector_trigger_record_fps&&currentConfig.detector_trigger_record_fps!==''&&currentConfig.detector_trigger_record_fps!=='0'){
                    d.urlQuery.push('fps='+currentConfig.detector_trigger_record_fps)
                }
                if(d.urlQuery.length>0){
                    d.url+='?'+d.urlQuery.join('&')
                }
                request({url:d.url,method:'GET'},function(err,data){
                    if(err){
                        //could not start hotswap
                    }else{
                        delete(s.group[d.ke].users[d.auth])
                        d.cx.f='detector_record_engaged';
                        d.cx.msg = JSON.parse(data.body)
                        s.tx(d.cx,'GRP_'+d.ke);
                    }
                })
            }
            d.currentTime = new Date()
            d.currentTimestamp = s.timeObject(d.currentTime).format()
            d.screenshotName =  d.details.reason + '_'+(d.mon.name.replace(/[^\w\s]/gi,''))+'_'+d.id+'_'+d.ke+'_'+s.formattedTime()
            d.screenshotBuffer = null

            if(filter.webhook && currentConfig.detector_webhook === '1'){
                var detector_webhook_url = s.addEventDetailsToString(d,currentConfig.detector_webhook_url)
                var webhookMethod = currentConfig.detector_webhook_method
                if(!webhookMethod || webhookMethod === '')webhookMethod = 'GET'
                request(detector_webhook_url,{method: webhookMethod,encoding:null},function(err,data){
                    if(err){
                        s.userLog(d,{type:lang["Event Webhook Error"],msg:{error:err,data:data}})
                    }
                })
            }

            if(filter.command && currentConfig.detector_command_enable === '1' && !s.group[d.ke].activeMonitors[d.id].detector_command){
                s.group[d.ke].activeMonitors[d.id].detector_command = s.createTimeout('detector_command',s.group[d.ke].activeMonitors[d.id],currentConfig.detector_command_timeout,10)
                var detector_command = s.addEventDetailsToString(d,currentConfig.detector_command)
                if(detector_command === '')return
                exec(detector_command,{detached: true},function(err){
                    if(err)s.debugLog(err)
                })
            }

            for (var i = 0; i < s.onEventTriggerExtensions.length; i++) {
                const extender = s.onEventTriggerExtensions[i]
                await extender(d,filter)
            }
        }
        //show client machines the event
        d.cx={f:'detector_trigger',id:d.id,ke:d.ke,details:d.details,doObjectDetection:d.doObjectDetection};
        console.log("d.cx ---- > ", d.cx);
        console.log("id " , d.id , "doObjectDetection" , d.doObjectDetection);
        s.tx(d.cx,'DETECTOR_'+d.ke+d.id);
        console.log(s.tx.toString());
    }
    s.createEventBasedRecording = function(d,fileTime){
        if(!fileTime)fileTime = s.formattedTime()
        d.mon = s.group[d.ke].rawMonitorConfigurations[d.id]
        var currentConfig = s.group[d.ke].activeMonitors[d.id].details
        if(currentConfig.detector !== '1'){
            return
        }
        var detector_timeout
        if(!currentConfig.detector_timeout||currentConfig.detector_timeout===''){
            detector_timeout = 10
        }else{
            detector_timeout = parseFloat(currentConfig.detector_timeout)
        }
        if(currentConfig.watchdog_reset === '1' || !s.group[d.ke].activeMonitors[d.id].eventBasedRecording.timeout){
            clearTimeout(s.group[d.ke].activeMonitors[d.id].eventBasedRecording.timeout)
            s.group[d.ke].activeMonitors[d.id].eventBasedRecording.timeout = setTimeout(function(){
                s.group[d.ke].activeMonitors[d.id].eventBasedRecording.allowEnd = true
                s.group[d.ke].activeMonitors[d.id].eventBasedRecording.process.stdin.setEncoding('utf8')
                s.group[d.ke].activeMonitors[d.id].eventBasedRecording.process.stdin.write('q')
                s.group[d.ke].activeMonitors[d.id].eventBasedRecording.process.kill('SIGINT')
                delete(s.group[d.ke].activeMonitors[d.id].eventBasedRecording.timeout)
            },detector_timeout * 1000 * 60)
        }
        if(!s.group[d.ke].activeMonitors[d.id].eventBasedRecording.process){
            s.group[d.ke].activeMonitors[d.id].eventBasedRecording.allowEnd = false;
            var runRecord = function(){
                var filename = fileTime+'.mp4'
                s.userLog(d,{type:lang["Traditional Recording"],msg:lang["Started"]})
                //-t 00:'+s.timeObject(new Date(detector_timeout * 1000 * 60)).format('mm:ss')+'
                s.group[d.ke].activeMonitors[d.id].eventBasedRecording.process = spawn(config.ffmpegDir,splitForFFPMEG(('-loglevel warning -analyzeduration 1000000 -probesize 1000000 -re -i "'+s.dir.streams+'/'+d.ke+'/'+d.id+'/detectorStream.m3u8" -c:v copy -strftime 1 "'+s.getVideoDirectory(d.mon) + filename + '"')))
                var ffmpegError='';
                var error
                s.group[d.ke].activeMonitors[d.id].eventBasedRecording.process.stderr.on('data',function(data){
                    s.userLog(d,{type:lang["Traditional Recording"],msg:data.toString()})
                })
                s.group[d.ke].activeMonitors[d.id].eventBasedRecording.process.on('close',function(){
                    if(!s.group[d.ke].activeMonitors[d.id].eventBasedRecording.allowEnd){
                        s.userLog(d,{type:lang["Traditional Recording"],msg:lang["Detector Recording Process Exited Prematurely. Restarting."]})
                        runRecord()
                        return
                    }
                    s.insertCompletedVideo(d.mon,{
                        file : filename,
                        events: s.group[d.ke].activeMonitors[d.id].detector_motion_count
                    })
                    s.userLog(d,{type:lang["Traditional Recording"],msg:lang["Detector Recording Complete"]})
                    s.userLog(d,{type:lang["Traditional Recording"],msg:lang["Clear Recorder Process"]})
                    delete(s.group[d.ke].activeMonitors[d.id].eventBasedRecording.process)
                    clearTimeout(s.group[d.ke].activeMonitors[d.id].eventBasedRecording.timeout)
                    delete(s.group[d.ke].activeMonitors[d.id].eventBasedRecording.timeout)
                    clearTimeout(s.group[d.ke].activeMonitors[d.id].recordingChecker)
                })
            }
            runRecord()
        }
    }
    s.closeEventBasedRecording = function(e){
        if(s.group[e.ke].activeMonitors[e.id].eventBasedRecording.process){
            clearTimeout(s.group[e.ke].activeMonitors[e.id].eventBasedRecording.timeout)
            s.group[e.ke].activeMonitors[e.id].eventBasedRecording.allowEnd = true;
            s.group[e.ke].activeMonitors[e.id].eventBasedRecording.process.kill('SIGTERM');
        }
        // var stackedProcesses = s.group[e.ke].activeMonitors[e.id].eventBasedRecording.stackable
        // Object.keys(stackedProcesses).forEach(function(key){
        //     var item = stackedProcesses[key]
        //     clearTimeout(item.timeout)
        //     item.allowEnd = true;
        //     item.process.kill('SIGTERM');
        // })
    }
}
