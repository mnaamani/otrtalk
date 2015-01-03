var Buddy = require("./buddy.js");
var tool = require("./tool.js");

module.exports = Buddies;


function Buddies(config,password,store){
  var self = {};

  self.aliases = function(){
      var buddies = [];
      config.buddies.forEach(function(buddy){
        buddies.push(buddy.alias);
      });
      return buddies;
  };

  self.printList = function(){
    var Table = require("cli-table");
    var table = new Table({
      head:['buddy alias','otrtalk id','fingerprint']
    });
    self.aliases().forEach(function(alias){
      var buddy = self.getBuddy(alias);
      table.push( [buddy.alias(),buddy.id(),tool.validateFP(buddy.fingerprint())]);
    });
    console.log(table.toString());
  };

  self.getBuddy = function(alias){
      var bud;
      config.buddies.forEach(function(buddy){
        if(buddy.alias === alias) bud = Buddy(alias,buddy.id,config,password,store);
      });
      return bud;
  };

  self.createBuddy = function(alias,id){
      if(!alias.match( /^[A-Z0-9-_]+$/ig)){
          console.log("Invalid buddy name, use only alphanumerical characters, dashes and underscore.");
          return undefined;
      }
      //todo - check buddy alias is unique
      store.addBuddy(alias,id);
  };

  self.deleteBuddy = function(alias){
      //todo verify buddy exists first?
      store.removeBuddy(alias);
      var file = store.buddyFingerprintsFile(alias);
      if(fs_existsSync(file)){
        fs.unlink(file);
      }
  };

  return self;
}
