#!/usr/bin/env node
var OTRTALK_VERSION = "0.1.20";
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
var crypto = require("crypto");
var os = require("os");
var _ = require("underscore");
var imapp = require("./lib/imapp.js");
var tool = require("./lib/tool.js");

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
    .action( function(){
        got_command = true;
        command_profiles.apply(this,arguments);
     });

  program
    .command('buddies [list|remove] [buddy]')
    .description('manage buddies')
    .action( function(){
        got_command = true;
        command_buddies.apply(this,arguments);
     });

  program
    .command('import-key [pidgin|adium] [profile] [otrtalk-id]')
    .description('import a key from pidgin/adium into a new profile')
    .action( function(app,profile,id){
        got_command = true;
        command_import_key(app,profile,id);
    });

  program
    .command('im-buddies')
    .description('list pidgin and/or adium trusted buddies')
    .action( function(){
        got_command = true;
        command_im_buddies();
    });

  program
    .command('update')
    .description('check if we are running latest version')
    .action( function(){
        got_command = true;
        command_update_check();
    });

  program.parse(process.argv);
  process.stdin.on('end', shutdown );
  if(!got_command) {
    program.help();
  }
})();//process commands

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
    var profileManager = require("./lib/profiles");
    var otrm;

    getProfile(profileManager,use_profile,function(profile){
        if(!profile) process.exit();
        debug("-- <Profile>",profile.name);
        Talk.profile = profile;
        Talk.id = Talk.profile.id;//otrtalk id
        Talk.accountname = Talk.profile.accountname;
        Talk.protocol = Talk.profile.protocol;

        getBuddy(Talk.profile,buddy,Talk.MODE,function(buddy){
            if(!buddy) process.exit();
            Talk.buddy = buddy;
            Talk.buddyID = profile.buddyID(buddy);
            if(Talk.buddyID == profile.accountname){
                console.log("otrtalk id conflict. Profile and buddy have same otrtalk id.");
                process.exit();
            }
            debug("-- <Buddy>",Talk.buddy,Talk.buddyID);
            /* use otr module specified in profile */
            otrm = tool.load_otr(Talk.profile.otr);

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
                                Talk.trusted_fingerprints = imapp_fingerprints_parse();
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
              command_profiles('add', name, id);
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
                    command_profiles('add', name, id);
                });
            });
        }
    }
}

