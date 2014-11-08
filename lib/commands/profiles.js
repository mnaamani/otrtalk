var tool = require("../tool.js");
var program = require('../commander.js');

module.exports = Command;

function Command(ui){
  this.UI = ui;
}

Command.prototype.exec = function (action, profilename, id){
    var UI = this.UI;
    var Profiles = require("../profiles.js");
    var pm = new Profiles();
    var profile;
    var otrm;

    profilename = profilename || program.profile;
    if(!action){
           pm.list();
    }else{
        switch(action){
            case 'list':
                 pm.list();
                 break;
            case 'info':
                if(!pm.profiles() || !pm.profiles().length) return console.log("No profiles found.");
                if(!profilename){
                    if(pm.profiles().length>1) {console.log("Profile not specified.");return;}
                    profilename = pm.profiles()[0];
                }
                profile = pm.profile(profilename);
                if(!profile) {console.log('Profile "'+profilename+'" not found.');break;}
                profile.print();
                otrm = tool.load_otr(profile.otr());
                UI.accessKeyStore(profile,undefined,(otrm.VFS?otrm.VFS():undefined),false,function(files){
                    if(files){
                        console.log(" == Key-store");
                        var Table = require("cli-table");
                        var table = new Table({
                            head:['accountname','protocol','fingerprint']
                        });
                        var user = new otrm.User( files );
                        user.accounts().forEach(function(account){
                            table.push([account.accountname,account.protocol,account.fingerprint]);
                        });
                        console.log(table.toString());
                        process.exit();
                    }
                });
                break;
            case 'add':
                if(!profilename) {console.log("Profile not specified.");return;}
                profile = pm.profile(profilename);
                if(!profile){
                    if(!id){ console.log("No otrtalk id specified"); break;}
                    //create profile with default settings..
                    profile = pm.add(profilename,{
                     id:id,
                     otr:program.otr
                    },false,true);
                    if(profile) {
                        otrm = tool.load_otr(program.otr);
                        UI.accessKeyStore(profile,undefined,(otrm.VFS?otrm.VFS():undefined),true,function(files){
                            if(files){
                              var user = new otrm.User( files );
                              //create the account and Key
                              UI.ensureAccount(user,profile.accountname(),profile.protocol(),true,function(result,err){
                                if(err || result == 'not-found') {
                                    if(err) console.log("Error generating key.",err.message);
                                    process.exit();
                                }
                                if(result=='new'){
                                    files.save();
                                    profile.save();
                                    profile.print();
                                    console.log(" == Generated Key");
                                    var Table = require("cli-table");
                                    var table = new Table({
                                        head:['accountname','protocol','fingerprint']
                                    });
                                    user.accounts().forEach(function(account){
                                        table.push([account.accountname,account.protocol,account.fingerprint]);
                                    });
                                    console.log(table.toString());
                                    process.exit();
                                }
                              });
                            }else{
                                 process.exit();
                            }
                        });

                    }else{
                        console.log("Failed to create profile.");
                        process.exit();
                    }

                }else {
                    console.log(profilename,"Profile already exists!");
                    process.exit();
                }
                break;
            case 'remove':
                if(!pm.profiles() || !pm.profiles().length) return console.log("No profiles found.");
                if(!profilename){
                    if(pm.profiles().length>1) {console.log("Profile not specified.");return;}
                    profilename = pm.profiles()[0];
                }
                profile = pm.profile(profilename);
                if(profile){
                   program.confirm("**Are you sure you want to remove profile: "+profilename+" [y/n]? ",function(ok){
                       if(ok){
                         pm.remove(profilename);
                         process.exit();
                       }else process.exit();
                   });
                }else{
                    console.log("Profile does not exist");
                }
                break;
        }
    }
}
