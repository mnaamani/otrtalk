var program = require('../commander.js');

module.exports = Command;

function Command(ui){
  this.UI = ui;
}
//todo - add buddies subcommands
Command.prototype.exec = function (action){
    var UI = this.UI;
    var pm = require("../profile_manager.js");

    action = action || "list";

    function selectProfile(next){
      var list = [];

      if(pm.empty()) {
        console.log("no profiles exist");
        next("no-profiles-exist");
        return;
      }

      //show a list selection of profiles to choose from.
      pm.profiles().forEach(function(prof){
        list.push(prof);
      });
      console.log("Select a profile:");
      program.choose(list, function(i){
        pm.loadProfile(list[i],UI.enterPassword,next);
      });

    };

    function enterNewProfileInfo(next){
      program.prompt("  profile name: ",function(name){
        if(pm.profileExists(name)){
          console.log("Profile already exists! Choose another name");
          enterNewProfileInfo(next);
          return;
        }
        console.log("Enter an otrtalk id for this profile.\nThis is a public name that you give out to your buddies.");
        program.prompt("  otrtalk id: ",function(id){
          if(!id) return;
          next(name,id);
        });
      });
    };

    switch(action){
        case 'list':
             pm.printList();
             break;

        case 'info':
            selectProfile(function(err,profile){
              if(profile) profile.print();
            });

            break;

        case 'add':
              enterNewProfileInfo(function(name,id){
                  console.log("creating profile and generating your OTR key...");
                  pm.createProfile(name,{
                    id:id,
                    otr:program.otr
                  }, UI.enterNewPassword, function(err,profile){
                    if(err){
                      console.log(err);
                      return;
                    }
                    profile.print();
                    console.log("created new profile:",profile.name());
                  });
              });

            break;

        case 'remove':
            selectProfile(function(err,profile){
              if(!profile) return;
              profile.print();
              program.confirm("**Are you sure you want to remove profile: "+profile.name()+" [y/n]? ",function(ok){
                 if(ok){
                   pm.deleteProfile(profile.name());
                 }
               });
            });
            return;
    }
}
