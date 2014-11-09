var fs = require("fs");
var path = require("path");
var fs_existsSync = fs.existsSync || path.existsSync;
var os = require("os");
var imapp = require("../imapp.js");
var tool = require("../tool.js");
var program = require('../commander.js');

module.exports = Command;

function Command(ui){
  this.UI = ui;
}

Command.prototype.exec = function(app,profile,id){
    var filename;
    profile = profile || program.profile;

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

    if(!profile) {
       console.log("Target profile name for import not specified!\n");
       return;
    }

    filename = im.keystore();
    console.log("looking for key-store:",filename);
    if(fs_existsSync(filename)){
       import_key(filename,profile,id,this.UI);
    }else{
       console.log("key-store file not found.");
    }
}

function import_key(filename,profilename,id,UI){
    var UserFiles = require("../files").UserFiles;
    var Profiles = require("../profiles");
    var pm = new Profiles();
    var target = {};
    var source = {};
    var privkey;
    var profile;

    //check if profile already exists - don't overwrite!
    if(pm.profile(profilename)){
      console.log("Profile '"+profilename+"' already exists. Please specify a different profile to import into.");
      return;
    }

    if( !(program.otr == "otr4-em" || program.otr == "otr4")){
        console.log("error: Only supported otr modules for import are otr4-em and otr4");
        return;
    }

    source.otrm = require("otr4-em");
    source.vfs = source.otrm.VFS();
    console.log("checking application files..");
    source.files = new UserFiles({
      keys:filename,
      fingerprints:path.join(os.tmpdir(),"tmp.fp"),
      instags:path.join(os.tmpdir(),"tmp.tag")
    },source.vfs);
    source.user = new source.otrm.User(source.files);

    console.log("Select an account to import:");
    var list = [];
    var accounts = source.user.accounts();
    accounts.forEach(function(account){
       list.push(account.protocol+":"+account.accountname);
    });
    program.choose(list,function(i){
        profile = pm.add(profilename,{id:id,otr:program.otr},false,true);
        if(!profile){
            console.log("Error adding new profile.");
            return;
        }
        privkey = source.user.findKey(accounts[i].accountname,accounts[i].protocol);
        target.otrm = tool.load_otr(program.otr);
        target.vfs = target.otrm.VFS ? target.otrm.VFS() : undefined;
        UI.accessKeyStore(profile,null,target.vfs,true,function(user_files){
            target.files = user_files;
            if(target.files){
              try{
                target.user = new target.otrm.User(target.files);
                target.user.importKey(profile.name(),"otrtalk",privkey.export());
                target.files.save();
                profile.save();
                profile.print();
                console.log(" == Key-store");
                var Table = require("cli-table");
                var table = new Table({
                    head:['accountname','protocol','fingerprint']
                });
                target.user.accounts().forEach(function(account){
                   table.push([account.accountname,account.protocol,account.fingerprint]);
                });
                console.log(table.toString());
                console.log("Imported key successfully to profile:",profilename);
                process.exit();
                return;//success
              }catch(E){
                console.log("Key Import Failed!",E);
              }
            }else{
              console.log("error creating new key-store files.");
            }
        });
    });
}