function getBuddy(profile,buddy,mode,next){
    var need_new_buddy = false;
    if(!buddy){
        if(profile.buddies.length){
            console.log('Select buddy:');
            var list = [];
            profile.buddies.forEach(function(bud){
                list.push( bud.alias+":"+bud.id );
            });
            program.choose(list, function(i){
                next( profile.buddies[i].alias );
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

function accessKeyStore(profile,buddy,vfs,create,next){
  if(vfs){
    //when using otr3-em and otr4-em otr modules we encrypt the files on the real file system
    //the AES 256bit encryption key and IV are derived from a password

    if(fs_existsSync(profile.keys)){
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
  profile.buddies.forEach(function(buddy){
        var fp_file = path.join(profile.fingerprints,buddy.alias);
        if(!fs_existsSync(fp_file)){
            buddies.push({
                alias:buddy.alias,
                username:buddy.id,
                fingerprint:''
            });
            return;
        }
        var buf = openEncryptedFile(fp_file,password);
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


/*
 *  profiles command
 */
function command_profiles(action, profilename, id){
    var pm = require("./lib/profiles");
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
                otrm = tool.load_otr(profile.otr);
                accessKeyStore(profile,undefined,(otrm.VFS?otrm.VFS():undefined),false,function(files){
                    if(files){
                        console.log(" == Keystore");
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
                        accessKeyStore(profile,undefined,(otrm.VFS?otrm.VFS():undefined),true,function(files){
                            if(files){
                              var user = new otrm.User( files );
                              //create the account and Key
                              ensureAccount(user,profile.accountname,profile.protocol,true,function(result,err){
                                if(err || result == 'not-found') {
                                    if(err) console.log("Error generating key.",err.message);
                                    process.exit();
                                }
                                if(result=='new'){
                                    files.save();
                                    pm.save(profile.name);
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

/*
 *  buddies command
 */
function command_buddies(action,buddy){
    var pm = require("./lib/profiles");
    var profile;
    profilename = program.profile;
    if(!action) action = 'list';
        switch(action){
            case 'remove':
                if(!buddy){ console.log("Buddy not specified.");return;}
                if(!pm.profiles() || !pm.profiles().length) return console.log("No profiles found.");
                if(!profilename){
                    if(pm.profiles().length>1) {console.log("Profile not specified.");return;}
                    profilename = pm.profiles()[0];
                }
                profile = pm.profile(profilename);
                if(!profile) {console.log('Profile "'+profilename+'" not found.');break;}
                if(profile.buddyID(buddy)){
                   program.confirm("Are you sure you want to remove buddy: "+buddy+" [y/n]? ",function(ok){
                       if(!ok) process.exit();
                       if(fs_existsSync(profile.buddyFingerprints(buddy))){
                           fs.unlink(profile.buddyFingerprints(buddy));
                       }
                       profile.removeBuddy(buddy);
                       console.log("removed buddy:",buddy);
                       process.exit();
                   });
                }else console.log("Buddy not found.");
                break;
            case 'list':
                if(!pm.profiles() || !pm.profiles().length) return console.log("No profiles found.");
                if(!profilename){
                    if(pm.profiles().length>1) {console.log("Profile not specified.");return;}
                    profilename = pm.profiles()[0];
                }
                profile = pm.profile(profilename);
                if(!profile) {console.log('Profile "'+profilename+'" not found.');break;}
                otrm = tool.load_otr(profile.otr);

                accessFingerprintsStore(profile,(otrm.VFS?otrm.VFS():undefined),function(buddies){
                    if(!buddies.length) process.exit();
                    var Table = require("cli-table");
                    var table = new Table({
                        head:['buddy','otrtalk id','fingerprint']
                    });
                    buddies.forEach( function(buddy){
                        var trusted = tool.validateFP(buddy.fingerprint);
                        table.push( [buddy.alias,buddy.username,trusted?trusted:''] );
                    });
                    console.log(" == Buddies");
                    console.log(table.toString());
                    process.exit();
                });
                break;
        }
}

/*
 * import-key command
 */
function command_import_key(app,profile,id){
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
    console.log("looking for keystore:",filename);
    if(fs_existsSync(filename)){
       do_import_key(filename,profile,id);
    }else{
       console.log("keystore file not found.");
    }
}

function do_import_key(filename,profilename,id){
    var UserFiles = require("./lib/files").UserFiles;
    var pm = require("./lib/profiles");
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
    source.files = new UserFiles({keys:filename,fingerprints:path.join(os.tmpdir(),"tmp.fp"),instags:path.join(os.tmpdir(),"tmp.tag")},null,source.vfs);
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
	      accessKeyStore(profile,null,target.vfs,true,function(user_files){
            target.files = user_files;
            if(target.files){
              try{
                target.user = new target.otrm.User(target.files);
                target.user.importKey(profile.name,"otrtalk",privkey.export());
                target.files.save();
                pm.save(profilename);
                profile.print();
                console.log(" == Keystore");
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
              console.log("error creating new keystore files.");
            }
        });
    });
}

function imapp_fingerprints_parse(override_app){
    var app;

    app = program.pidgin ? "pidgin" : app;
    app = program.adium  ? "adium"  : app;
    app = override_app || app;

    var im = new imapp(app);

    if(im.valid()){
      im.parseFingerprints();
    }

    return im;
}

/*
 * im-buddies command
 */
function command_im_buddies(){
  ['pidgin','adium'].forEach(function(app){
    var entries = imapp_fingerprints_parse().fingerprints();
    if(!entries.length) return;
    var Table = require("cli-table");
    var table = new Table({
        head:['username','accountname','protocol','fingerprint']
    });
    entries.forEach( function(buddy){
        var fp = tool.validateFP(buddy.fingerprint);
        table.push( [buddy.username,buddy.accountname,buddy.protocol,fp] );
    });
    console.log(" ==",app,"authenticated buddies ==");
    console.log(table.toString());
  });
}

function openEncryptedFile(filename,password){
    var buf = fs.readFileSync(filename);
    if(!password) return buf;
    try{
        var c = crypto.createDecipher('aes256', password);
        var output = c.update(buf.toString('binary'),'binary','binary')+c.final('binary');
        return (new Buffer(output,'binary'));
    }catch(e){
        console.log("Error accessing encrypted store:",e.message);
        process.exit();
    }
}

function command_update_check(){
    var https = require('https');
    https.get("https://raw.githubusercontent.com/mnaamani/node-otr-talk/master/package.json", function(res) {
      res.on('data', function(d) {
        var package = JSON.parse(d.toString());
        try{
        if(package.version === OTRTALK_VERSION){
            console.log("You have the latest version:", OTRTALK_VERSION);
        }else{
            console.log("installed version:",OTRTALK_VERSION);
            console.log("new version:",package.version,"is available to download.");

            console.log("Use the npm package manager to update: npm -g update otrtalk");
        }
        }catch(E){
            console.log("unable to check for updated version.");
        }
      });
    }).on('error', function(e) {
      console.log("github.com is unreachable.");
    });
}
