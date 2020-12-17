var python_interface = require("./python_interface.js");

module.exports = function (config) {
  var tfjsSuffix = "";
  switch (config.tfjsBuild) {
    case "gpu":
      tfjsSuffix = "-gpu";
      var tf = require("@tensorflow/tfjs-node-gpu");
      break;
    case "cpu":
      var tf = require("@tensorflow/tfjs-node");
      break;
    default:
      try {
        tfjsSuffix = "-gpu";
        var tf = require("@tensorflow/tfjs-node-gpu");
      } catch (err) {
        console.log(err);
      }
      break;
  }

  const cocossd = require("@tensorflow-models/coco-ssd");
  // const mobilenet = require('@tensorflow-models/mobilenet');

  async function loadCocoSsdModal() {
    const modal = await cocossd.load({
      base: config.cocoBase || "lite_mobilenet_v2", //lite_mobilenet_v2
      modelUrl: config.cocoUrl,
    });
    return modal;
  }

  // async function loadMobileNetModal() {
  //     const modal = await mobilenet.load({
  //         version: 1,
  //         alpha: 0.25 | .50 | .75 | 1.0,
  //     })
  //     return modal;
  // }

  function getTensor3dObject(numOfChannels, imageArray) {
    const tensor3d = tf.node.decodeJpeg(imageArray, numOfChannels);
    console.log("image array -----> ", imageArray);
    console.log("Tensor 3D  0----> ", tensor3d);

    return tensor3d;
  }

  async function getPredicitons(rtsp, inputImage) {
      return new Promise ( (resolve, reject) => {
        python_interface(rtsp, inputImage)
        .then((result) => {
          resolve(result)
        })
        .catch((error) => {
          console.log("Error : ", error);
          reject("Error Occured")
        });
        });
     
    }

      
    

// const mobileNetModel =  this.loadMobileNetModal();
  var loadCocoSsdModel = {
    detect: function () {
      return { data: [] };
    },
  };
  async function init() {
    loadCocoSsdModel = await loadCocoSsdModal();
  }
  init();
  return class ObjectDetectors {
    constructor(data, type) {
      this.startTime = new Date();
      this.inputImage = data.image;
      this.type = type;
      this.rtsp = data.rtsp;
    }

    async process() {
      let predictions = await getPredicitons(this.rtsp,this.inputImage)
    //   console.log(predictions);

      return {
        data: predictions,
        type: this.type,
        time: new Date() - this.startTime,
      };

      // predictions = [
      //     {
      //         bbox: [
      //         210.29292678833008,
      //         121.9500732421875,
      //         230.34585571289062,
      //         154.85707092285156
      //         ],
      //         class: '- Project',
      //         score: 0.83622145652771,
      //     },
      //     {

      //         bbox: [
      //         10.29292678833008,
      //         121.9500732421875,
      //         230.34585571289062,
      //         154.85707092285156
      //         ],
      //         class: 'Minsklsldksjklsjdkljlkljli- Project',
      //         score: 0.83622145652771,
      //     }
      //     ]
    }
  };
};
