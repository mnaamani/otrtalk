var fs = require("fs");
var path = require("path");
var fs_existsSync = fs.existsSync || path.existsSync;
var os = require("os");
var imapp = require("../imapp.js");
var program = require('../commander.js');

module.exports = Command;

function Command(ui){
  this.UI = ui;
}

Command.prototype.exec = function(app,profilename,id){
    var filename;
    var pm = require("../profile_manager.js");

    profilename = profilename || program.profile;

    if(!app){
      console.log("You did not specify an application.")
      console.log("specify either: pidgin or adium");
      return;
    }

    var im = new imapp(app);
    if(!im.valid()){
      console.log("I don't know about this application:",app);
      return;
    }

    if(!im.supported()){
      console.log("I don't know how to import",app,"keys on",process.platform);
      return;
    }

    if(!profilename) {
       console.log("Target profile name for import not specified!\n");
       return;
    }

    filename = im.keystore();
    console.log("looking for key-store:",filename);
    if(fs_existsSync(filename)){
      var profile = pm.loadProfile(profilename);
      //check if profile already exists - don't overwrite!
      if(profile){
        console.log("Profile '"+profilename+"' already exists. Please specify a different profile to import into.");
        return;
      }

       selectAccountToImport(filename,this.UI,function(privkey,password){
         var profile = pm.createProfile(profilename,{id:id,otr:program.otr});
         if(!profile){
            console.log("Error adding new profile.");
            return;
         }
         profile.openKeyStore(undefined,password).importKey(privkey);
         profile.save();

       });
    }else{
       console.log(app,"key-store file not found.");
    }
}

function selectAccountToImport(filename,UI,next){
    var UserFiles = require("../files").UserFiles;
    var source = {};
    var privkey;

    if( !(program.otr == "otr4-em" || program.otr == "otr4")){
        console.log("error: Only supported otr modules for import are otr4-em and otr4");
        return;
    }

    source.otrm = require("otr4-em");
    console.log("checking application files..");
    source.files = new UserFiles({
      keys:filename,
      fingerprints:path.join(os.tmpdir(),"tmp.fp"),
      instags:path.join(os.tmpdir(),"tmp.tag")
    },source.otrm.VFS());
    source.user = new source.otrm.User(source.files);

    console.log("Select an account to import:");
    var list = [];
    var accounts = source.user.accounts();
    accounts.forEach(function(account){
       list.push(account.protocol+":"+account.accountname);
    });

    program.choose(list,function(i){
        privkey = source.user.findKey(accounts[i].accountname,accounts[i].protocol).export();
        if(program.otr == 'otr4-em'){
          UI.enterNewPassword(function(password){
            next(privkey,password);
          });
        }else{
          next(privkey);
        }
    });
}
