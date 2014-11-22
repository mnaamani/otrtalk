var Profile = require("./profile.js");

var otr_modules = {
    "otr3":"otr3",
    "otr4-em":"otr4-em",
    "otr4":"otr4"
}

module.exports = ProfilesManager();

function ProfilesManager(store){
  var self = {};//we will return self as the API to this profiles manager

  store = store || require("./profile_store.js");

  //return a copy of the array of profile names
  self.profiles = function(){
    return store.profiles().slice(0);
  };

  self.count = function(){
    return this.profiles().length;
  }

  self.empty = function(){
    return (this.count() ? false : true);
  }

  self.multiple = function(){
    return (this.count() > 1 ? true : false);
  }

  self.firstProfileName = function(){
    if(this.count()){
      return store.profiles()[0];
    } return undefined;
  }

  self.profileExists = function(lookup){
    var exists = false;
    if(this.count()){
      store.profiles().forEach(function(name){
        if(lookup === name) exists = true;
      });
    }
    return exists;
  }


  self.loadProfile = function(name,dont_load_otr){
    var data = store.getProfileConfig(name);
    if(!data) return undefined;
    return Profile(name,data,dont_load_otr,store);
  }

  self.printList = function (){
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

  self.createProfile = function(name,data){
      if(!name.match( /^[A-Z0-9]+$/ig)){
          console.log("Invalid profile name, use only alphanumerical characters.");
          return undefined;
      }

      if(this.profileExists(name)){
        return undefined;//dont overwrite existing profile
      }

      data = data || {};

      if(data.otr && !otr_modules[data.otr]){
          console.log(data.otr,": invalid otr module specified");
          return undefined;
      }

      store.createProfileConfig(name,{
         'id': data.id || name,
         'keys': "./"+name+"/priv.keys",
         'instags': "./"+name+"/instance.tags",
         'fingerprints': "./"+name+"/fingerprints/",  //directory
         'accountname': data.accountname || name,
         'protocol': data.protocol || 'otrtalk',
         'buddies': data.buddies || [],
         'otr': data.otr || 'otr4-em'
      });

      return this.loadProfile(name);
  };

  self.deleteProfile = function(name){
      if(!name) return;//must provide a profile name
      store.deleteProfile(name);
  }

  return self;
}
