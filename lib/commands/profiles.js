var program = require('../commander.js');

module.exports = Command;

function Command(ui){
  this.UI = ui;
}

Command.prototype.exec = function (action, profilename, id){
    var UI = this.UI;
    var pm = require("../profiles.js")();

    var profile,keystore;

    action = action || "list";

    function openKeyStore(need_password,next){
      if(need_password){
        UI.enterPassword(function(password){
          next(password);
        });
      }else{
        next();
      }
    }

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

            openKeyStore(profile.needPassword(),function(password){
              profile.openKeyStore(undefined,password).print(" == Key-store");
            });

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
                      keystore = profile.openKeyStore(undefined,password);
                      keystore.generateKey(function(err){
                          if(err) return;
                          profile.print();
                          keystore.print(" == Generated Key");
                          profile.save();
                      });
                }
              });
              return;
            }
            keystore = profile.openKeyStore();
            keystore.generateKey(function(err){
                if(err) return;
                profile.print();
                keystore.print(" == Generated Key");
                profile.save();
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
                 if(ok){
                   pm.remove(profilename);
                 }
            });
            return;
    }
}
