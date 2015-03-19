var path = require("path");
var fs = require("fs");
var debug = require("debug")("ps-otrtalk");
var fcrypto = require("./file_crypto.js");
var dir = require("node-dir");

//handle different versions of node api
var fs_existsSync = fs.existsSync || path.existsSync;

var USER_HOME = process.env[(process.platform == 'win32') ? 'USERPROFILE' : 'HOME'];
//root directory of all otrtalk profile files
var OTRTALK_ROOT = path.join(USER_HOME, ".otrtalk");

module.exports = FileStore();

//return fully qualified path to file relative to user's otrtalk config directory
function fullyQualifiedPath(filename) {
	return path.join(OTRTALK_ROOT, filename);
}

(function () {
	//older versions of otrtalk stored profile info in id.json
	var CONFIG_PATH = path.join(OTRTALK_ROOT, "id.json");
	//this is an update step to copy the profile otrtalk-id to an id file in the profile folder
	if (fs_existsSync(CONFIG_PATH)) {
		var data = fs.readFileSync(CONFIG_PATH, "utf-8");
		try {
			var info = JSON.parse(data);
			if (info.profiles) {
				Object.keys(info.profiles).forEach(function (name) {
					var idfile = path.join(fullyQualifiedPath(name), "id");
					if (fs_existsSync(fullyQualifiedPath(name))) {
						if (!fs_existsSync(idfile)) {
							fs.writeFileSync(idfile, info.profiles[name].id || name);
						}
					}
				});
			}
			fs.unlink(CONFIG_PATH);
		} catch (e) {
			console.log("error upgrading configuration file", CONFIG_PATH, e);
		}
	}
})();

function FileStore() {
	var self = {};

	//return array of profile names
	self.profiles = function () {
		var profiles = [];
		fs.readdirSync(OTRTALK_ROOT).forEach(function (name) {
			if (fs.statSync(path.join(OTRTALK_ROOT, name)).isDirectory()) {
				profiles.push(name);
			}
		});
		return profiles;
	};

	self.deleteProfile = function (name) {
		require("../util/rmtree.js").rmTreeSync(fullyQualifiedPath(name));
	};

	self.createProfile = function (name, id) {
		var profile_dir = path.join(OTRTALK_ROOT, name);
		var idfile = path.join(profile_dir, "id");
		fs.mkdirSync(profile_dir);
		fs.writeFileSync(idfile, id);
	};

	self.pathTo = fullyQualifiedPath;

	//return a minimal API of the store bound to a profile name
	//to be used in profile,buddy lists and buddy objects
	self.bindToProfile = function (name) {
		var api = {};

		api.id = function () {
			var profile_dir = path.join(OTRTALK_ROOT, name);
			var idfile = path.join(profile_dir, "id");
			if (!fs_existsSync(idfile)) return undefined;
			return fs.readFileSync(idfile, "utf-8").toString().trim().replace("\n", "");
		};

		api.buddies = function () {
			var profile_dir = path.join(OTRTALK_ROOT, name);
			var fp_dir = path.join(profile_dir, "fingerprints");
			var buddies = [];
			if (!fs_existsSync(fp_dir)) return [];
			fs.readdirSync(fp_dir).forEach(function (alias) {
				buddies.push(alias);
			});
			return buddies;
		};

		api.name = function () {
			return name;
		};

		api.protocol = function () {
			return "otrtalk";
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
			return path.join(fullyQualifiedPath(name), "priv.keys");
		};

		api.pathToFingerprints = function () {
			return path.join(fullyQualifiedPath(name), "fingerprints");
		};

		api.pathToInstags = function () {
			return path.join(fullyQualifiedPath(name), "instance.tags");
		};

		api.removeBuddy = function (alias) {
			var file = api.buddyFingerprintsFile(alias);
			if (fs_existsSync(file)) {
				fs.unlink(file);
			}
		};

		api.changePassword = function (oldpassword, newpassword, callback) {
			try {
				//private key file
				var buff = fcrypto.decryptFile(api.pathToKeys(), oldpassword);
				buff = fcrypto.encryptBuffer(buff, newpassword);
				fs.writeFileSync(api.pathToKeys(), buff);

				//fingerprints directory - one file per buddy
				if (fs_existsSync(api.pathToFingerprints())) {
					dir.files(api.pathToFingerprints(), function (err, files) {
						if (!err) {
							files.forEach(function (file) {
								var buff = fcrypto.decryptFile(file, oldpassword);
								buff = fcrypto.encryptBuffer(buff, newpassword);
								fs.writeFileSync(file, buff);
							});
						}
						callback();
					});
				} else {
					callback();
				}
			} catch (e) {
				callback(e);
			}
		};
		return api;
	};

	return self;
}
