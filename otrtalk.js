#!/usr/bin/env node

var program = require("commander");
var fs = require("fs");
var assert = require("assert");
var Network;
var SessionManager = require("./lib/sessions");
var Chat = require("./lib/chat");

var otr;
var otr_modules = {
    "3":"otr3",
    "4em":"otr4-em"
}
function OTR_INSTANCE(){
    if(otr) return otr;//only one global instance
    var otr_mod =  program.otr ? otr_modules[program.otr] : '4em';
    otr = otr_mod ? require(otr_mod) : undefined;
    return otr;
}

process.title = "otrtalk";

main();//process commands and options..

function main(){
  var got_command = false;
  init_stdin_stderr();
  program
    .version("0.0.1")
    .option("-p, --profile [profile]","profile to use in chat/connect modes. uses default if not specified","default")
    .option("-s, --secret [secret]","secret to use in connect mode for smp authentication","")
    .option("-o, --otr [module]","specify otr module to use","4em");

  program
  .command('connect [buddy]')
  .description('establish new trust with buddy')
  .action(function(buddy){
    got_command = true;
    otrtalk(program.profile,buddy,'connect');
  });

  program
  .command('chat [buddy]')
  .description('chat with trusted buddy')
  .action(function(buddy){
    got_command = true;
    otrtalk(program.profile,buddy,'chat');
  });

  program
    .command('profiles [list|info|add|remove] [profile] [otrtalk-id]')
    .description('manage profiles')
    .action( function(){
        got_command = true;
        profile_manage.apply(this,arguments);
     });

  program.parse(process.argv);
  process.stdin.on('end', shutdown );
  if(!got_command) {
    console.log("no command entered.");
    program.help();
  }
}

function init_stdin_stderr(){
    process.__defineGetter__('stderr', function(){
        return {write:function(){}};
    });
    if(process.platform!='win32') process.on('SIGINT',function(){
        shutdown();
    });
}

/////// CHAT and CONNECT commands handled both by otrtalk()
function otrtalk(use_profile,buddy,talk_mode){
    var Talk = {};
    Talk.MODE = talk_mode;
    var profileManager = require("./lib/profiles");
    process.stdout.write("\nprofile check: ");
    getProfile(profileManager,use_profile,function(profile){
        if(!profile) process.exit();
        console.log("[ok]");
        Talk.profile = profile;
        Talk.accountname = Talk.profile.accountname;
        Talk.protocol = Talk.profile.protocol;

        process.stdout.write("\nbuddy check: ");
        getBuddy(Talk.profile,buddy,Talk.MODE,function(buddy){
            if(!buddy) process.exit();
            Talk.buddy = buddy;
            Talk.buddyID = profile.buddyID(buddy);
            if(Talk.buddyID == profile.accountname){
                console.log("Buddy has same otrtalk id as you!");
                process.exit();
            }
            console.log("[ok]");
            process.stdout.write("\notr module check: ");
            if(!OTR_INSTANCE()){
             console.log("invalid otr module.");
             process.exit();
            }
            console.log("[ok]");
            process.stdout.write("\nkeystore check: ");
            //access keystore - prepare new one if not exists.
            accessKeyStore(Talk.profile,Talk.buddy,(otr.VFS?otr.VFS():undefined),true,function(files){
                if(!files) process.exit();
                console.log("[ok]");
                Talk.files = files;
                Talk.user = new otr.User(Talk.files);
                process.stdout.write("\naccount check: ");
                ensureAccount(Talk.user,Talk.accountname,Talk.protocol,function(result,err){
                    if(err) console.log("error generating key.",err.message);
                    if(!result || result=='not-found' || err ) process.exit();
                    if(result=='new') Talk.files.save();//save newly created key.
                    
                    ensureInstag(Talk.user,Talk.accountname,Talk.protocol,function(result,err){
                        if(result=='error'){
                            console.log("error getting instance tag:",err);
                            process.exit();
                        }
                        if(result=='new') Talk.files.save();//save newly created instance tag
                        //todo if buddy we are connecting to already has a trusted fingerprint, switch to chat mode
                        //unless we --force-connect to allow a new fingerprint to be discovered..(in such case will
                        //a new fingerprint overwrite the old one when saved to file?
                        //clear userstate.. (new one will be created for each incoming connection)
                        Talk.user.state.free();
                        delete Talk.user.state;
                        delete Talk.user;
                        console.log("[ok]");
                        Network = require("./lib/network");
                        //ensure we have a secret if we are in connect mode.
                        if(talk_mode =='connect' && !program.secret){
                            console.log("\nWhen establishing a new trust with a buddy you must provide a shared secret.");
                            console.log("This will be used for discovering a buddy using SMP authentication.");
                            console.log("Your buddy must be actively trying to connect at the same time.");
                            program.password("Enter SMP secret: ","*",function(secret){
                               Talk.secret = secret;
                               startTalking(Talk);
                            });
                        }else{
                            Talk.secret = program.secret;
                            startTalking(Talk);

                        }
                    });
                });
            });
        });
    });
}

