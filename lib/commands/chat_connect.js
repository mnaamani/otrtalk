var async = require("async");
var program = require("../commander");
var fs = require("fs");
var path = require("path");
var assert = require("assert");
var SessionManager = require("../sessions");
var Chat = require("../chat");
var fs_existsSync = fs.existsSync || path.existsSync;
var fcrypto = require("../file_crypto.js");
var os = require("os");
var imapp = require("../imapp.js");
var tool = require("../tool.js");

module.exports = Command;

function debug(){
    if(program.verbose) console.log.apply(console,arguments);
}

function shutdown(){
    setTimeout(function(){
       process.exit();
    },300);
}

function Command(ui){
  this.UI = ui;
}


Command.prototype.exec = function (name,buddy,mode){
    var UI = this.UI;
    var Profiles = require("../profiles");
    var pm = new Profiles();
    var Parameters = {};

    function getProfile(pm, name, next){
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
      if(profile.needPassword()){
          UI.enterPassword(function(password){
            profile.openKeyStore(buddy,password);
            next();
          });
          return;
      }
      profile.openKeyStore(buddy);
      next();
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

    getProfile(pm,name,function(profile){
        if(!profile) return;

        getBuddy(profile,buddy,function(buddy){
            if(!buddy) return;

            if(profile.buddyID(buddy) == profile.id()){
                console.log("otrtalk id conflict. Profile and buddy have same otrtalk id.");
                return;
            }
            Parameters.buddy = buddy;

            openKeyStore(profile,buddy,function(){
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
              Parameters.mode = mode;
              Parameters.network = "telehash";

              if(program.broadcast){
                      Parameters.network = "broadcast";
              }else if(program.lan || program.host){
                      Parameters.network = "local-telehash";
              }

              //esnure fingerprint if entered as option is correctly formatted
              if(mode == 'connect'){
                if(program.fingerprint && !tool.validateFP(program.fingerprint)){
                  console.log("Invalid fingerprint provided");
                  return;
                }
                Parameters.fingerprint = tool.validateFP(program.fingerprint);
                if(program.pidgin || program.adium){
                    debug("parsing IM app fingerprints");
                    Parameters.trusted_fingerprints = new imapp().parseFingerprints();
                }
              }

              //ensure we have a secret if we are in connect mode.
              smpSecret(mode,program.secret,function(secret){
                Parameters.secret = secret;
                startTalking(profile,Parameters);
              });
          });
        });
      });
}


function startTalking(profile,talk){
    var network = require("../discovery/"+talk.network);

    talk.link = new network.Link(profile.id(), profile.buddyID(talk.buddy));

    debug("initiating network...");
    network.init(program.interface, function(){
        console.log("[",talk.mode,"mode ] contacting:",talk.buddy,"..");
        talk.link.connect(function( peer ){
            if(Chat.ActiveSession() || talk.found_buddy ){
              peer.disconnectLater();
              return;
            }
            incomingConnection(profile,talk,peer);
        });
    },program.host?42424:undefined);
}

function incomingConnection(profile,talk,peer){
  
    var session = new SessionManager.TalkSession({
            mode:function(){ return talk.mode },
            accountname : profile.accountname(),
            protocol : profile.protocol(),
            buddy : talk.buddy,
            buddyID : profile.buddyID(talk.buddy),
            user : profile._user,
            files : profile._userFiles,
            secret : talk.secret,
            buddyFP : talk.fingerprint,
            trustedFP: talk.trusted_fingerprints,
            verbose : program.verbose
        }, profile.OTR(), peer);

    session.on("auth",function(trust){
      console.log("auth event");
       if(!talk.auth_queue) talk.auth_queue = async.queue(handleAuth,1);
       talk.auth_queue.push({session:session,talk:talk,peer:peer,trust:trust});
    });

    session.on("closed",function(){
      console.log("closed event");
        if(Chat.ActiveSession() == this) shutdown();
        if(this._on_auth_complete) this._on_auth_complete();
    });

    session.on("start_chat",function(){
        if(talk.mode=='connect') this.writeAuthenticatedFingerprints();
        startChat(talk,this);
    });

    session.start();
}

function handleAuth(_,callback){
    var session = _.session,
        talk = _.talk,
        trust = _.trust,
        peer = _.peer;

    if(talk.found_buddy){
        session.end();
        callback();
        return;
    }

    debug("[authenticated connection]");
    session._on_auth_complete = callback;
    switch( talk.mode ){
        case 'chat':
            assert(trust.Trusted && !trust.NewFingerprint);
            session.go_chat();
            break;

        case 'connect':
           if(trust.NewFingerprint){
            console.log("You have connected to someone who claims to be",talk.buddyID);
            console.log("They know the authentication secret.");
            console.log("Their public key fingerprint:\n");
            console.log("\t"+session.fingerprint());
            program.confirm("\nDo you want to trust this fingerprint [y/n]? ",function(ok){
                if(!ok){
                    console.log("rejecting fingerprint.");
                    session.end();
                }else{
                    if(session.ending){
                        //remote rejected, and closed the session
                        console.log("session closed, fingerprint not saved.");
                        return;
                    }
                    console.log("accepted fingerprint.");
                    session.go_chat();
                }
            });
          }else if(trust.Trusted){
            //we used connect mode and found an already trusted fingerprint...
            session.go_chat();
          }
          break;
     }
}

function startChat(talk,session){
   talk.link.pause();
   talk.mode = 'chat';
   talk.found_buddy = true;
   if(session._on_auth_complete) session._on_auth_complete();
   delete session._on_auth_complete;
   console.log('-----------------------------------------------');
   console.log('connected to:',session.remote());
   console.log('buddy fingerprint:',session.fingerprint());
   console.log('-----------------------------------------------');
   Chat.attach(talk,session);
}
