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
     "fingerprints":"alice/fingerprints/",	//path to unique fingerprints 'directory' relative to id file.
     "accountname":"alice@otrtalk.net", //accountname/protocol specifies the 
     "protocol":"otrtalk",
     "buddies":[
        {"alias":"bob", "id":"bob@otrtalk.net","fingerprint":"62D8A3C6 D0BFE005 C4222D5C 4FC529F5 CF418CBD"}
     ],
     otr:'otr4-em'          //otr module to use 
   },
   "bob":{
     "keys":"./priv.keys",		//common keys and instags files may be used
     "instags":"./instance.tags",
     "fingerprints":"bob/fingerprints/",//each profile *must* use a different fingerprints directory
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
var config = {};//cached in memory representation of id.json on file system.

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
    fs.writeFileSync(config_path,JSON.stringify(config));
  }
  return identity;
}
identity.load = loadConfigFile;

//  save
function updateProfileOnFile(profile,remove){
  //reload from file system incase it was modified by another instance of otrtalk..
  var latest = JSON.parse(fs.readFileSync(config_path,"utf-8"));
  if(remove){
     if(latest.profiles[profile]) delete latest.profiles[profile];
  }else  latest.profiles[profile] = config.profiles[profile];//update
  fs.writeFileSync(config_path,JSON.stringify(latest));//write-to-file
}
identity.save = function(name){
    updateProfileOnFile(name,false);
}

//  profile
//gets the specified profile;
//returns undefined if neither is found. relative paths converted to fully qualified paths.
function getProfile(name){
    var profile_match;
    if(config.profiles){
      Object.keys(config.profiles).forEach(function(profile){
	if((name && typeof name == 'string' && name==profile)){
	  profile_match = config.profiles[profile];
	}
      });
      if(profile_match){
	return ({
       'id':profile_match.id || profile_match.accountname,
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
    var Table = require("cli-table");
    var table = new Table({
        head: ['','profile']
    });
    var i = 0;
    getProfilesArray().forEach(function(name){
        i++;
        table.push([i,name]);
    });
    if(i){
      console.log(table.toString());
    }else console.log("No profiles found.");
};
identity.list = printList;

function newProfile(name,new_profile,overwrite,dont_save){
    if(!name.match( /^[A-Z0-9-_]+$/ig)){
        console.log("Invalid profile name, use only alphanumerical characters, dashes and underscore");
        return;
    }
    if(config.profiles[name] && !overwrite) return undefined;//profile with same name already exists
    if(!new_profile.accountname) return undefined;//minimum required is accountname
    if( new_profile.otr && !otr_modules[new_profile.otr]){
        console.log(new_profile.otr,": invalid otr module specified");
        return undefined;
    }
    config.profiles[name] = {
           'id': new_profile.id || new_profile.accountname,
           'keys': "./"+name+"/priv.keys",
           'instags': "./"+name+"/instance.tags",
           'fingerprints': "./"+name+"/fingerprints/",  //directory
           'accountname': new_profile.accountname,
           'protocol': new_profile.protocol || 'otrtalk',
           'buddies': new_profile.buddies || [],
           'otr': new_profile.otr || 'otr4-em'
    };
    if(!dont_save) updateProfileOnFile(name);
    return getProfile(name);
}
identity.add = newProfile;

function deleteProfile(name){
    if(!name) return;//must provide a profile name
    if(config.profiles[name]){
        require("./rmtree.js").rmTreeSync(fqp(name));
    	delete config.profiles[name];
    	updateProfileOnFile(name,true);
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

    var latest = JSON.parse(fs.readFileSync(config_path,"utf-8"));
    latest.profiles[this.name].buddies.push({'id':buddyID,'alias':alias});
    fs.writeFileSync(config_path,JSON.stringify(latest));

    this.buddies = config.profiles[this.name].buddies;
}
function profile_print(){
    var Table = require("cli-table");
    var table = new Table();
    table.push(
        {'profile':this.name},
        {'otrtalk-id' : this.id||this.accountname},
        {'accountname':this.accountname},
        {'protocol': this.protocol},
        {'keystore' : this.keys},
        {'instags' : this.instags},
        {'fingerprints' : this.fingerprints},
        {'otr-module' : otr_modules[this.otr?this.otr:"otr4-em"]}
    );
    console.log(table.toString());
    print_buddies( this.buddies );
}

function print_buddies(buddies){
    if(!buddies.length) return;
    var Table = require("cli-table");
    var table = new Table({
        head:['buddy','otrtalk id']
    });
    buddies.forEach( function(buddy){
        table.push( [buddy.alias, buddy.id] );
    });
    console.log(" == Buddies");
    console.log(table.toString());
}

loadConfigFile();
