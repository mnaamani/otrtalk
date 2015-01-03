var path = require("path");
var fs = require("fs");
var fcrypto = require("./file_crypto.js");
var UserFiles = require("./files.js").UserFiles;

//handle different versions of node api
var fs_existsSync = fs.existsSync || path.existsSync;


module.exports = Buddy;

function Buddy(alias,id,config,password,store){
  var self = {};
  var otrm = require(config.otr);
  var userFiles = new UserFiles(store.buddyKeystoreFiles(alias), otrm.VFS ? otrm.VFS() : undefined, password);

  self.alias = function(){ return alias; }

  self.id = function(){ return id; }

  self.fingerprint = function(){
    var file = path.join(store.pathToFingerprints(),alias);
    if(!fs_existsSync(file)){
        return "";
    }
    var buf = fcrypto.decryptFile(file,password,"accessing key-store");
    var entry = buf.toString().split(/\s+/);
    if(entry[4]==='smp') {
      return entry[3];
    }
  }

  self.setupSession = function(secret){
    return (function(){
        var user = new otrm.User(userFiles);
        var context = user.ConnContext(config.accountname, config.protocol, self.id());
        return ({
          otr: new otrm.Session(user, context, {policy:otrm.POLICY("ALWAYS"), secret:secret}),
          context: context,
          writeTrustedFingerprints:function(){
            user.writeTrustedFingerprints();
            userFiles.save();
          },
          end:function(){
            user.state.free();
            delete user;
          }
        });
     });
  }

  return self;
}
