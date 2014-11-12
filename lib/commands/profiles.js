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
                var user = profile.openKeyStore(undefined,password);
                console.log(" == Key-store");
                printAccounts(user);
              });
              return;
            }
            var user = profile.openKeyStore();
            console.log(" == Key-store");
            printAccounts(user);
            break;

        case 'add':
            if(!profilename) {console.log("Profile not specified.");break;}
            profile = pm.profile(profilename);
            if(profile){
              console.log(profilename,"Profile already exists!");
              break;
            }
            if(!id){ console.log("No otrtalk id specified"); break;}

            if(program.otr == 'otr4-em'){
              //first time double prompt for new password.
              UI.enterNewPassword(function(password){
                if(password){
                      pm.add(profilename,{
                        id:id,
                        otr:program.otr
                      },password,function(err,profile,user){
                          if(err) return;
                          profile.print();console.log(" == Generated Key");
                          printAccounts(user);
                      });
                }
              });
          }else{
            pm.add(profilename,{
              id:id,
              otr:program.otr
            },undefined,function(err,profile,user){
                if(err) return;
                profile.print();console.log(" == Generated Key");
                printAccounts(user);
            });
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

function printAccounts(user){
  var Table = require("cli-table");
  var table = new Table({
      head:['accountname','protocol','fingerprint']
  });
  user.accounts().forEach(function(account){
      table.push([account.accountname,account.protocol,account.fingerprint]);
  });
  console.log(table.toString());
}
