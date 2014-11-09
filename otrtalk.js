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
var fs_existsSync = fs.existsSync || path.existsSync;
var os = require("os");
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

function shutdown(){
    if( this._exiting ){ return; } else { this._exiting = true; }

    if( Network ) Network.shutdown();

    setTimeout(function(){
       process.exit();
    },300);
}

UI.getProfile = function (pm, name, next){
    var profile, profiles, list = [];
    if(name){
      profile = pm.profile(name);
      if(profile) return next(profile);
      console.log("Profile [",name,"] doesn't exist.");
      program.confirm("  create it now [y/n]? ",function(ok){
        if(ok){
          console.log("Enter the otrtalk id for this profile. This is a public name that you give out to your buddies.");
          program.prompt("  otrtalk id: ",function(id){
              if(!id) return next();
              var cmd = require("./lib/commands/profiles.js");
              var _cmd = new cmd(UI);
              _cmd.exec('add', name, id);
          });
        } else return next();
      });
      return;
    }

    profiles = pm.profiles();
    //no profile specified
    if(profiles.length == 1){
        //use the single profile found
        next(pm.profile(profiles[0]));
        return;
    }

    if(profiles.length > 1){
        //show a list selection of profiles to choose from.
        profiles.forEach(function(prof){
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
            if(!id) return next();
            var cmd = require("./lib/commands/profiles.js");
            var _cmd = new cmd(UI);
            _cmd.exec('add', name, id);
        });
    });
};

UI.getBuddy = function(profile,buddy,next){
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
                  if(!id) {next();return;}
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
            if(!id) {return next();}
            profile.addBuddy(buddy,id);//TODO:handle case if buddy not added
            next(buddy);
        });
    });
};

UI.accessKeyStore = function (profile,buddy,vfs,create,next){

    if(!vfs){
      return next(profile.openKeyStore(buddy));
    }

    /*
      when using otr3-em and otr4-em otr modules we encrypt the files on the real file system
      the AES 256bit encryption key and IV are derived from a password
    */

    if(fs_existsSync(profile.keys())){
      //assume already encrypted from previous session.
      //ask once for password.
      program.password('enter key-store password: ', '', function(password){
          next(profile.openKeyStore(buddy,vfs,password));
      });
      return;
    }

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
                  next(profile.openKeyStore(buddy,vfs,password));
              }
           });
      });
      return;
    }

    next();
};

UI.accessFingerprintsStore = function (profile,vfs,next){
  if(!vfs) return next(profile.openFingerprintsStore());

  program.password('enter key-store password: ', '', function(password){
        next(profile.openFingerprintsStore(password));
  });
};

UI.ensureAccount = function (user,accountname,protocol,generate,next){
  var fingerprint = user.fingerprint( accountname, protocol);

  if(fingerprint){
    return next('found');
  }

  if(generate){
    console.log("Generating your OTR key...");
    user.generateKey(accountname,protocol,function(err){
      if(err){
        next('error',err);
      }else{
        next('new');
      }
    });
    return;
  }

  //account not found..
  next('not-found');

};

UI.ensureInstag = function(user,accountname,protocol,next){
    if(!user.findInstag) return next();

    var instag = user.findInstag(accountname, protocol);

    if(instag) return next();

    //debug("creating instance tag.");
    user.generateInstag( accountname, protocol,function(err,instag){
       if(err){
          next('error',err);
       }else next('new');
    });
 };

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
    var cmd = require("./lib/commands/chat_connect.js");
    var _cmd = new cmd(UI);
    _cmd.exec(program.profile,buddy,'connect');
  });

  program
  .command('chat [buddy]')
  .description('chat with trusted buddy')
  .action(function(buddy){
    got_command = true;
    var cmd = require("./lib/commands/chat_connect.js");
    var _cmd = new cmd(UI);
    _cmd.exec(program.profile,buddy,'chat');
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
