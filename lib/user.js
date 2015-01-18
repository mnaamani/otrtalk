var User = module.exports;
var fcrypto = require("./file_crypto.js");
var path = require("path");
var fs = require("fs");
var os = require("os");

var fs_existsSync = fs.existsSync || path.existsSync;

if (!path.sep) {
	path.sep = (process.platform.indexOf("win") === 0) ? "\\" : "/";
}

User.open = function (otr, files, password) {
	var user;
	var real_keys = path_real(files.keys),
		real_instags = path_real(files.instags),
		real_fingerprints = path_real(files.fingerprints);

	if (password || otr.version().indexOf("emscripten") > 0) {
		user = new otr.User();

		if (files.keys && fs_existsSync(real_keys)) user.loadKeysFromFS(real_keys, decryptor(password));
		if (files.instags && fs_existsSync(real_instags)) user.loadInstagsFromFS(real_instags);
		if (files.fingerprints && fs_existsSync(real_fingerprints)) user.loadFingerprintsFromFS(
			real_fingerprints,
			decryptor(password));


		user.saveFiles = function (callback) {
			try {
				if (files.keys) user.saveKeysToFS(real_keys, encryptor(password));
				if (files.instags) user.saveInstagsToFS(real_instags);
				if (files.fingerprints) user.saveFingerprintsToFS(real_fingerprints, encryptor(password));
				if (typeof callback === "function") callback();

			} catch (e) {
				if (typeof callback === "function") callback(e);
			}
		};

	} else {
		user = new otr.User({
			keys: real_keys,
			instags: real_instags,
			fingerprints: real_fingerprints | path.join(os.tmpdir(), "fingerprints.tmp")
		});

		if (files.keys) make_path(real_keys);
		if (files.fingerprints) make_path(real_fingerprints);
		if (files.instags) make_path(real_instags);

		user.saveFiles = function (callback) {
			if (typeof callback == "function") callback();
		};
	}

	return user;
};

function path_real(p) {
	return p ? p.replace(new RegExp('/', 'g'), path.sep) : p;
}

function make_path(destination) {
	if (!fs_existsSync(path_real(path.dirname(destination)))) fs.mkdirSync(path_real(path.dirname(destination)));
}

function encryptor(password) {
	if (!password) return undefined;
	return (function (buff) {
		return fcrypto.encryptBuffer(buff, password);
	});
}

function decryptor(password) {
	if (!password) return undefined;
	return (function (buff) {
		return fcrypto.decryptBuffer(buff, password);
	});
}
