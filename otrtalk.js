#!/usr/bin/env node
var OTRTALK_VERSION = require("./lib/version.js").version;
/*
    This program is free software; you can redistribute it and/or modify
    it under the terms of version 2 of the GNU General Public License as published by
    the Free Software Foundation.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program. If not, see http://www.gnu.org/licenses/.

    The Off-the-Record Messaging library is
    Copyright (C) 2004-2012  Ian Goldberg, Rob Smits, Chris Alexander,
                      Willy Lew, Lisa Du, Nikita Borisov
                 <otr@cypherpunks.ca>
    https://otr.cypherpunks.ca/

    ENet Networking Library is Copyright (c) 2002-2013 Lee Salzman
*/

var async = require("async");
var program = require("./lib/commander");
var fs = require("fs");
var path = require("path");
var assert = require("assert");
var Network;
var SessionManager = require("./lib/sessions");
var Chat = require("./lib/chat");
var fs_existsSync = fs.existsSync || path.existsSync;
var fcrypto = require("./lib/file_crypto.js");
var os = require("os");
var _ = require("underscore");
var imapp = require("./lib/imapp.js");
var tool = require("./lib/tool.js");
var UI = {};

process.title = "otrtalk";

function init_stdin_stderr(){
    (function(stderr){
     process.__defineGetter__('stderr', function(){
        return {write:function(){
            if(program.stderr) stderr.write.apply(stderr,arguments);
        }};
     });
    })(process.stderr);

    if(process.platform!='win32') process.on('SIGINT',function(){
        shutdown();
    });
}

function debug(){
    if(program.verbose) console.log.apply(console,arguments);
}

function shutdown(){
    if( this._exiting ){ return; } else { this._exiting = true; }

    if( Network ) Network.shutdown();

    setTimeout(function(){
       process.exit();
    },300);
}

