#!/usr/bin/env node
var async = require("async");
var program = require("commander");
var fs = require("fs");
var path = require("path");
var assert = require("assert");
var Network;
var SessionManager = require("./lib/sessions");
var Chat = require("./lib/chat");
var fs_existsSync = fs.existsSync || path.existsSync;

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
    .version("0.1.11")
    .option("-p, --profile [profile]","specify profile to use","")
    .option("-f, --fingerprint [fingerprint]","public key fingerprint of buddy to connect with [connect mode]","")
    .option("-s, --secret [secret]","secret to use for SMP authentication [connect mode]","")
    .option("--pidgin","check pidgin buddylist for known fingerprints [connect mode]","")
    .option("--adium","check adium buddylist for known fingerprints [connect mode]","")
    .option("-o, --otr [otr4-em|otr3]","specify otr module to use for profile","otr4-em")//only takes effect when creating a profile
    .option("--lan","broadcast on the LAN, don't use telehash p2p discovery");
    
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
    .command('forget [buddy] [profile]')
    .description('remove buddy from profile')
    .action( function(buddy,profile){
        got_command = true;
        profile_manage.apply(this,['forget-buddy',profile||program.profile,buddy]);
     });

  program
    .command('import-key [pidgin|adium] [profile] [otrtalk-id]')
    .description('import a key from pidgin/adium into new profile')
    .action( function(app,profile,id){
        got_command = true;
        import_key_wizard(app,profile,id);
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
        console.log("[ok] using profile:",profile.name);
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
                        console.log("Using DSA Key fingerprint:",Talk.user.fingerprint(Talk.accountname,Talk.protocol));

                        //clear userstate.. (new one will be created for each incoming connection)
                        Talk.user.state.free();
                        delete Talk.user.state;
                        delete Talk.user;
                        console.log("[ok]");

                        //if the fingerprints file exists.. we have already trusted buddy fingerprint
                        if( fs_existsSync(Talk.files.fingerprints) ){
                            if(talk_mode=='connect'){
                                console.log("You already have a trust with this buddy.\nSwitching to 'chat' mode.");
                                Talk.MODE = talk_mode = 'chat';
                            }
                        }else{
                            if(talk_mode=='chat'){
                                console.log("You haven't yet established a trust with this buddy.\nSwitching to 'connect' mode.");
                                Talk.MODE = talk_mode = 'connect';
                            }
                        }
                        if(program.lan){
                            console.log("Buddy Discovery Mode: LAN Broadcast");
                            Network = require("./lib/net-broadcast");
                        }else{
                            console.log("Buddy Discovery Mode: Telehash");
                            Network = require("./lib/net-telehash");
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
                                console.log("Will look for buddy with fingerprint:",Talk.fingerprint);
                            }
                            if(program.pidgin || program.adium){
                                console.log("parsing IM app fingerprints");
                                Talk.trusted_fingerprints = imapp_fingerprints_parse();
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
    var profile;
    if(name){
      profile = pm.profile(name);
      if(profile) return next(profile);
      console.log("Profile [",name,"] doesn't exist.");
      program.confirm("create it now [y/n]? ",function(ok){
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
            console.log("Profile not specified, select a profile from list:");
            program.choose(list, function(i){
                next(pm.profile(list[i]));
            });
        }else{
            //no profiles exist at all.. create a new one
            console.log("No pofiles exist, let's create one now.");
            program.prompt("profile name: ",function(name){
                console.log("Enter an otrtalk id for this profile. This is a public name that you give out to your buddies.");
                program.prompt("otrtalk id: ",function(accountname){
                    if(!accountname) {next();return;}
                    next(pm.add(name,{
                        accountname:accountname,
                        otr:program.otr
                    }));
                });
            });
        }
    }
}

function getBuddy(profile,buddy,mode,next){
    var need_new_buddy = false;
    if(!buddy){
        if(profile.buddies.length){
            console.log('Select a buddy to',mode,'with:');
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
        program.confirm("add ["+buddy+"] to your buddy list now [y/n]? ",function(ok){
            if(ok){
                program.prompt("enter "+buddy+"'s otrtalk id: ", function(id){
                  if(!id) {next();return;}
                  profile.addBuddy(buddy,id);
                  next(buddy);
                });
            }else next();
        });
    }

    if(need_new_buddy) {
        console.log("Enter new buddy details:");
        program.prompt("alias: ",function(buddy){
            program.prompt(buddy+"'s otrtalk id: ", function(id){
                if(!id) {next();return;}
                profile.addBuddy(buddy,id);
                next(buddy);
            });
        });
    }
}

function accessKeyStore(profile,buddy,VFS,create,next){
  if(VFS){
    //when using otr3-em and otr4-em otr modules we encrypt the files on the real file system
    //the AES 256bit encryption key and IV are derived from a password

    if(fs_existsSync(profile.keys)){
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
       console.log("A DSA key needs to be generated for the profile.");
       program.confirm("Generate one now [y/n]? ",function(ok){
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
        talk.link.connect(function( peer ){
            if(Chat.ActiveSession() || talk.found_buddy ){
              peer.disconnectLater();
              return;
            }
            incomingConnection(talk,peer);
        });
    });
}

function incomingConnection(talk,peer){
    var session = new SessionManager.TalkSession({
            mode:function(){ return talk.MODE },
            accountname : talk.accountname,
            protocol : talk.protocol,
            buddy : talk.buddy,
            buddyID : talk.buddyID,
            files : talk.files,
            secret : talk.secret,
            buddyFP : talk.fingerprint,
            trustedFP: talk.trusted_fingerprints
        }, otr, peer);

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

    console.log("[verifying connection]");
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
                    console.log("[rejecting connection]");
                    session.end();
                }else{
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
   console.log('[entering secure chat]\nbuddy fingerprint:',session.fingerprint());
   Chat.attach(talk,session);
}
////// Profiles Command
function profile_manage(action, profilename, arg1, arg2){
    var pm = require("./lib/profiles");  
    var profile;
    profilename = profilename || program.profile;
    var accountname, buddy;
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
                otr = OTR_INSTANCE(profile.otr);
                accessKeyStore(profile,undefined,(otr.VFS?otr.VFS():undefined),false,function(files){
                    if(files){
                        console.log(" == Keystore");
                        var Table = require("cli-table");
                        var table = new Table({
                            head:['accountname','protocol','fingerprint']
                        });
                        var user = new otr.User( files );
                        user.accounts().forEach(function(account){
                            table.push([account.accountname,account.protocol,account.fingerprint]);
                        });
                        console.log(table.toString());
                    }
                });
                break;
            case 'add':
                if(!profilename) {console.log("Profile not specified.");return;}
                profile = pm.profile(profilename);
                accountname = arg1;
                if(!profile){
                    if(!accountname){ console.log("No otrtalk id specified"); break;}
                    //create profile with default settings..
                    profile = pm.add(profilename,{
                     accountname:accountname,
                     otr:program.otr
                    },false,true);
                    if(profile) {
                        otr = OTR_INSTANCE(program.otr);
                        accessKeyStore(profile,undefined,(otr.VFS?otr.VFS():undefined),true,function(files){
                            if(files){
                              var user = new otr.User( files );
                              ensureAccount(user,profile.accountname,profile.protocol,function(result,err){
                                if(err) {
                                    console.log("Error generating key.",err.message);
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
                            }else process.exit();
                        });

                    }else console.log("Failed to create profile.");

                }else console.log(profilename,"Profile already exists!");
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
            case 'forget-buddy':
                buddy = arg1;
                if(!buddy){ console.log("Buddy not specified.");return;}
                if(!pm.profiles() || !pm.profiles().length) return console.log("No profiles found.");
                if(!profilename){
                    if(pm.profiles().length>1) {console.log("Profile not specified.");return;}
                    profilename = pm.profiles()[0];
                }
                profile = pm.profile(profilename);
                if(!profile) {console.log('Profile "'+profilename+'" not found.');break;}
                if(profile.buddyID(buddy)){
                   program.confirm("Are you sure you want to remove "+buddy+" [y/n]? ",function(ok){
                       if(!ok) process.exit();
                       if(fs_existsSync(profile.buddyFingerprints(buddy))){
                           fs.unlink(profile.buddyFingerprints(buddy));
                       }
                       profile.removeBuddy(buddy);
                       console.log("deleted buddy:",buddy);
                       process.exit();
                   });
                }else console.log("Buddy not found.");
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

function import_key_wizard(app,profile,id){
    var filename;
    profile = profile || program.profile;
    if(!app){
      console.log("You did not specify an application.")
      console.log("specify either: pidgin or adium");
      return;
    }
    if(IMAPPS[app]){
      if(IMAPPS[app][process.platform]){
          if(!profile) {
            console.log("target profile name for import not specified!\n");
            return;
          }
          filename = resolve_home_path(IMAPPS[app][process.platform].keys);
          if(fs_existsSync(filename)){
            do_import_key(filename,profile,id);
          }else{
            console.log("keystore file not found:",filename);
          }          
      }else{
        console.log("I don't know how to import",app,"keys on this platform.");
      }
    }else{
        console.log("I don't know about this application:",app);
    }
}

function do_import_key(filename,profilename,id){
    var UserFiles = require("./lib/files").UserFiles;
    var pm = require("./lib/profiles");
    
    var VFS;
    var target = {};
    var source = {};
    var key;
    var profile;
    
    //check if profile already exists - don't overwrite!
    if(pm.profile(profilename)){
      console.log("Profile '"+profilename+"' already exists. Please specify a different profile to import into.");
      return;
    }
    otr = require("otr4-em");
    VFS = otr.VFS();
    console.log("checking application files..");
    source.files = new UserFiles({keys:filename,fingerprints:"/tmp/tmp.fp",instags:'/tmp/tmp.tag'},null,VFS);
    source.user = new otr.User(source.files);

    console.log("Select an account to import:");
    var list = [];
    var accounts = source.user.accounts();
    accounts.forEach(function(account){
       list.push(account.protocol+":"+account.accountname);
    });
    program.choose(list,function(i){
        profile = pm.add(profilename,{id:id,accountname:accounts[i].accountname,protocol:accounts[i].protocol,otr:"otr4-em"},false,true);
        if(!profile){
            console.log("Error adding new profile.");
            return;
        }
        key = source.user.findKey(accounts[i].accountname,accounts[i].protocol);
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
                target.user.importKey(accounts[i].accountname,accounts[i].protocol,key.export());
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

function imapp_fingerprints_parse(){
    var filename;
    var app;
    var parsed = {
        entries:[]
    };
    app = program.pidgin ? "pidgin" : app;
    app = program.adium  ? "adium"  : app;

    if(IMAPPS[app]){
      if(IMAPPS[app][process.platform]){
          filename = resolve_home_path(IMAPPS[app][process.platform].fingerprints);
          if(fs_existsSync(filename)){
            //buddy-username    accountname     protocol    fingerprint     smp
            var buddies = fs.readFileSync(filename,"utf-8").split('\n');
            if(buddies && buddies.length){
                buddies.forEach(function(line){
                    var entry = line.split(/\s+/);
                    if(entry.length == 5 && entry[4]=='smp') parsed.entries.push({
                        username:entry[0],
                        accountname:entry[1],
                        protocol:entry[2],
                        fingerprint:entry[3]
                    });
                });
            }
          }
      }
    }
    parsed.match = imapp_fingerprints_match;
    return parsed;
}

function imapp_fingerprints_match(fp){
    var match;
    if(this.entries.length){
      this.entries.forEach(function(entry){
        if(entry.fingerprint.toUpperCase() == fp.replace(/\s/g,"")) match = entry;
      });
    }
    return match;
}

function resolve_home_path(str){
   return str.replace("~", process.env[process.platform=='win32'?'USERPROFILE':'HOME']);
}

//platform specific paths to private key stores
var IMAPPS = {
  'pidgin':{
    'linux': {keys:'~/.purple/otr.private_key',fingerprints:'~/.purple/otr.fingerprints'},
    'darwin': {keys:'~/.purple/otr.private_key',fingerprints:'~/.purple/otr.fingerprints'},
    'win32': {keys:'~/Application Data/.purple/otr.private_key',fingerprints:'~/Application Data/.purple/otr.fingerprints'}
  },
  'adium':{
    'darwin':{keys:'~/Library/Application Support/Adium 2.0/Users/Default/otr.private_key',
              fingerprints:'~/Library/Application Support/Adium 2.0/Users/Default/otr.fingerprints'}
  }
};

main();//process commands and options.
