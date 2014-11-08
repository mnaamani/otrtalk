var async = require("async");
var program = require("../commander");
var fs = require("fs");
var path = require("path");
var assert = require("assert");
var Network;
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

function Command(ui){
  this.UI = ui;
}


Command.prototype.exec = function (use_profile,buddy,talk_mode){
    var UI = this.UI;
    var Talk = {};
    Talk.MODE = talk_mode;
    var Profiles = require("../profiles");
    var pm = new Profiles();
    var otrm;

    UI.getProfile(pm,use_profile,function(profile){
        if(!profile) process.exit();
        debug("-- <Profile>",profile.name());
        Talk.profile = profile;
        Talk.id = Talk.profile.id();//otrtalk id
        Talk.accountname = Talk.profile.accountname();
        Talk.protocol = Talk.profile.protocol();

        UI.getBuddy(Talk.profile,buddy,function(buddy){
            if(!buddy) process.exit();
            Talk.buddy = buddy;
            Talk.buddyID = profile.buddyID(buddy);
            if(Talk.buddyID == profile.id()){
                console.log("otrtalk id conflict. Profile and buddy have same otrtalk id.");
                process.exit();
            }
            debug("-- <Buddy>",Talk.buddy,Talk.buddyID);
            /* use otr module specified in profile */
            otrm = tool.load_otr(Talk.profile.otr());

            //access keystore - account and must already have been created
            UI.accessKeyStore(Talk.profile,Talk.buddy,(otrm.VFS ? otrm.VFS() : undefined),true,function(files){
                if(!files) process.exit();
                Talk.files = files;
                Talk.user = new otrm.User(Talk.files);
                UI.ensureAccount(Talk.user,Talk.accountname,Talk.protocol,false,function(result){
                    if(result == 'not-found'){
                        console.log("Error: Accessing Account.");
                        process.exit();
                    }

                    UI.ensureInstag(Talk.user,Talk.accountname,Talk.protocol,function(result,err){
                        if(result=='error'){
                            console.log("Error: Unable to get instance tag.",err);
                            process.exit();
                        }
                        if(result=='new') Talk.files.save();//save newly created instance tag
                        debug("-- <OTR Key>",Talk.user.fingerprint(Talk.accountname,Talk.protocol));

                        //clear userstate.. (new one will be created for each incoming connection)
                        Talk.user.state.free();
                        delete Talk.user.state;
                        delete Talk.user;

                        //if the fingerprints file exists.. we have already trusted buddy fingerprint
                        if( fs_existsSync(Talk.files.fingerprints) ){
                            if(talk_mode=='connect'){
                                debug("You already have a trust with this buddy.\nSwitching to 'chat' mode.");
                                Talk.MODE = talk_mode = 'chat';
                            }
                        }else{
                            if(talk_mode=='chat'){
                                debug("You haven't yet established a trust with this buddy.\nSwitching to 'connect' mode.");
                                Talk.MODE = talk_mode = 'connect';
                            }
                        }

                        if(program.broadcast){
                                debug("-- <Network mode> LAN Broadcast");
                                Network = require("../discovery/broadcast");
                        }else if(program.lan || program.host){
                                debug("-- <Network mode> Telehash <local>");
                                Network = require("../discovery/local-telehash");
                        }else{
                                debug("-- <Network mode> Telehash <global>");
                                Network = require("../discovery/telehash");
                        }

                        //esnure fingerprint if entered as option is correctly formatted
                        ensureFingerprint(program.fingerprint,function(valid_fingerprint){
                          if(talk_mode == 'connect'){
                            if(program.fingerprint && !valid_fingerprint){
                              console.log("Invalid fingerprint provided");
                              process.exit();
                            }
                            if(valid_fingerprint){
                                Talk.fingerprint = valid_fingerprint;
                                debug("Will look for buddy with fingerprint:",Talk.fingerprint);
                            }
                            if(program.pidgin || program.adium){
                                debug("parsing IM app fingerprints");
                                Talk.trusted_fingerprints = new imapp().parseFingerprints();
                            }
                          }
                          //ensure we have a secret if we are in connect mode.
                          if(talk_mode =='connect' && !program.secret){
                            console.log("When establishing a new trust with a buddy you must provide a shared secret.");
                            console.log("This will be used by SMP authentication during connection establishment.");
                            program.password("Enter SMP secret: ","",function(secret){
                               Talk.secret = secret;
                               startTalking(Talk,otrm);
                            });
                          }else{
                            Talk.secret = program.secret;
                            startTalking(Talk,otrm);
                          }
                        });
                    });
                });
            });
        });
    });
}


function startTalking(talk,otrm){
    talk.link = new Network.Link(talk.id || talk.accountname, talk.buddyID);

    debug("initiating network...");
    Network.init(program.interface, function(){
        console.log("[",talk.MODE,"mode ] contacting:",talk.buddy,"..");
        talk.link.connect(function( peer ){
            if(Chat.ActiveSession() || talk.found_buddy ){
              peer.disconnectLater();
              return;
            }
            incomingConnection(talk,peer,otrm);
        });
    },program.host?42424:undefined);
}

function incomingConnection(talk,peer,otrm){
    var session = new SessionManager.TalkSession({
            mode:function(){ return talk.MODE },
            accountname : talk.accountname,
            protocol : talk.protocol,
            buddy : talk.buddy,
            buddyID : talk.buddyID,
            files : talk.files,
            secret : talk.secret,
            buddyFP : talk.fingerprint,
            trustedFP: talk.trusted_fingerprints,
            verbose : program.verbose
        }, otrm, peer);

    session.on("auth",function(trust){
       if(!talk.auth_queue) talk.auth_queue = async.queue(handleAuth,1);
       talk.auth_queue.push({session:session,talk:talk,peer:peer,trust:trust});
    });

    session.on("closed",function(){
        if(Chat.ActiveSession() == this) shutdown();
        if(this._on_auth_complete) this._on_auth_complete();
    });

    session.on("start_chat",function(){
        if(talk.MODE=='connect') this.writeAuthenticatedFingerprints();
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
    switch( talk.MODE ){
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
   talk.MODE = 'chat';
   talk.found_buddy = true;
   if(session._on_auth_complete) session._on_auth_complete();
   delete session._on_auth_complete;
   console.log('-----------------------------------------------');
   console.log('connected to:',session.remote());
   console.log('buddy fingerprint:',session.fingerprint());
   console.log('-----------------------------------------------');
   Chat.attach(talk,session);
}

function ensureFingerprint(fp, next){
    if(fp){
        next(tool.validateFP(fp));
        //force fingerpint entry in connect mode?
    }else next();
};