/*
    connect and chat commands
*/
function command_connect_and_chat(use_profile,buddy,talk_mode){
    var Talk = {};
    Talk.MODE = talk_mode;
    var Profiles = require("./lib/profiles");
    var pm = new Profiles();
    var otrm;

    getProfile(pm,use_profile,function(profile){
        if(!profile) process.exit();
        debug("-- <Profile>",profile.name());
        Talk.profile = profile;
        Talk.id = Talk.profile.id();//otrtalk id
        Talk.accountname = Talk.profile.accountname();
        Talk.protocol = Talk.profile.protocol();

        getBuddy(Talk.profile,buddy,function(buddy){
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
            accessKeyStore(Talk.profile,Talk.buddy,(otrm.VFS ? otrm.VFS() : undefined),true,function(files){
                if(!files) process.exit();
                Talk.files = files;
                Talk.user = new otrm.User(Talk.files);
                ensureAccount(Talk.user,Talk.accountname,Talk.protocol,false,function(result){
                    if(result == 'not-found'){
                        console.log("Error: Accessing Account.");
                        process.exit();
                    }

                    ensureInstag(Talk.user,Talk.accountname,Talk.protocol,function(result,err){
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
                                Network = require("./lib/discovery/broadcast");
                        }else if(program.lan || program.host){
                                debug("-- <Network mode> Telehash <local>");
                                Network = require("./lib/discovery/local-telehash");
                        }else{
                                debug("-- <Network mode> Telehash <global>");
                                Network = require("./lib/discovery/telehash");
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
}

function getProfile( pm, name, next ){
    var profile;
    if(name){
      profile = pm.profile(name);
      if(profile) return next(profile);
      console.log("Profile [",name,"] doesn't exist.");
      program.confirm("  create it now [y/n]? ",function(ok){
        if(ok){
          console.log("Enter the otrtalk id for this profile. This is a public name that you give out to your buddies.");
          program.prompt("  otrtalk id: ",function(id){
              if(!id) {next();return;}
              var cmd = require("./lib/commands/profiles.js");
              var _cmd = new cmd(UI);
              _cmd.exec('add', name, id);
            });
        }else next();
      });
    }else{
        //no profile specified
        if(pm.profiles().length == 1){
            //use the single profile found
            next( pm.profile( pm.profiles()[0]) );

        }else if(pm.profiles().length > 1){
            //show a list selection of profiles to choose from.
            var list = [];
            pm.profiles().forEach(function(prof){
                list.push( prof );
            });
            console.log("Select a profile:");
            program.choose(list, function(i){
                next(pm.profile(list[i]));
            });
        }else{
            //no profiles exist at all.. create a new one
            console.log("No profile exists, let's create one now.");
            program.prompt("  profile name: ",function(name){
                console.log("Enter an otrtalk id for this profile.\nThis is a public name that you give out to your buddies.");
                program.prompt("  otrtalk id: ",function(id){
                    if(!id) {next();return;}
                    var cmd = require("./lib/commands/profiles.js");
                    var _cmd = new cmd(UI);
                    _cmd.exec('add', name, id);
                });
            });
        }
    }
}

function getBuddy(profile,buddy,next){
    var need_new_buddy = false;
    if(!buddy){
        if(profile.buddies().length){
            console.log('Select buddy:');
            var list = [];
            profile.buddies().forEach(function(bud){
                list.push( bud.alias+":"+bud.id );
            });
            program.choose(list, function(i){
                next( profile.buddies()[i].alias );
            });
        }else{
            console.log("No buddy specified, and your buddy list is empty.");
            need_new_buddy = true;
        }
    }else{
        var buddyID = profile.buddyID(buddy);
        if(buddyID){
            next(buddy);
            return;
        }
        console.log("Buddy not found.");
        program.confirm("  add ["+buddy+"] to your buddy list now [y/n]? ",function(ok){
            if(ok){
                program.prompt("  "+buddy+"'s otrtalk id: ", function(id){
                  if(!id) {next();return;}
                  profile.addBuddy(buddy,id);
                  next(buddy);
                });
            }else next();
        });
    }

    if(need_new_buddy) {
        console.log("Enter new buddy details:");
        program.prompt("  alias: ",function(buddy){
            program.prompt("  "+buddy+"'s otrtalk id: ", function(id){
                if(!id) {next();return;}
                profile.addBuddy(buddy,id);
                next(buddy);
            });
        });
    }
}

UI.accessKeyStore = accessKeyStore;

function accessKeyStore(profile,buddy,vfs,create,next){
  if(vfs){
    //when using otr3-em and otr4-em otr modules we encrypt the files on the real file system
    //the AES 256bit encryption key and IV are derived from a password

    if(fs_existsSync(profile.keys())){
        //assume already encrypted from previous session.
        //ask once for password.
         program.password('enter key-store password: ', '', function(password){
            openKeyStore(profile,buddy,vfs,password,next);
         });

    }else{
        if(create){
        //first time double prompt for new password.
        console.log("Your keys are stored in an encrypted key-store, protected with a password.");
        console.log("** Pick a long password to protect your keys in case the key-store is stolen **");
        program.password('new key-store password: ', '', function(password){
        program.password('      confirm password: ', '', function(password_confirm){
                if(password !== password_confirm){
                    console.log("password mismatch!");
                    next();
                }else{
                    openKeyStore(profile,buddy,vfs,password,next);
                }
             });
        });
        }else{
            next();
        }
    }
  }else{
    openKeyStore(profile,buddy,undefined,undefined,next);
  }
}
function openKeyStore(profile,buddy,vfs,password,next){
  var UserFiles = require("./lib/files").UserFiles;
  var files = new UserFiles(profile, buddy, vfs, password );
  next(files);
}

UI.accessFingerprintsStore = accessFingerprintsStore;
function accessFingerprintsStore(profile,vfs,next){
  if(vfs){
      program.password('enter key-store password: ', '', function(password){
            openFingerprintsStore(profile,password,next);
      });
  }else{
      openFingerprintsStore(profile,undefined,next);
  }
}

function openFingerprintsStore(profile,password,next){
  var buddies = [];
  profile.buddies().forEach(function(buddy){
        var fp_file = path.join(profile.fingerprints(),buddy.alias);
        if(!fs_existsSync(fp_file)){
            buddies.push({
                alias:buddy.alias,
                username:buddy.id,
                fingerprint:''
            });
            return;
        }
        var buf = fcrypto.decryptFile(fp_file,password,"accessing key-store");
        var entry = buf.toString().split(/\s+/);
        if(entry[4]==='smp') buddies.push({
            alias:buddy.alias,
            username:entry[0],
            accountname:entry[1],
            protocol:entry[2],
            fingerprint:entry[3]
        });
  });
  next(buddies);
}

UI.ensureAccount = ensureAccount;
function ensureAccount(user,accountname,protocol,generate,next){
    if(!user.fingerprint( accountname, protocol)){
       if(generate){
           console.log("Generating your OTR key...");
           user.generateKey(accountname,protocol,function(err){
              if(err){
                next('error',err);
              }else{
                next('new');
              }
           });
      }else{
        //account not found..
        next('not-found');
      }
    }else next('found');
}

function ensureInstag(user,accountname,protocol,next){
    if(!user.findInstag) {next();return;}

    var instag = user.findInstag(accountname, protocol);
    if(instag) {next();return;}

    debug("creating instance tag.");
    user.generateInstag( accountname, protocol,function(err,instag){
       if(err){
          next('error',err);
       }else next('new');
    });
 }

(function(){
  var got_command = false;
  init_stdin_stderr();
  program
    .links("Report bugs: <https://github.com/mnaamani/node-otr-talk/issues>\n"+
             "Documentation: <https://github.com/mnaamani/node-otr-talk/wiki>")
    .version("otrtak "+OTRTALK_VERSION+"\nCopyright (C) 2013 Mokhtar Naamani <mokhtar.naamani@gmail.com>\n"+
             "This program is free software; you can redistribute it and/or modify it\n"+
             "under the terms of version 2 of the GNU General Public License as published by\n"+
             "the Free Software Foundation.\n"+
             "The Off-the-Record Messaging library is\n"+
             " Copyright (C) 2004-2012  Ian Goldberg, Rob Smits, Chris Alexander,\n"+
             "         Willy Lew, Lisa Du, Nikita Borisov\n"+
             "    <otr@cypherpunks.ca> https://otr.cypherpunks.ca/\n"+
             "\n"+
             "The ENet Networking Library is Copyright (c) 2002-2013 Lee Salzman\n\n"+
             "Report bugs: <https://github.com/mnaamani/node-otr-talk/issues>\n"+
             "Documentation: <https://github.com/mnaamani/node-otr-talk/wiki>")
    .option("-v, --verbose","verbose debug info")
    .option("-e, --stderr","more verbose")
    .option("-p, --profile <PROFILE>","use specified profile","")
    .option("-f, --fingerprint <FINGERPRINT>","buddy key fingerprint (connect mode)","")
    .option("-s, --secret <SECRET>","SMP authentication secret (connect mode)","")
    .option("-o, --otr <module>","otr4-em, otr4, otr3 (for new profiles) default:otr4-em","otr4-em")
    .option("-i, --interface <interface>","optional network interface to use for communication")
    .option("--pidgin","check pidgin buddylist for known fingerprints (connect mode)","")
    .option("--adium","check adium buddylist for known fingerprints (connect mode)","")
    .option("--lan","seed from local telehash switches on the LAN")
    .option("--host","act as a telehash seed for the LAN")
    .option("--broadcast","do broadcast LAN discovery");

  program
  .command('connect [buddy]')
  .description('establish new trust with buddy')
  .action(function(buddy){
    got_command = true;
    command_connect_and_chat(program.profile,buddy,'connect');
  });

  program
  .command('chat [buddy]')
  .description('chat with trusted buddy')
  .action(function(buddy){
    got_command = true;
    command_connect_and_chat(program.profile,buddy,'chat');
  });

  program
    .command('profiles [list|info|add|remove] [profile] [otrtalk-id]')
    .description('manage profiles')
    .action( function(action, profilename, id){
        got_command = true;
        var cmd = require("./lib/commands/profiles.js");
        var _cmd = new cmd(UI);
        _cmd.exec(action, profilename, id);
     });

  program
    .command('buddies [list|remove] [buddy]')
    .description('manage buddies')
    .action( function(action,buddy){
        got_command = true;
        var cmd = require("./lib/commands/buddies.js");
        var _cmd = new cmd(UI);
        _cmd.exec(action, buddy);
     });

  program
    .command('import-key [pidgin|adium] [profile] [otrtalk-id]')
    .description('import a key from pidgin/adium into a new profile')
    .action( function(app,profile,id){
        got_command = true;
        var cmd = require("./lib/commands/import-key.js");
        var _cmd = new cmd(UI);
        _cmd.exec(app,profile,id);
    });

  program
    .command('im-buddies')
    .description('list pidgin and/or adium trusted buddies')
    .action( function(){
        got_command = true;
        var cmd = require("./lib/commands/im-buddies.js");
        var _cmd = new cmd(UI);
        _cmd.exec();
    });

  program
    .command('update')
    .description('check if we are running latest version')
    .action( function(){
        got_command = true;
        var cmd = require("./lib/commands/update.js");
        var _cmd = new cmd(); _cmd.exec();
    });

  program.parse(process.argv);
  process.stdin.on('end', shutdown );
  if(!got_command) {
    program.help();
  }
})();//process commands
