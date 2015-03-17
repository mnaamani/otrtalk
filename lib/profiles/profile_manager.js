var Profile = require("./profile.js");
var debug = require("debug")("pm");

var otr_modules = {
	"otr4-em": "otr4-em",
	"otr4": "otr4"
};

module.exports = ProfilesManager;

function ProfilesManager(store) {
	var self = {}; //we will return self as the API to this profiles manager

	debug("Initialising Profile Manager");

	store = store || require("./otrtalk_profile_store.js");

	//return a copy of the array of profile names
	self.profiles = function () {
		return store.profiles().slice(0);
	};

	//returns total number of profiles
	self.count = function () {
		return self.profiles().length;
	};

	//returns true if no profiles exist
	self.empty = function () {
		return (self.count() ? false : true);
	};

	//returns true if there is at least one profile
	self.multiple = function () {
		return (self.count() > 1 ? true : false);
	};

	//return the name of the first profile
	self.firstProfileName = function () {
		if (self.count()) {
			return store.profiles()[0];
		}
		return undefined;
	};

	//returns true if a profile exists named lookup
	self.profileExists = function (lookup) {
		var exists = false;
		if (self.count()) {
			store.profiles().forEach(function (name) {
				if (lookup === name) exists = true;
			});
		}
		return exists;
	};

	//return an instance of a Profile loaded with configuration of the
	//profile required to be loaded and passes it to a callback
	//uiPasswordPrompt is a function that prompts the user for a password
	self.loadProfile = function (name, uiPasswordPrompt, callback) {
		var profile;
		var data = store.getProfileConfig(name);
		if (!data) {
			callback(new Error("profile not found"));
			return undefined;
		}

		//try loading profile without a password
		profile = Profile(name, data, undefined, store.bindToProfile(name));

		if (profile === -1) {
			//profile is encrypted and needs a password
			debug("profile is encrypted");
			uiPasswordPrompt(function (password) {
				profile = Profile(name, data, password, store.bindToProfile(name));
				if (profile === -1) {
					callback(new Error("wrong password"));
					return;
				}
				if (profile) profile.encrypted = true;
				callback(profile ? undefined : new Error("Unable to open profile"), profile);
			});
			return;
		}

		if (profile && profile.fingerprint()) {
			callback(undefined, profile);
			return;
		}

		callback(new Error("Unable to load profile"));
	};

	//prints a list of profile names to the console
	self.toString = function () {
		var Table = require("cli-table");
		var table = new Table({
			head: ['Profiles']
		});
		var i = 0;
		self.profiles().forEach(function (name) {
			i++;
			table.push([name]);
		});
		return table.toString();
	};

	//creates a new profile, generates OTR key and saves it to the profile store
	//returns a new instance of Profile() to the callback
	self.createProfile = function (name, data, uiPasswordPrompt, callback, skipKeyGen) {
		//profile name is used a directory name so we must restrict the character set
		//to avoid problems
		if (!name.match(/^[A-Z0-9]+$/ig)) {
			debug("creating profile: invalid profile name specified.");
			callback(new Error("invalid-profile-name"));
			return;
		}

		if (self.profileExists(name)) {
			debug("creating profile: profile already exists.");
			callback(new Error("profile-exists"));
			return;
		}

		data = data || {};

		if (data.otr && !otr_modules[data.otr]) {
			callback(new Error("invalid-otr"));
			return;
		}

		store.createProfileConfig(name, {
			'id': data.id || name,
			'otr': data.otr || 'otr4-em',
			'accountname': data.accountname || name,
			'protocol': data.protocol || 'otrtalk',
			'buddies': data.buddies || []
		});

		var new_data = store.getProfileConfig(name);

		if (uiPasswordPrompt) {
			if (typeof uiPasswordPrompt !== 'function') {
				debug("Profile Manager:createProfile, password required but no UI function provided.");
				callback(new Error("no-ui"));
				return;
			}
			uiPasswordPrompt(function (password) {
				if (!password) {
					//no password - or password mismatch!
					callback(new Error("password-mismatch"));
					return;
				}
				var profile = Profile(name, new_data, password, store.bindToProfile(name));
				if (skipKeyGen) {
					debug("Profile Manager:createProfile, skipping key generation.");
					callback(undefined, profile);
				} else {
					profile.generateKey(function (err) {
						callback(err, profile);
					});
				}
			});
		} else {
			var profile = Profile(name, new_data, undefined, store.bindToProfile(name));
			if (skipKeyGen) {
				callback(undefined, profile);
				return;
			}
			profile.generateKey(function (err) {
				callback(err, profile);
			});
		}
	};

	//delete a profile
	self.deleteProfile = function (name) {
		if (!name) {
			debug("deleteProfile: error, name not supplied");
			return;
		}

		if (!self.profileExists(name)) {
			debug("deleteProfile: error, profile doesn't exist");
			return;
		}

		store.deleteProfile(name);
	};

	return self;

}
