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
var UserFiles = require("./files").UserFiles;

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

function Profiles(filename){
  var self = {};//we will return self as the API to this profiles manager

  filename = filename || CONFIG_PATH;
  var cache = {'profiles':{}};//cached in memory representation of id.json on file system.

  function readConfigFile(){
    var data = fs.readFileSync(filename,"utf-8");
    try{
      return JSON.parse(data);
    }catch(E){
      console.log("error parsing configuration file",filename,E);
      process.exit();
    }
  }

  function writeConfigFile(data){
    fs.writeFileSync(filename,JSON.stringify(data));
  }

  //return array of profile names
  self.profiles = function (){
      var profiles = [];
      if(cache.profiles){
        Object.keys(cache.profiles).forEach(function(name){
          profiles.push(name);
        });
      }
      return profiles;
  }

  self.count = function(){
    return this.profiles().length;
  }

  self.empty = function(){
    return (this.count() ? false : true);
  }

  self.multiple = function(){
    return (this.count()>1 ? true : false);
  }

  self.firstProfileName = function(){
    if(this.count()){
      return this.profiles()[0];
    } return undefined;
  }

  self.exists = function(lookup){
    var exists = false;
    if(cache.profiles){
      Object.keys(cache.profiles).forEach(function(name){
        if(lookup === name) exists = true;
      });
    }
    return exists;
  }

  //  profile
  //gets the specified profile;
  //returns undefined if not found.
  //relative paths converted to fully qualified paths.
  self.profile = function(name,dont_load_otr){
    var data = cache.profiles[name];
    if(!data) return undefined;
    var profile = makeProfile(name,data,dont_load_otr,function(new_config){
      //callback used by profile when it updates itself and needs to be saved
      var latest = readConfigFile(filename);
      latest.profiles[name] = new_config;//update
      writeConfigFile(latest);
    },readConfigFile);
    return profile;
  }

  self.list = function (){
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

  self.add = function(name,data){
      if(!name.match( /^[A-Z0-9]+$/ig)){
          console.log("Invalid profile name, use only alphanumerical characters.");
          return undefined;
      }

      if(cache.profiles[name]){
        return undefined;//dont overwrite existing profile
      }

      data = data || {};

      if( data.otr && !otr_modules[data.otr]){
          console.log(data.otr,": invalid otr module specified");
          return undefined;
      }

      cache.profiles[name] = {
         'id': data.id || name,
         'keys': "./"+name+"/priv.keys",
         'instags': "./"+name+"/instance.tags",
         'fingerprints': "./"+name+"/fingerprints/",  //directory
         'accountname': data.accountname || name,
         'protocol': data.protocol || 'otrtalk',
         'buddies': data.buddies || [],
         'otr': data.otr || 'otr4-em'
      };

      return this.profile(name);
  };

  self.remove = function(name){
      if(!name) return;//must provide a profile name
      if(cache.profiles[name]){
          delete cache.profiles[name];
          var latest = readConfigFile();
          if(latest.profiles[name]){
            delete latest.profiles[name];
            writeConfigFile(latest);
          }
          require("./rmtree.js").rmTreeSync(fqp(name));
      }
  }

  if(fs_existsSync(filename)){
    cache = readConfigFile();
  }else{
    console.error("creating new config file,",filename);
    if(!fs_existsSync(path.dirname(filename))){
      fs.mkdirSync(path.dirname(filename));
    }
    writeConfigFile(cache);
  }
  return self;
}

function makeProfile(name,config,dont_load_otr,update_callback,readConfigFile){
  var self = {};
  var otrm = dont_load_otr ? undefined : require(config.otr);

  self.id = function(){
    return config.id;
  }
  self.keys = function(){
    return fqp(config.keys);
  }

  self.instags = function(){
    return fqp(config.instags);
  }

  self.fingerprints = function(){
    return fqp(config.fingerprints);
  }
  self.accountname = function(){
    return config.accountname;
  }
  self.protocol = function(){
    return config.protocol;
  }
  self.name = function(){
    return name;
  }
  self.otr = function(){
    return config.otr;
  }

  self.vfs = function(){
    return (otrm.VFS ? otrm.VFS() : undefined);
  }

  self.needPassword = function(){
    return (this.vfs() ? true : false);
  }

  self.save = function(){
    //reload from file system incase it was modified by another instance of otrtalk..
    update_callback(config);
  }

  self.buddyFingerprints = function(buddy){
       return path.join(this.fingerprints() || "",buddy || "");
  }

  self.buddies = function(){
    return config.buddies;
  }

  self.buddyID=function(alias){
      var id;//otrtalk id
      if(!this.buddies()) return undefined;
      this.buddies().forEach( function(buddy){
          if(buddy.alias == alias) id = buddy.id;
      });
      return id;
  }

  self.addBuddy = function(alias,buddyID){
      if(!alias.match( /^[A-Z0-9-_]+$/ig)){
          console.log("Invalid buddy name, use only alphanumerical characters, dashes and underscore.");
          return undefined;
      }
      if( this.buddyID(alias) ) return undefined;
      var latest = readConfigFile();
      var buddies = latest.profiles[name].buddies;
      buddies.push({'id':buddyID,'alias':alias});
      config.buddies = buddies;
      this.save();
  }

  self.removeBuddy = function(alias){
      var buddies = [];
      var latest = readConfigFile();
      latest.profiles[name].buddies.forEach(function(buddy){
          if(buddy.alias == alias) return;
          buddies.push(buddy);
      });
      config.buddies = buddies;
      this.save();
  }

  self.parseFingerprintFiles = function(password){
    var buddies = [];
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

  self.print = function(){
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
      console.log(" == Profile:",name);
      console.log(table.toString());
  }

  self.openKeyStore = function (buddy,password){

    var profile = this;

    return (function(){
        var files = {
          keys:profile.keys(),
          fingerprints:profile.buddyFingerprints(buddy),
          instags:profile.instags()
        };
        var userFiles = new UserFiles(files, profile.vfs(), password);
        var user = new otrm.User(userFiles);

        return ({
          save:function(){
            userFiles.save();
          },
          accounts:function(){
            return user.accounts();
          },
          print:function(header){
            var Table = require("cli-table");
            var table = new Table({
                head:['accountname','protocol','fingerprint']
            });
            user.accounts().forEach(function(account){
                table.push([account.accountname,account.protocol,account.fingerprint]);
            });
            if(header) console.log(header);
            console.log(table.toString());
          },
          generateKey: function(next){
              console.log("Generating new OTR key...");
              user.generateKey(profile.accountname(),profile.protocol(),function(err){
                if(err){
                  console.log("Error Generating Key",err);
                  next('key-error');
                  return;
                }else{
                  if(!user.generateInstag){
                    next();
                    return;
                  }
                  console.log("Generating Instags...");
                  user.generateInstag(profile.accountname(), profile.protocol(),function(err,instag){
                     if(err){
                       console.log("Error Generating Instag!",err);
                       next('instag-error');
                     }else{
                       userFiles.save();
                       next();
                     }
                  });
                }
            });
          },
          importKey: function(privkey){
            try{
              user.importKey(profile.name(),"otrtalk",privkey);
              profile.print();
              this.print();
              userFiles.save();
              console.log("Imported key successfully to profile:",profile.name());
              return;//success
            }catch(E){
              console.log("Key Import Failed!",E);
            }
          },
          otrSessionMaker: function(secret){
            return (function(){
                var user = new otrm.User(userFiles);
                var context = user.ConnContext(profile.accountname(), profile.protocol(), profile.buddyID(buddy));
                return ({
                  otr: new otrm.Session(user, context, {policy:otrm.POLICY("ALWAYS"), secret:secret}),
                  context: context,
                  writeTrustedFingerprints:function(){
                    user.writeTrustedFingerprints();
                    userFiles.save();
                  },
                  end:function(){
                    user.state.free();
                    delete user;
                  }
                });
             });
          }
        });
    }());
  }

  return self;

}
