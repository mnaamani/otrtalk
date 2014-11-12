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

    if(!action){
       pm.list();
       return;
    }

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

            if(profile.needPassword()){
              UI.enterPassword(function(password){
                profile.openKeyStore(undefined,password);
                console.log(" == Key-store");
                profile.printAccounts();
              });
              return;
            }
            profile.openKeyStore();
            console.log(" == Key-store");
            profile.printAccounts();
            break;

        case 'add':
            if(!profilename) {console.log("Profile not specified.");break;}
            profile = pm.profile(profilename);
            if(profile){
              console.log(profilename,"Profile already exists!");
              break;
            }
            if(!id){ console.log("No otrtalk id specified"); break;}

            profile = pm.add(profilename,{
              id:id,
              otr:program.otr
            });

            if(profile.needPassword()){
              //first time double prompt for new password.
              UI.enterNewPassword(function(password){
                if(password){
                      profile.generateKey(password,function(err,profile){
                          if(err) return;
                          profile.print();console.log(" == Generated Key");
                          profile.printAccounts();
                      });
                }
              });
              return;
            }
            profile.generateKey(undefined,function(err,profile){
                if(err) return;
                profile.print();console.log(" == Generated Key");
                profile.printAccounts();
            });

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
