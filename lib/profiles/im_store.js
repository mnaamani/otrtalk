var path = require("path");
var fs = require("fs");
var debug = require("debug")("ps-im");
var imapp = require("../util/imapp.js");
var otr = require("otr4-em");

//handle different versions of node api
var fs_existsSync = fs.existsSync || path.existsSync;

module.exports = IMStore;

function getApp(app_name) {
	var app = new imapp(app_name);
	if (!app.supported()) return null;
	debug("checking for keystore file");
	if (!fs_existsSync(app.keystore())) return null;
	return app;
}

function getUser(app) {
	if (!app) return null;
	var user = new otr.User({
		keys: app.keystore(),
		fingerprints: app.fingerprintstore()
	});
	return user;
}

function makeProfilesArray(user) {
	if (!user) return [];
	var accounts = user.accounts();
	if (!accounts.length) return [];
	var profiles = [];
	accounts.forEach(function (account) {
		if (account.contacts().length) profiles.push(account.protocol() + "::" + account.name());
	});
	return profiles;
}

function IMStore(app_name) {
	var self = {};

	debug("using %s files", app_name);

	var app = getApp(app_name);
	var user = getUser(app);
	var profiles = makeProfilesArray(user);

	self.profiles = function () {
		return profiles;
	};

	self._getProfileConfig = function (name) {
		var proto_name = name.split("::"); //protocol::name
		var account = user.account(proto_name[1], proto_name[0]);
		var config = {
			keys: app.keystore(),
			instags: app.instagstore(),
			fingerprints: app.fingerprintstore(),
			id: account.name().toLowerCase(),
			accountname: account.name(),
			protocol: account.protocol(),
			buddies: [],
			otr: 'otr4-em'
		};

		account.contacts().forEach(function (contact) {
			var fingerprints = contact.fingerprints();
			var verified = false;
			//look for at least one verified fingerprint
			fingerprints.forEach(function (fp) {
				if (fp.trust()) verified = true;
			});
			if (verified) {
				config.buddies.push(contact.name().toLowerCase());
			}
		});

		return config;
	};

	self.bindToProfile = function (name) {
		var api = {};
		var config = self._getProfileConfig(name);
		var proto_name = name.split("::"); //protocol::name
		api.name = function () {
			return proto_name[1];
		};
		api.protocol = function () {
			return proto_name[0];
		};
		api.id = function () {
			return config.id;
		};
		api.buddies = function () {
			return config.buddies;
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
			return api.pathToFingerprints();
		};
		api.pathToKeys = function () {
			return config.keys;
		};
		api.pathToFingerprints = function () {
			return config.fingerprints;
		};
		api.pathToInstags = function () {
			return config.instags;
		};
		return api;
	};

	return self;
}
