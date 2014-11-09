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
    var Profiles = require("../profiles.js");
    var pm = new Profiles();
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
                otrm = tool.load_otr(profile.otr());
                if(!otrm.VFS){
                  listBuddies(profile.openFingerprintsStore());
                  return;
                }
                program.password('enter key-store password: ', '', function(password){
                      listBuddies(profile.openFingerprintsStore(password));
                });
                break;
        }
}

function listBuddies(buddies){
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
}
