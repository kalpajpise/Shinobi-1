var spawn = require("child_process").spawn;

module.exports =  function (rtsp, frame_array) {
  return new Promise((resolve, reject) => {
    const params = {
      rtsp: rtsp,
      frame: frame_array,
    };

    const pyArgs = [__dirname + "/compute-rtsp.py"];
    const py = spawn("python", pyArgs);

    let returnDate = "";

    py.stdout.on("data", function (data) {
      returnDate += data;
    });

    py.stdout.on("end", function () {
      try {
        return_data = JSON.parse(returnDate);
        resolve(return_data);
      } catch (e) {
        console.log(e);
        reject("Error Ocurred");
      }
    });

    py.stdin.write(JSON.stringify(params));
    py.stdin.end();
  });
};
