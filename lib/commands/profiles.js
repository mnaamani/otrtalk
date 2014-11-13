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

    action = action || "list";
    switch(action){
        case 'list':
             pm.list();
             return;

        case 'info':
            if(pm.empty()) return console.log("No profiles found.");

            if(!profilename){
                if(pm.multiple()) {
                  console.log("Profile not specified.");
                  return;
                }
                profilename = pm.firstProfileName();
            }

            if(!pm.exists(profilename)) {
              console.log('Profile "'+profilename+'" not found.');
              return;
            }

            profile = pm.profile(profilename);
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
            return;

        case 'add':
            if(!profilename) return console.log("Profile not specified.");
            if(pm.exists(profilename)){
              console.log(profilename,"Profile already exists!");
              return;
            }
            if(!id) return console.log("No otrtalk id specified")

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

          return;

        case 'remove':
            if(pm.empty()) return console.log("No profiles exist.");
            if(!profilename){
                if(pm.multiple()) return console.log("Profile not specified.");
                profilename = pm.firstProfileName();
            }

            if(!pm.exists(profilename)) return console.log("Profile does not exist");
            program.confirm("**Are you sure you want to remove profile: "+profilename+" [y/n]? ",function(ok){
                 console.log(ok);
                 if(ok){
                   pm.remove(profilename);
                 }
            });
            return;
    }
}
