/*
  This module manages the profiles used by otr-talk
  profiles are saved in $(HOME)/.otrtalk/id.json
*/

/* example id.json file
{
 "profiles":{
   "alice":{
     "keys":"./priv.keys",		//path to DSA private keys file relative to id file.
     "instags":"./instance.tags",  //path to instance tags file relative to id file
     "fingerprints":"alice/fingerprints/",	//path to unique fingerprints 'folder' relative to id file.
     "accountname":"alice@otrtalk.net", //accountname/protocol specifies the 
     "protocol":"otrtalk",
     "buddies":[
        {"alias":"bob", "id":"bob@otrtalk.net"}
     ]
   },
   "bob":{
     "keys":"./priv.keys",		//common keys and instags files may be used
     "instags":"./instance.tags",
     "fingerprints":"bob/fingerprints/",//each profile *must* use a different fingerprints folder
                                        //A fingerprint file will be stored for each buddy separately,
                                        //to ensure no file access conflicts when multiple instances
                                        //of otr-talk are running.
     "accountname":"bob@otrtalk.net",  
     "protocol":"otrtalk",
     "buddies":[
        {"alias":"alice","id":"alice@otrtalk.net"}
     ]
   }
 }
}
*/

var identity = module.exports = {};
var path = require("path");
var fs = require("fs");

var user_home = process.env.HOME;//todo - check it works for all platforms
var otrtalk_root = path.join( user_home, "/.otrtalk" );//root directory of all otrtalk config files
var config_path = path.join( otrtalk_root, "/id.json");//stores profiles
var config = {};

//  load
function loadConfigFile(){
  var data;
  if( fs.existsSync(config_path) ){
    data = fs.readFileSync(config_path,"utf-8");
    try{
      config = JSON.parse(data);
    }catch(E){
      console.error("error parsing configuration file",config_path,E);
      process.exit();
    }
  }else{
    console.error("creating new config file,",config_path);
    if(!fs.existsSync(path.dirname(config_path))) fs.mkdirSync(path.dirname(config_path));
    config = {'profiles':{}};
    saveConfigFile();
  }
  return identity;
}
identity.load = loadConfigFile;

//  save
function saveConfigFile(){
  var data = JSON.stringify( config );  
  fs.writeFileSync(config_path,data);
}
identity.save = saveConfigFile;

//  profile
//gets the specified 'lookup' profile or the default if not specified.
//returns undefined if neither is found. relative paths converted to fully qualified paths.
//todo- create folder hierarchy if folders missing?
function getProfile(lookup){
    var id = lookup || 'default';
    var profile_match;
    if(config.profiles){
      Object.keys(config.profiles).forEach(function(profile){
	if((id && typeof id == 'string' && id==profile)){
	  profile_match = config.profiles[profile];
	}
      });
      if(profile_match){
	return ({
	   'keys': fqp(profile_match.keys),
	   'instags': fqp(profile_match.instags),
	   'fingerprints': fqp(profile_match.fingerprints),
	   'accountname': profile_match.accountname,
	   'protocol': profile_match.protocol || 'otrtalk',
	   'id':id,
	   'buddyFingerprints':function(buddy){
     	  return path.join(this.fingerprints,buddy);
	   },
       'buddies':profile_match.buddies,
       'buddyID':profile_get_buddyID,
       'addBuddy':profile_add_buddy,
       'print':profile_print
	});
      }
    }
    return undefined;
}
identity.profile = getProfile;
function fqp( p ){
	return path.join(otrtalk_root,p);
}
//return array of profile IDs 
function getProfileIDsArray(){
    var profiles = [];
    if(config.profiles){
      Object.keys(config.profiles).forEach(function(profile){
	profiles.push( profile );
      });
    }
    return profiles;
}; identity.profiles = getProfileIDsArray;
function printList(){
    getProfileIDsArray().forEach(function(profileid){
        console.log(profileid);
    });
};
identity.list = printList;

function newProfile(id,new_profile,force){
    id = id || 'default';
    if(config.profiles[id] && !force ) return undefined;//profile with same id already exists
    if(!new_profile.accountname) return undefined;//minimum required is accountname
    config.profiles[id] = {
           'keys': new_profile.keys || "./"+id+"/priv.keys",
           'instags': new_profile.instags || "./"+id+"/instance.tags",
           'fingerprints': new_profile.fingerprints || "./"+id+"/fingerprints/",
           'accountname': new_profile.accountname,
           'protocol': new_profile.protocol || 'otrtalk',
           'buddies': new_profile.buddies || []
    }
    saveConfigFile();
    return getProfile(id);
}
identity.add = newProfile;

function deleteProfile(id){
    if(!id) return;//must provide and id
    if(config.profiles[id]){
    	delete config.profiles[id];
    	saveConfigFile();
    }
}
identity.remove = deleteProfile;


//apply these function to profile object returned by getProfile()
function profile_get_buddyID(alias){
    var id;
    if(!this.buddies) return undefined;
    this.buddies.forEach( function(buddy){
        if(buddy.alias == alias) id = buddy.id;
    });
    return id;
}
function profile_add_buddy(alias,buddyID){
    if( profile_get_buddyID(alias) ) return;
    config.profiles[this.id].buddies.push({'id':buddyID,'alias':alias});
    saveConfigFile();
    this.buddies = config.profiles[this.id].buddies;
}
function profile_print(){
    console.log("\t=== Files ===");
    console.log('\tKeys:\t\t',this.keys);
    console.log('\tInstags:\t',this.instags);
    console.log('\tFingerprints:\t',this.fingerprints);
    print_buddies( this.buddies );
}

function print_buddies(buddies){
    if(!buddies.length) return;
    console.log("\t=== Buddies ===");
    buddies.forEach( function(buddy){
        console.log("\t"+buddy.alias,":",buddy.id);
    });
}


loadConfigFile();
