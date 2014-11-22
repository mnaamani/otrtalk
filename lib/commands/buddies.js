var fs = require("fs");
var path = require("path");
var fs_existsSync = fs.existsSync || path.existsSync;
var imapp = require("../imapp.js");
var tool = require("../tool.js");
var program = require('../commander.js');

module.exports = Command;

function Command(ui){
  this.UI = ui;
}

Command.prototype.exec = function(action,buddy){
    var UI = this.UI;
    var pm = require("../profile_manager.js");
    var profile;
    profilename = program.profile;

    action = action || "list";
    switch(action){
        case 'remove':

            if(!buddy) return console.log("Buddy not specified.");
            if(pm.empty()) return console.log("No profiles exist.");
            if(!profilename){
                if(pm.multiple()) return console.log("Profile not specified.");
                profilename = pm.firstProfileName();
            }
            if(!pm.profileExists(profilename)) return console.log('Profile "'+profilename+'" not found.');
            profile = pm.loadProfile(profilename);
            if(profile.buddyID(buddy)){
               program.confirm("Are you sure you want to remove buddy: "+buddy+" [y/n]? ",function(ok){
                   if(ok){
                     if(fs_existsSync(profile.buddyFingerprints(buddy))){
                       fs.unlink(profile.buddyFingerprints(buddy));
                     }
                     profile.removeBuddy(buddy);
                     console.log("removed buddy:",buddy);
                   }
               });
            }else console.log("Buddy not found.");
            break;

        case 'list':
            if(pm.empty()) return console.log("No profiles found.");
            if(!profilename){
                if(pm.multiple()) return console.log("Profile not specified.");
                profilename = pm.firstProfileName();
            }
            if(!pm.profileExists(profilename)) return console.log('Profile "'+profilename+'" not found.');
            profile = pm.loadProfile(profilename);

            if(!profile.needPassword()){
              listBuddies(profile.parseFingerprintFiles());
            }else{
              UI.enterPassword(function(password){
                    listBuddies(profile.parseFingerprintFiles(password));
              });
            }
            break;
    }
}

function listBuddies(buddies){
  if(!buddies.length) return;
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
}
