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
     "accountname":"alice", //accountname
     "protocol":"otrtalk", //protocolname
     "buddies":[
        {"alias":"bob", "id":"bob@otrtalk.net"}
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
     "accountname":"bob",
     "protocol":"otrtalk",
     "buddies":[
        {"alias":"alice","id":"alice@otrtalk.net"}
     ]
   }
 }
}
*/

module.exports = Profiles;

var path = require("path");
var fs = require("fs");
var fs_existsSync = fs.existsSync || path.existsSync;
var fcrypto = require("./file_crypto.js");
var tool = require("./tool.js");

var otr_modules = {
    "otr3":"otr3",
    "otr4-em":"otr4-em",
    "otr4":"otr4"
}

var USER_HOME = process.env[(process.platform == 'win32') ? 'USERPROFILE' : 'HOME'];
var OTRTALK_ROOT = path.join( USER_HOME, "/.otrtalk" );//root directory of all otrtalk config files
var CONFIG_PATH = path.join( OTRTALK_ROOT, "/id.json");//stores profiles

function fqp( p ){
  return path.join(OTRTALK_ROOT,p);
}

function readConfigFile(filename){
  var data = fs.readFileSync(filename,"utf-8");
  try{
    return JSON.parse(data);
  }catch(E){
    console.log("error parsing configuration file",filename,E);
    process.exit();
  }
}

function writeConfigFile(data,filename){
  filename = filename || this._filename;
  fs.writeFileSync(filename,JSON.stringify(data));
}

function Profiles(filename){
  this._filename = filename || CONFIG_PATH;
  this._cache = {};//cached in memory representation of id.json on file system.
  this.load();
}

Profiles.prototype.load = function(){
  var data;
  if( fs_existsSync(this._filename) ){
    this._cache = readConfigFile(this._filename);
  }else{
    console.error("creating new config file,",this._filename);
    if(!fs_existsSync(path.dirname(this._filename))) fs.mkdirSync(path.dirname(this._filename));
    this._cache = {'profiles':{}};
    writeConfigFile(this._cache,this._filename);
  }
  return this;
}

//return array of profile names
Profiles.prototype.profiles = function (){
    var profiles = [];
    if(this._cache.profiles){
      Object.keys(this._cache.profiles).forEach(function(name){
        profiles.push( name );
      });
    }
    return profiles;
}

//  profile
//gets the specified profile;
//returns undefined if not found.
//relative paths converted to fully qualified paths.
Profiles.prototype.profile = function(name){
    var data = this._cache.profiles[name];
    if(!data) return undefined;
    var profile = new Profile(name,data);
    profile._filename = this._filename;
    return profile;
}

Profiles.prototype.list = function (){
    var Table = require("cli-table");
    var table = new Table({
        head: ['Profiles']
    });
    var i = 0;
    this.profiles().forEach(function(name){
        i++;
        table.push([name]);
    });
    if(i){
      console.log(table.toString());
    }else console.log("No profiles found.");
}

Profiles.prototype.add = function(name,data,password,next){
    if(!name.match( /^[A-Z0-9]+$/ig)){
        console.log("Invalid profile name, use only alphanumerical characters.");
        return undefined;
    }

    data = data || {};

    if( data.otr && !otr_modules[data.otr]){
        console.log(data.otr,": invalid otr module specified");
        return undefined;
    }

    this._cache.profiles[name] = {
       'id': data.id || name,
       'keys': "./"+name+"/priv.keys",
       'instags': "./"+name+"/instance.tags",
       'fingerprints': "./"+name+"/fingerprints/",  //directory
       'accountname': data.accountname || name,
       'protocol': data.protocol || 'otrtalk',
       'buddies': data.buddies || [],
       'otr': data.otr || 'otr4-em'
    };

    var profile = this.profile(name);
    var user = profile.openKeyStore(undefined,password);

    console.log("Generating new OTR key...");
    user.generateKey(profile.accountname(),profile.protocol(),function(err){
      if(err){
        console.log("Error Generating Key",err);
        next('key-error');
        return;
      }else{
        if(!user.generateInstag){
          next(undefined,profile,user);
          return;
        }
        console.log("Generating Instags...");
        user.generateInstag(profile.accountname(), profile.protocol(),function(err,instag){
           if(err){
             console.log("Error Generating Instag!",err);
             next('instag-error');
           }else{
             profile.save();
             next(undefined,profile,user);
           }
        });
      }
    });
}

Profiles.prototype.remove = function(name){
    if(!name) return;//must provide a profile name
    var profile = this.profile(name);
    if(profile){
        delete this._cache.profiles[name];
        profile.remove();
    }
}

