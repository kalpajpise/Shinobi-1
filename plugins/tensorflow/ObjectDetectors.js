var python_interface = require("./python_interface.js")

module.exports = function(config){
  var tfjsSuffix = ''
  switch(config.tfjsBuild){
      case'gpu':
          tfjsSuffix = '-gpu'
          var tf = require('@tensorflow/tfjs-node-gpu')
      break;
      case'cpu':
          var tf = require('@tensorflow/tfjs-node')
      break;
      default:
          try{
              tfjsSuffix = '-gpu'
              var tf = require('@tensorflow/tfjs-node-gpu')
          }catch(err){
              console.log(err)
          }
      break;
  }

  const cocossd = require('@tensorflow-models/coco-ssd');
  // const mobilenet = require('@tensorflow-models/mobilenet');


  async function loadCocoSsdModal() {
      const modal = await cocossd.load({
          base: config.cocoBase || 'lite_mobilenet_v2', //lite_mobilenet_v2
          modelUrl: config.cocoUrl,
      })
      return modal;
  }

  // async function loadMobileNetModal() {
  //     const modal = await mobilenet.load({
  //         version: 1,
  //         alpha: 0.25 | .50 | .75 | 1.0,
  //     })
  //     return modal;
  // }

  function getTensor3dObject(numOfChannels,imageArray) {

      const tensor3d = tf.node.decodeJpeg( imageArray, numOfChannels );

      return tensor3d;
  }
  // const mobileNetModel =  this.loadMobileNetModal();
  var loadCocoSsdModel = {
      detect: function(){
          return {data:[]}
      }
  }
  async function init() {
      loadCocoSsdModel =  await loadCocoSsdModal();
  }
  init()
  return class ObjectDetectors {

      constructor(data,type) {
          this.startTime = new Date();
          this.inputImage = data.image;
          this.type = type;
          this.rtsp = data.rtsp 
        //   console.log(this.rtsp);
      }
      async process() {
        //   const tensor3D = getTensor3dObject(3,(this.inputImage));
          python_interface(this.rtsp);
        //   console.log("covalues", co-values);
        //   let predictions = await loadCocoSsdModel.detect(tensor3D);
          

        //   tensor3D.dispose();
        //   console.log(
        //       "prdictions" , predictions,
        //       "this.type", this.type,

        //   );

            // console.log("prediction", predictions);
        
            // predictions1 = [
            //     {
            //       bbox: [
            //         101.577091217041,
            //         375.15878677368164,
            //         51.869449615478516,
            //         38.64097595214844
            //       ],
            //       class: 'Mindsi Project ',
            //       score: 0.5202080607414246
            //     }
            //   ]
            let   predictions = [
                    {
                      bbox: [
                        114.29292678833008,
                        121.9500732421875,
                        189.34585571289062,
                        321.85707092285156
                      ],
                      class: 'Minsi- Project',
                      score: 0.83622145652771
                    }
                  ]
                  
     
          return {


            
              data: predictions,
              type: this.type,
              time: new Date() - this.startTime
          }
      }
  }
}