function getProfile( pm, name, next ){
    var profile = pm.profile(name);
    if(profile) return next(profile);
    if(pm.profiles.length){
     console.log("Profile [",name,"] doesn't exist.");
     program.confirm("create it now? ",function(ok){
        if(ok){
          console.log("Enter the otrtalk id for this profile. This is a public name that you give out to your buddies.");
          program.prompt("otrtalk id: ",function(accountname){
            if(!accountname) {next();return;}
            pm.add(name,{
                accountname:accountname,
            });
            next(pm.profile(name));
          });
        }else next();
     });
    }else{
     console.log("creating profile:",name);
     console.log("Enter the otrtalk id for this profile. This is a public name that you give out to your buddies.");
     program.prompt("otrtalk id: ",function(accountname){
        if(!accountname) {next();return;}
        pm.add(name,{
            accountname:accountname,
        });
        next(pm.profile(name));
     });
    }
}

function getBuddy(profile,buddy,mode,next){
    if(!buddy){
        if(mode=='connect'){
          console.log("You didn't specify a buddy.");
          next();
          return;
        }
        if(profile.buddies.length){
            console.log('select a buddy to chat with:');
            var list = [];            
            profile.buddies.forEach(function(bud){
                list.push( bud.alias+":"+bud.id );
            });
            program.choose(list, function(i){
                if(profile.buddies[i]){
                    next( profile.buddies[i].alias );
                }else next();
            });
        }else{
            console.log("You didn't specify a buddy to chat with.");
            next();
        }
    }else{
     var buddyID = profile.buddyID(buddy);
     if(buddyID){
        next(buddy);
     }else{
        console.log("buddy not defined.");
        if(mode == "connect"){
        program.confirm("add ["+buddy+"] to your buddy list now? ",function(ok){
            if(ok){
              console.log("adding buddy [",buddy,"]");
              program.prompt("enter "+buddy+"'s otrtalk id: ", function(id){
                if(!id) {next();return;}
                profile.addBuddy(buddy,id);
                next(buddy);
              });
            } else next();
        });
        }else{
            console.log("The first time you want to chat with a new buddy, you must use the connect command");
            next();
        }
     }
    }
}
function accessKeyStore(profile,buddy,VFS,create,next){
  if(VFS){
    //when using otr3-em and otr4-em otr modules we encrypt the files on the real file system
    //the AES 256bit encryption key and IV are derived from a password

    if(fs.existsSync(profile.keys)){
        //assume already encrypted from previous session.
        //ask once for password.
         program.password('enter key-store password: ', '', function(password){
            openKeyStore(profile,buddy,VFS,password,next);
         });

    }else{
        if(create){
        //first time doble prompt for new password.
        console.log("Your keys are stored in an encrypted key-store, protected with a password.");
        console.log("** Pick a long passphrase to protect your keys in case the key-store is stolen **");
        program.password('new key-store password: ', '', function(password){
        program.password('      confirm password: ', '', function(password_confirm){
                if(password !== password_confirm){
                    console.log("passwords don't match!");
                    next(false);
                }else{
                    openKeyStore(profile,buddy,VFS,password,next);
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

function ensureAccount(user,accountname,protocol,next){
    if(!user.fingerprint( accountname, protocol)){
       console.log("A public key needs to be generated for the profile.");
       program.confirm("Generate one now? ",function(ok){
          if(ok){
            user.generateKey(accountname,protocol,function(err){
              if(err){
                next('error',err);
              }else{
                next('new');
              }
            });
          }else {
            next('not-found');
          }
       });
    }else next('found');
}

function ensureInstag(user,accountname,protocol,next){
    if(!user.findInstag) {next();return;}

    var instag = user.findInstag(accountname, protocol);
    if(instag) {next();return;}   

    console.log("creating new instance tag.");
    user.generateInstag( accountname, protocol,function(err,instag){
       if(err){
          next('error',err);
       }else next('new');
    });
 }

function startTalking(talk){
    talk.link = new Network.Link(talk.accountname, talk.buddyID);

    console.log("\nStarting Network.");
    Network.init(function(){
        console.log("\nContacting", talk.buddy,"...");
        talk.link.connect(function( peer,response ){
            incomingConnection(talk,peer,response);
        });
    });
}

function incomingConnection(talk,peer,response){

    if(Chat.ActiveSession()){
          peer.close();
          return;
    }

    //todo check sessions.. dont accept connection from same peer.. (ip/port)
    var session = new SessionManager.TalkSession({
            mode:function(){ return talk.MODE },
            accountname : talk.accountname,
            protocol : talk.protocol,
            buddy : talk.buddy,
            buddyID : talk.buddyID,
            files : talk.files,
            secret : talk.secret
        }, otr, peer,response);

    //when a session is authenticated - will happen only once!
    session.on("auth",function( fingerprint, state){   
       var this_session = this;
       console.log("[verifying connection]");
       //idea filter by short key-id which we can pass on command line.. 
       //(pgp key-id:http://www.pgp.net/pgpnet/pgp-faq/pgp-faq-keys.html)
       switch( talk.MODE ){
         case 'chat':
               assert(state.Trusted && !state.NewFingerprint);
               startChat(talk,this_session,fingerprint);
               break;

         case 'connect':
            if(state.NewFingerprint){
            //howto handle multiple sessions reaching here?
            console.log("You have connected to someone who claims to be",talk.buddyID);
            console.log("They know the authentication secret.");
            console.log("Their public key fingerprint:\n");
            console.log("\t"+fingerprint);
            console.log("\nVerify that it matches the fingerprint of");
            console.log("the person you are intending to connect with.");
            program.confirm("Do you want to trust this fingerprint? ",function(ok){
                if(!ok){
                    console.log("[rejecting connection]");
                    this_session.end();
                }else{
                     //todo-remove unauthenticated fingerprints from userstate before writing to file!
                    this_session.writeAuthenticatedFingerprints();
                    startChat(talk,this_session,fingerprint);
                }
            });
           }else if(state.Trusted){
            //we used connect mode and found an already trusted fingerprint...
            startChat(talk,this_session,fingerprint);
           }
       }
    });

    session.on("closed",function(){
        if(Chat.ActiveSession() == this) shutdown();
    });
}
function startChat(talk,session,fingerprint){
  //todo: close all other sessions.
  //talk.link.stop(); stop telehash connector.
   talk.MODE = 'chat';
   console.log('[entering secure chat]\nbuddy fingerprint:',fingerprint);
   Chat.attach(talk,session);
}
////// Profiles Command
function profile_manage(action, profilename, accountname){
    var pm = require("./lib/profiles");    
    var profile;
    if(!action){
           pm.list();
    }else{
        switch(action){
            case 'list':
                 pm.list();
                 break;
            case 'info':
                if(!profilename) return;                
                profile = pm.profile(profilename);
                if(!profile) {console.log('profile "'+profilename+'" not found.');break;}
                profile.print();
                otr = OTR_INSTANCE();
                accessKeyStore(profile,undefined,(otr.VFS?otr.VFS():undefined),false,function(files){
                    if(files){
                        console.log("\t=== Keys ===");
                        var user = new otr.User( files );
                        user.accounts().forEach(function(account){
                            console.log("otrtalk id:",account.accountname," fingerprint:",account.fingerprint);
                        });
                    }
                });
                break;
            case 'add':
                if(!profilename) return;
                profile = pm.profile(profilename);
                if(!profile){
                    if(!accountname){ console.log("no otrtalk id specified"); break;}
                    //create profile with default settings..
                    pm.add(profilename,{
                     accountname:accountname,
                    });
                    profile = pm.profile(profilename);
                    if(profile) {
                        console.log("Created Profile:",profilename);
                        profile.print();
                    }else console.log("Problem creating profile!");

                }else console.log(profilename,"profile already exists!");
                break;
            case 'remove':
                if(!profilename) return;
                profile = pm.profile(profilename);
                if(profile){
                   program.confirm("are you sure you want to remove profile: "+profilename+"? ",function(ok){
                       if(ok){
                         pm.remove(profilename);
                         /*
                         program.confirm("delete keystore and fingerprints store? ",function(ok){
                         });
                         */
                         process.exit();
                       }else process.exit();
                   });
                }else{
                    console.log("profile does not exist");
                }
                break;
        }
    }
}

function shutdown(){
    if(this.exiting) return;
    this.exiting = true;

    if(Network) Network.shutdown();

    setTimeout(function(){
       process.exit();
    },300);
}

