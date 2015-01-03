var pm = require("./profile_manager");
var tool = require("./tool.js");
/*
pm.printList();

var mokhtar = pm.loadProfile("mokhtar","123");

mokhtar.print();

console.log(mokhtar.buddies.aliases());

var omar = mokhtar.buddies.getBuddy("omarg");

console.log("omar's fingerprint:",tool.validateFP(omar.fingerprint()));
*/

pm.deleteProfile("test");

newProfile();

function newProfile(){
    pm.createProfile("test",undefined,function(next){ next("password"); },function(err,profile){

    if(err){
      console.log(err);
      return;
    }
    console.log("profile created");
    profile.print();
    console.log("adding buddy");
    profile.buddies.createBuddy("buddy","buddyid");
    console.log(profile.buddies.aliases());

  });
}
