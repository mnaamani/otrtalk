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
     ],
     otr:'otr4-em'          //otr module to use 
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

var otr_modules = {
    "otr3":"otr3",
    "otr4-em":"otr4-em"
}

var user_home = process.env[(process.platform == 'win32') ? 'USERPROFILE' : 'HOME'];
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
    var name = lookup || 'default';
    var profile_match;
    if(config.profiles){
      Object.keys(config.profiles).forEach(function(profile){
	if((name && typeof name == 'string' && name==profile)){
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
	   'name':name,
	   'buddyFingerprints':function(buddy){
     	  return path.join(this.fingerprints,buddy);
	   },
       'buddies':profile_match.buddies,
       'buddyID':profile_get_buddyID,
       'addBuddy':profile_add_buddy,
       'print':profile_print,
       'otr':profile_match.otr
	});
      }
    }
    return undefined;
}
identity.profile = getProfile;

function fqp( p ){
	return path.join(otrtalk_root,p);
}
//return array of profile names
function getProfilesArray(){
    var profiles = [];
    if(config.profiles){
      Object.keys(config.profiles).forEach(function(profile){
        profiles.push( profile );
      });
    }
    return profiles;
}; identity.profiles = getProfilesArray;

function printList(){
    getProfilesArray().forEach(function(name){
        console.log(name);
    });
};
identity.list = printList;

function newProfile(name,new_profile,force){
    name = name || 'default';
    if(config.profiles[name] && !force ) return undefined;//profile with same name already exists
    if(!new_profile.accountname) return undefined;//minimum required is accountname
    if( new_profile.otr && !otr_modules[new_profile.otr]){
        console.log(new_profile.otr,": invalid otr module specified");
        return undefined;    
    }
    config.profiles[name] = {
           'id': new_profile.id || new_profile.accountname,
           'keys': new_profile.keys || "./"+name+"/priv.keys",
           'instags': new_profile.instags || "./"+name+"/instance.tags",
           'fingerprints': new_profile.fingerprints || "./"+name+"/fingerprints/",
           'accountname': new_profile.accountname,
           'protocol': new_profile.protocol || 'otrtalk',
           'buddies': new_profile.buddies || [],
           'otr': new_profile.otr || 'otr4-em'
    }
    saveConfigFile();
    return getProfile(name);

}
identity.add = newProfile;

function deleteProfile(name){
    if(!name) return;//must provide a profile name
    if(config.profiles[name]){
    	delete config.profiles[name];
    	saveConfigFile();
    }
}
identity.remove = deleteProfile;


//apply these function to profile object returned by getProfile()
function profile_get_buddyID(alias){
    var id;//otrtalk id
    if(!this.buddies) return undefined;
    this.buddies.forEach( function(buddy){
        if(buddy.alias == alias) id = buddy.id;
    });
    return id;
}
function profile_add_buddy(alias,buddyID){
    if( profile_get_buddyID(alias) ) return;
    config.profiles[this.name].buddies.push({'id':buddyID,'alias':alias});
    saveConfigFile();
    this.buddies = config.profiles[this.name].buddies;
}
function profile_print(){
    console.log('otrtalk id:',this.accountname);
    console.log('key-store:',this.keys);
    console.log('instags:',this.instags);
    console.log('fingerprints:',this.fingerprints);
    console.log("otr module:",otr_modules[this.otr?this.otr:"otr4-em"]);
    print_buddies( this.buddies );
}

function print_buddies(buddies){
    if(!buddies.length) return;
    console.log("buddy list:");
    buddies.forEach( function(buddy){
        console.log(buddy.alias,":",buddy.id);
    });
}


loadConfigFile();