function Profile(name,config){
  this._name = name;
  this._config = config;
  this._otr = require(config.otr);
}
Profile.prototype.id = function(){
  return this._config.id;
}
Profile.prototype.keys = function(){
  return fqp(this._config.keys);
}
Profile.prototype.instags = function(){
  return fqp(this._config.instags);
}
Profile.prototype.fingerprints = function(){
  return fqp(this._config.fingerprints);
}
Profile.prototype.accountname = function(){
  return this._config.accountname;
}
Profile.prototype.protocol = function(){
  return this._config.protocol;
}
Profile.prototype.name = function(){
  return this._name;
}
Profile.prototype.otr = function(){
  return this._config.otr;
}
Profile.prototype.buddyFingerprints = function(buddy){
     return path.join(this.fingerprints() || "",buddy || "");
}
Profile.prototype.buddies = function(){
  return this._config.buddies;
}
Profile.prototype.vfs = function(){
  return (this._otr.VFS ? this._otr.VFS() : undefined);
}
Profile.prototype.needPassword = function(){
  return (this.vfs() ? true : false);
}
Profile.prototype.OTR = function(){
  return this._otr;
}
Profile.prototype.save = function(){
  //reload from file system incase it was modified by another instance of otrtalk..
  var latest = readConfigFile(this._filename);
  latest.profiles[this._name] = this._config;//update
  writeConfigFile(latest,this._filename);
  this._userFiles.save();
}

Profile.prototype.remove = function(){
  var latest = readConfigFile(this._filename);
  if(latest.profiles[this._name]){
    delete latest.profiles[this._name];
    writeConfigFile(latest,this._filename);
  }
  require("./rmtree.js").rmTreeSync(fqp(this._name));
  delete this._name;
  delete this._config;
  delete this._filename;
}

Profile.prototype.buddyID=function(alias){
    var id;//otrtalk id
    if(!this.buddies()) return undefined;
    this.buddies().forEach( function(buddy){
        if(buddy.alias == alias) id = buddy.id;
    });
    return id;
}

Profile.prototype.addBuddy = function(alias,buddyID){
    if(!alias.match( /^[A-Z0-9-_]+$/ig)){
        console.log("Invalid buddy name, use only alphanumerical characters, dashes and underscore.");
        return undefined;
    }
    if( this.buddyID(alias) ) return undefined;
    var latest = readConfigFile(this._filename);
    var buddies = latest.profiles[this._name].buddies;
    buddies.push({'id':buddyID,'alias':alias});
    this._config.buddies = buddies;
    this.save();
}

Profile.prototype.removeBuddy = function(alias){
    var buddies = [];
    var latest = readConfigFile(this._filename);
    latest.profiles[this._name].buddies.forEach(function(buddy){
        if(buddy.alias == alias) return;
        buddies.push(buddy);
    });
    this._config.buddies = buddies;
    this.save();
}

Profile.prototype.print = function(){
    var Table = require("cli-table");
    var table = new Table();
    table.push(
        {'otrtalk-id' : this.id()},
        {'accountname':this.accountname()},
        {'protocol': this.protocol()},
        {'keystore' : this.keys()},
        {'instags' : this.instags()},
        {'fingerprints' : this.fingerprints()},
        {'otr-module' : otr_modules[this.otr()?this.otr():"otr4-em"]}
    );
    console.log(" == Profile:",this.name() );
    console.log(table.toString());
}

Profile.prototype.openKeyStore = function (buddy,password){
  var UserFiles = require("./files").UserFiles;
  var files = {
    keys:this.keys(),
    fingerprints:this.buddyFingerprints(buddy),
    instags:this.instags()
  };
  this._userFiles = new UserFiles(files, this.vfs(), password);
  var otrm = this.OTR();
  return new otrm.User(this._userFiles);
}

Profile.prototype.openFingerprintsStore = function(password){
  var buddies = [];
  var self = this;
  self.buddies().forEach(function(buddy){
        var fp_file = path.join(self.fingerprints(),buddy.alias);
        if(!fs_existsSync(fp_file)){
            buddies.push({
                alias:buddy.alias,
                username:buddy.id,
                fingerprint:''
            });
            return;
        }
        var buf = fcrypto.decryptFile(fp_file,password,"accessing key-store");
        var entry = buf.toString().split(/\s+/);
        if(entry[4]==='smp') buddies.push({
            alias:buddy.alias,
            username:entry[0],
            accountname:entry[1],
            protocol:entry[2],
            fingerprint:entry[3]
        });
  });
  return buddies;
}
