var https = require('https');
var OTRTALK_VERSION = require("../package.json").version;
module.exports.version = OTRTALK_VERSION;

module.exports.update = function (){
  https.get("https://raw.githubusercontent.com/mnaamani/node-otr-talk/master/package.json", function(res) {
    res.on('data', function(d) {
      var package = JSON.parse(d.toString());
      try{
      if(package.version === OTRTALK_VERSION){
          console.log("You have the latest version:", OTRTALK_VERSION);
      }else{
          console.log("installed version:",OTRTALK_VERSION);
          console.log("new version:",package.version,"is available to download.");

          console.log("Use the npm package manager to update: npm -g update otrtalk");
      }
      }catch(E){
          console.log("unable to check for updated version.");
      }
    });
  }).on('error', function(e) {
    console.log("github.com is unreachable.");
  });
}
