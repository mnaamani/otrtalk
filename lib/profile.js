
var UserFiles = require("./files").UserFiles;
var BuddyList = require("./buddy_list");

module.exports = Profile;

function Profile(name,config,password,store){
  var self = {};
  var otrm = require(config.otr);
  var userFiles = new UserFiles(store.keystoreFiles(), otrm.VFS ? otrm.VFS() : undefined, password);
  var user = new otrm.User(userFiles);

  self.buddies = BuddyList(config,password,store);

  self.id = function(){
    return config.id;
  };

  self.name = function(){
    return name;
  };

  self.save = function(){
    store.save(config);
    userFiles.save();
  };

  //todo - print buddies
  self.print = function(){
      var Table = require("cli-table");
      var table = new Table();
      var accounts = user.accounts();
      var fingerprint = accounts.length ? accounts[0].fingerprint : "";
      table.push(
          {'Profile': name},
          {'otrtalk-id' : config.id},
          {'keystore' : store.pathToKeys()},
          {'otr-module' : config.otr},
          {'fingerprint' : fingerprint}
      );
      console.log(table.toString());
  };

  self.generateKey = function(next){
      user.generateKey(config.accountname,config.protocol,function(err){
        if(err){
          next(err);
          return;
        }else{
          if(!user.generateInstag){
            next();
            return;
          }
          user.generateInstag(config.accountname, config.protocol,function(err,instag){
             if(err){
               next(err);
             }else{
               self.save();
               next();
             }
          });
        }
    });
  };

  self.importKey = function(privkey,callback){
      try{
        user.importKey(name,"otrtalk",privkey);
        self.save();
        callback(undefined);
      }catch(e){
        callback(e);
      }
  };

  return self;
}
