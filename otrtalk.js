#!/usr/bin/env node

var program = require("commander");
var fs = require("fs");
var path = require("path");
var assert = require("assert");
var Network;
var SessionManager = require("./lib/sessions");
var Chat = require("./lib/chat");

var otr;
var otr_modules = {
    "otr3":"otr3",
    "otr4-em":"otr4-em"
}
function OTR_INSTANCE(choice){
    if(otr) return otr;//only one global instance
    var otr_mod =  choice ? otr_modules[choice] : 'otr4-em';
    otr = otr_mod ? require(otr_mod) : undefined;
    return otr;
}

process.title = "otrtalk";

function main(){
  var got_command = false;
  init_stdin_stderr();
  program
    .version("0.0.3")
    .option("-p, --profile [profile]","specify profile to use","default")
    .option("-f, --fingerprint [fingerprint]","public key fingerprint of buddy to connect with [connect mode]","")
    .option("-s, --secret [secret]","secret to use for SMP authentication [connect mode]","")
    .option("-o, --otr [otr4-em|otr3]","specify otr module to use for profile","otr4-em");//only takes effect when creating a profile
    
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

  program
    .command('import [key|buddy|buddies] [application] [accountname] [protocol] [profile] [otrtalk-id]')
    .description('import a key or buddy from other applications into profile')
    .action( function(what,app,accountname,protocol,profile,id){
        got_command = true;
        import_wizard(what,app,accountname,protocol,profile,id);
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
        Talk.id = Talk.profile.id;//otrtalk id
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
            if(!OTR_INSTANCE(Talk.profile.otr)){
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
                        console.log("Using DSA Key fingerprint:",Talk.user.fingerprint(Talk.accountname,Talk.protocol));
                        Talk.user.state.free();
                        delete Talk.user.state;
                        delete Talk.user;
                        console.log("[ok]");
                        Network = require("./lib/network");
                        //esnure fingerprint if entered as option is correctly formatted
                        ensureFingerprint(program.fingerprint,function(valid_fingerprint){
                          if(talk_mode == 'connect'){
                            if(program.fingerprint && !valid_fingerprint){
                              console.log("Invalid fingerprint provided");
                              process.exit();
                            }
                            if(valid_fingerprint){ 
                                Talk.fingerprint = valid_fingerprint;
                                console.log("Will look for buddy with fingerprint:",Talk.fingerprint);
                            }
                          }
                          //ensure we have a secret if we are in connect mode.
                          if(talk_mode =='connect' && !program.secret){
                            console.log("\nWhen establishing a new trust with a buddy you must provide a shared secret.");
                            console.log("This will be used by SMP authentication during connection establishment.");
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
    });
}
function ensureFingerprint(fp, next){
    if(fp){
        next(validateFP(fp));
        //force fingerpint entry in connect mode?
    }else next();
}

function validateFP(str){
    //acceptable formats
    //(5 segements of 8 chars each with white optional space inbetween)
    //F88D5DFD BDB1C0A3 0D7543FF 2DF6F58C 28AE3F42
    if(!str) return;
    var valid = true;
    var segments = []; 
    str.match( /(\s?\w+\s?)/ig ).forEach(function(segment){        
        segments.push(segment.toUpperCase().trim());
    });    
    if(segments.length == 5 ){
      segments.forEach(function(seg){
        if( !seg.match(/^[A-F0-9]{8}$/) ) valid = false;
      });

      if(valid) return segments.join(" ");
    }else if(segments.length == 1){
       if(!segments[0].match( /^[A-F0-9]{40}$/)) return;
       return segments[0].match(/([A-F0-9]{8})/g).join(" ");
    }else return;

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
            next(pm.add(name,{
                accountname:accountname,
                otr:program.otr
            }));
          });
        }else next();
     });
    }else{
     console.log("creating profile:",name);
     console.log("Enter the otrtalk id for this profile. This is a public name that you give out to your buddies.");
     program.prompt("otrtalk id: ",function(accountname){
        if(!accountname) {next();return;}
        next(pm.add(name,{
            accountname:accountname,
            otr:program.otr
        }));
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
                    next();
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
    talk.link = new Network.Link(talk.id || talk.accountname, talk.buddyID);

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
            secret : talk.secret,
            buddyFP : talk.fingerprint
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
    profilename = profilename || program.profile;
    if(!action){
           pm.list();
    }else{
        switch(action){
            case 'list':
                 pm.list();
                 break;
            case 'info':
                if(!profilename) {console.log("profilename not specified");return;}
                profile = pm.profile(profilename);
                if(!profile) {console.log('profile "'+profilename+'" not found.');break;}
                profile.print();
                otr = OTR_INSTANCE();
                accessKeyStore(profile,undefined,(otr.VFS?otr.VFS():undefined),false,function(files){
                    if(files){
                        console.log("=== Keys ===");
                        var user = new otr.User( files );
                        user.accounts().forEach(function(account){
                            console.log("accountname:",account.accountname,"protocol:",account.protocol,"fingerprint:",account.fingerprint);
                        });
                    }
                });
                break;
            case 'add':
                if(!profilename) {console.log("profilename not specified");return;}
                profile = pm.profile(profilename);
                if(!profile){
                    if(!accountname){ console.log("no otrtalk id specified"); break;}
                    //create profile with default settings..
                    profile = pm.add(profilename,{
                     accountname:accountname,
                     otr:program.otr
                    });
                    if(profile) {
                        console.log("Created Profile:",profilename);
                        profile.print();
                    }else console.log("Problem creating profile!");

                }else console.log(profilename,"profile already exists!");
                break;
            case 'remove':
                if(!profilename) {console.log("profilename not specified");return;}
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

function import_wizard(what,app,accountname,protocol,profilename,id){
    var filename;
    profilename = profilename || program.profile;
    if(!profilename) {
          console.log("target profile name for import not specified!\n");
          return;
    }   
    if(what!='key' && what!='buddy' && what !='buddies'){
      console.log("Cannot import",what);
      return;
    }
    if(!app){
      console.log("You did not specify an application.")
      console.log("supported applications: pidgin, adium");
      return;
    }
    if(what=='key'){
      if(IMAPPS[app]){
      if(IMAPPS[app][process.platform]){
          filename = resolve_home_path(IMAPPS[app][process.platform].keys);
          if(fs.existsSync(filename)){
            do_import_key(filename,accountname,protocol,profilename,id);
          }else{
            console.log("keystore file not found:",filename);
          }          
      }else{
        console.log("I don't know how to import",app,"keys on this platform.");
        //display a list of supported apps on this platform.
      }
      }else{
        console.log("I don't know about this application:",app);
        //display list of supported apps..
      }
    }else{
      console.log("only key import currently implemented.")
    }

}
function do_import_key(filename,accountname,protocol,profilename,id){
    var UserFiles = require("./lib/files").UserFiles;
    var pm = require("./lib/profiles");
    
    var VFS;
    var target = {};
    var source = {};
    var key;

    var profile = pm.profile(profilename);//check if profile already exists - don't overwrite!
    if(profile){
      console.log("Profile '"+profilename+"' already exists. Please specify a different profile to import into.");
      return;
    }
    otr = require("otr4-em");
    VFS = otr.VFS();
    console.log("checking application files..");
    source.files = new UserFiles({keys:filename,fingerprints:"/tmp/tmp.fp",instags:'/tmp/tmp.tag'},null,VFS);
    source.user = new otr.User(source.files);
    
    if(!accountname || !protocol){
        console.log("Please specify an accountname and protocol. Availbale accounts to import:");
        source.user.accounts().forEach(function(account){
          console.log("accountname:",account.accountname,"protocol:",account.protocol,"fingerprint:",account.fingerprint);
        });
    }else{
        key = source.user.findKey(accountname,protocol);
        if(key){
            console.log("creating new profile",profilename);
            profile = pm.add(profilename,{id:id,accountname:accountname,protocol:protocol,otr:"otr4-em"},false,true);
            if(!profile){
              console.log("error adding new new profile!");
              return;
            }
            accessKeyStore(profile,null,VFS,true,function(user_files){
                target.files = user_files;
                if(target.files){
                  try{
                  //make sure import and export files are different paths
                  if(target.files.keys == source.files.keys || target.files.fingerprints == source.files.fingerprints){
                    console.log("keystore file conflict!");
                    return;
                  }
                  target.user = new otr.User(target.files);
                  target.user.importKey(accountname,protocol,key.export());
                  target.files.save();
                  pm.save();
                  console.log("Imported Keys Successfully to profile:",profilename);
                  profile.print();
                  return;//success
                }catch(E){
                  pm.remove(profilename);
                  console.log("Key Import Failed!",E);
                }
              }else{
                console.log("error creating new keystore files.");
              }
            });
        }else{
          console.log("Account not found:",accountname,protocol);      
        }
    }
}
function resolve_home_path(str){
   return str.replace("~", process.env[process.platform=='win32'?'USERPROFILE':'HOME']);
}

//platform specific paths to private key stores
//pidgin,adium,gaim,trillian
var IMAPPS = {
  'pidgin':{
    'linux': {keys:'~/.purple/otr.private_key',fingerprint:'~/.purple/otr.fingerprint'},
    'darwin': {keys:'~/.purple/otr.private_key',fingerprint:'~/.purple/otr.fingerprint'}
  },
  'adium':{
    'darwin':{keys:'~/Library/Application Support/Adium 2.0/Users/Default/otr.private_key'}
  }
};

main();//process commands and options.
