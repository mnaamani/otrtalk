var path = require("path");
var fs = require("fs");
var debug = require("../debug.js");

//handle different versions of node api
var fs_existsSync = fs.existsSync || path.existsSync;

var USER_HOME = process.env[(process.platform == 'win32') ? 'USERPROFILE' : 'HOME'];
var OTRTALK_ROOT = path.join(USER_HOME, ".otrtalk"); //root directory of all otrtalk config files
var CONFIG_PATH = path.join(OTRTALK_ROOT, "id.json"); //stores profiles

module.exports = FileStore();

function FileStore() {
	var self = {};

	var cache = {
		'profiles': {}
	}; //cached in memory representation of id.json on file system.

	debug("Starting Profile File Store");

	if (!fs_existsSync(CONFIG_PATH)) {
		debug("creating new config file,", CONFIG_PATH);
		if (!fs_existsSync(path.dirname(CONFIG_PATH))) {
			fs.mkdirSync(path.dirname(CONFIG_PATH));
		}
		writeConfigFile(cache);
	} else {
		cache = readConfigFile();
	}

	function readConfigFile() {
		var data = fs.readFileSync(CONFIG_PATH, "utf-8");
		try {
			return JSON.parse(data);
		} catch (E) {
			console.log("Fatal Error parsing profile configuration file", CONFIG_PATH, E);
			process.exit();
		}
	}

	function writeConfigFile(data) {
		fs.writeFileSync(CONFIG_PATH, JSON.stringify(data));
	}

	//return fully qualified path to file relative to user otrtalk config directory
	function fullyQualifiedPath(filename) {
		return path.join(OTRTALK_ROOT, filename);
	}

	//return array of profile names
	self.profiles = function () {
		var profiles = [];
		if (cache.profiles) {
			Object.keys(cache.profiles).forEach(function (name) {
				profiles.push(name);
			});
		}
		return profiles;
	};

	self.getProfileConfig = function (name) {
		return cache.profiles[name];
	};

	//return a minimal API of the store bound to a profile name
	//to be used in profile,buddy lists and buddy objects
	self.bindToProfile = function (name) {
		var api = {};
		var config = self.getProfileConfig(name);
		api.save = function () {
			self.saveProfileConfig(name, config);
		};
		api.keystoreFiles = function () {
			return ({
				keys: api.pathToKeys(),
				instags: api.pathToInstags()
			});
		};
		api.buddyKeystoreFiles = function (alias) {
			return ({
				keys: api.pathToKeys(),
				fingerprints: api.buddyFingerprintsFile(alias),
				instags: api.pathToInstags()
			});
		};
		api.buddyFingerprintsFile = function (alias) {
			return path.join(api.pathToFingerprints(), alias);
		};
		api.pathToKeys = function () {
			return fullyQualifiedPath(config.keys);
		};
		api.pathToFingerprints = function () {
			return fullyQualifiedPath(config.fingerprints);
		};
		api.pathToInstags = function () {
			return fullyQualifiedPath(config.instags);
		};
		api.addBuddy = function (alias, id) {
			if (self.addBuddyToProfile(name, {
					alias: alias,
					id: id
				})) {
				api.save();
				return true;
			}
			return false;
		};
		api.removeBuddy = function (alias) {
			var file = api.buddyFingerprintsFile(alias);
			if (self.removeBuddyFromProfile(name, alias)) {
				if (fs_existsSync(file)) {
					fs.unlink(file);
				}
				api.save();
				return true;
			}
			return false;
		};
		return api;
	};

	self.saveProfileConfig = function (name, data) {
		var latest = readConfigFile();
		latest.profiles[name] = data;
		writeConfigFile(latest);
	};

	self.createProfileConfig = function (name, data) {
		data.keys = "./" + name + "/priv.keys";
		data.instags = "./" + name + "/instance.tags";
		data.fingerprints = "./" + name + "/fingerprints/";
		cache.profiles[name] = data;
	};

	self.deleteProfile = function (name) {
		if (cache.profiles[name]) {
			delete cache.profiles[name];
			var latest = readConfigFile();
			if (latest.profiles[name]) {
				delete latest.profiles[name];
				writeConfigFile(latest);
			}
			require("../util/rmtree.js").rmTreeSync(fullyQualifiedPath(name));
		}
	};

	self.addBuddyToProfile = function (name, newbuddy) {
		if (!newbuddy.alias.match(/^[A-Z0-9-_]+$/ig)) {
			return false;
		}
		var buddy_exists = false;
		var latest = readConfigFile();
		var buddies = latest.profiles[name].buddies;
		buddies.forEach(function (buddy) {
			if (buddy.alias == newbuddy.alias) buddy_exists = true;
		});
		if (buddy_exists) {
			return false;
		}
		buddies.push(newbuddy);
		cache.profiles[name].buddies = buddies;
		return true;
	};

	self.removeBuddyFromProfile = function (name, alias) {
		var buddies = [];
		var latest = readConfigFile();
		var buddy_removed = false;
		latest.profiles[name].buddies.forEach(function (buddy) {
			if (buddy.alias == alias) {
				buddy_removed = true;
				return;
			}
			buddies.push(buddy);
		});
		cache.profiles[name].buddies = buddies;
		return buddy_removed;
	};

	self.pathTo = fullyQualifiedPath;

	return self;
}

/*
  This module manages the profiles used by otr-talk
  profiles are saved in $(HOME)/.otrtalk/id.json
*/

/* example id.json file
{
 "profiles":{
   "alice":{
	 "keys":"./alice/priv.keys",		//path to DSA private keys file relative to id file.
	 "instags":"./alice/instance.tags",  //path to instance tags file relative to id file
	 "fingerprints":"./alice/fingerprints/",	//path to unique fingerprints 'directory' relative to id file.
	 "accountname":"alice", //accountname
	 "protocol":"otrtalk", //protocolname
	 "buddies":[
		{"alias":"bob", "id":"bob@otrtalk.net"}
	 ],
	 otr:'otr4-em'          //otr module to use
   },
   "bob":{
	 "keys":"./bob/priv.keys",		//common keys and instags files may be used
	 "instags":"./bob/instance.tags",
	 "fingerprints":"./bob/fingerprints/",//each profile *must* use a different fingerprints directory
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
