var async = require("async");
var program = require("../commander");
var fs = require("fs");
var path = require("path");
var fs_existsSync = fs.existsSync || path.existsSync;
var imapp = require("../imapp.js");
var tool = require("../tool.js");
var talk = require("../talk.js");

module.exports = Command;

function debug(){
    if(program.verbose) console.log.apply(console,arguments);
}

function Command(ui){
  this.UI = ui;
}


Command.prototype.exec = function (name,buddy,mode){
    var UI = this.UI;
    var pm = require("../profile_manager.js");
    var settings = {};
    settings.verbose = program.verbose;
    settings.interface = program.interface;
    settings.host = program.host;

    function getProfile(name, next){
        var list = [];
        if(name){
          if(pm.exists(name)) return next(pm.profile(name));

          console.log("Profile [",name,"] doesn't exist.");
          program.confirm("  create it now [y/n]? ",function(ok){
            if(ok){
              console.log("Enter the otrtalk id for this profile. This is a public name that you give out to your buddies.");
              program.prompt("  otrtalk id: ",function(id){
                  if(!id) return;
                  var cmd = require("./profiles.js");
                  var _cmd = new cmd(UI);
                  _cmd.exec('add', name, id);
              });
            }
          });
          return;
        }

        //no profile specified
        if(pm.count() == 1){
            //use the single profile found
            next(pm.profile(pm.firstProfileName()));
            return;
        }

        var list = [];
        if(pm.multiple()){
            //show a list selection of profiles to choose from.
            pm.profiles().forEach(function(prof){
                list.push(prof);
            });
            console.log("Select a profile:");
            program.choose(list, function(i){
                next(pm.profile(list[i]));
            });
            return;
        }

        //no profiles exist at all.. create a new one
        console.log("No profile exists, let's create one now.");
        program.prompt("  profile name: ",function(name){
            console.log("Enter an otrtalk id for this profile.\nThis is a public name that you give out to your buddies.");
            program.prompt("  otrtalk id: ",function(id){
                if(!id) return;
                var cmd = require("./profiles.js");
                var _cmd = new cmd(UI);
                _cmd.exec('add', name, id);
            });
        });
    }

    function getBuddy(profile,buddy,next){
        var list = [];

        if(buddy){
            var buddyID = profile.buddyID(buddy);
            if(buddyID){
                return next(buddy);
            }
            console.log("Buddy not found.");
            program.confirm("  add ["+buddy+"] to your buddy list now [y/n]? ",function(ok){
                if(ok){
                    program.prompt("  "+buddy+"'s otrtalk id: ", function(id){
                      if(!id) return;
                      profile.addBuddy(buddy,id);
                      next(buddy);
                    });
                }else next();
            });
            return;
        }

        if(profile.buddies().length){
            console.log('Select buddy:');
            profile.buddies().forEach(function(bud){
                list.push( bud.alias+":"+bud.id );
            });
            program.choose(list, function(i){
                next(profile.buddies()[i].alias);
            });
            return;
        }

        console.log("No buddy specified, and your buddy list is empty.");
        console.log("Enter new buddy details:");
        program.prompt("  alias: ",function(buddy){
            program.prompt("  "+buddy+"'s otrtalk id: ", function(id){
                if(!id) return;
                profile.addBuddy(buddy,id);
                next(buddy);
            });
        });
    }

    function openKeyStore(profile,buddy,next){
      var keystore;
      if(profile.needPassword()){
          UI.enterPassword(function(password){
            keystore = profile.openKeyStore(buddy,password);
            next(keystore);
          });
          return;
      }
      keystore = profile.openKeyStore(buddy);
      next(keystore);
    }

    function smpSecret(mode,secret,next){
      if(mode =='connect' && !secret){
        console.log("When establishing a new trust with a buddy you must provide a shared secret.");
        console.log("This will be used by SMP authentication during connection establishment.");
        program.password("Enter SMP secret: ","",function(secret){
            next(secret);
        });
      }else{
        next(secret);
      }
    }

    getProfile(name,function(profile){
        if(!profile) return;
        settings.id = profile.id();

        getBuddy(profile,buddy,function(buddy){
            if(!buddy) return;

            if(profile.buddyID(buddy) == profile.id()){
                console.log("otrtalk id conflict. Profile and buddy have same otrtalk id.");
                return;
            }
            settings.buddy = buddy;
            settings.buddyID = profile.buddyID(buddy);

            openKeyStore(profile,buddy,function(keystore){
              //if the fingerprints file exists.. we have already trusted buddy fingerprint
              if(fs_existsSync(profile.buddyFingerprints(buddy))){
                  if(mode=='connect'){
                      debug("You already have a trust with this buddy.\nSwitching to 'chat' mode.");
                      mode = 'chat';
                  }
              }else{
                  if(mode=='chat'){
                      debug("You haven't yet established a trust with this buddy.\nSwitching to 'connect' mode.");
                      mode = 'connect';
                  }
              }

              settings.mode = mode;
              settings.network = "telehash";

              if(program.broadcast){
                      settings.network = "broadcast";
              }else if(program.lan || program.host){
                      settings.network = "local-telehash";
              }

              //esnure fingerprint if entered as option is correctly formatted
              if(mode == 'connect'){
                if(program.fingerprint && !tool.validateFP(program.fingerprint)){
                  console.log("Invalid fingerprint provided");
                  return;
                }
                settings.fingerprint = tool.validateFP(program.fingerprint);
                if(program.pidgin || program.adium){
                    debug("parsing IM app fingerprints");
                    settings.trusted_fingerprints = new imapp().parseFingerprints();
                }
              }

              //ensure we have a secret if we are in connect mode.
              smpSecret(mode,program.secret,function(secret){
                settings.secret = secret;
                talk.launch(settings,keystore.otrSessionMaker(secret));
              });
          });
        });
      });
}
