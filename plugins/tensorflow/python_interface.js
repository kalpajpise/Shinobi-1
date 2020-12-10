var spawn = require('child_process').spawn
var rtsp_arr = []


module.exports =  function(rtsp) {

    console.log( );
    py    = spawn('python', [__dirname + "/compute-rtsp.py"]),

    // console.log(__dirname + "/compute-rtsp.py");

    data = rtsp;
    dataString = '';


    py.stdout.on('data', function(data){
    dataString += data.toString();
    });


    py.stdout.on('end', function(){
    console.log('Python Output : \n', dataString);

    });
    


    py.stdin.write(JSON.stringify(data));
    py.stdin.end();

    // if (rtsp_arr.indexOf(rtsp) == -1 ){
    //     console.log("calling python");
    //     rtsp_arr.push(rtsp)
        
    // }

}