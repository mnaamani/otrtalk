module.exports.UserFiles = UserFiles;

var fcrypto = require("./file_crypto.js");
var path = require("path");
var fs = require("fs");
var os = require("os");

var fs_existsSync = fs.existsSync || path.existsSync;

if (!path.sep) {
	path.sep = (process.platform.indexOf("win") === 0) ? "\\" : "/";
}

var VFS_IMPORT_FILE_COUNTER = 0;

function UserFiles(files, VFS, password) {
	var userFiles = {};

	if (VFS) {
		if (files.keys) userFiles.keys = path_vfs(files.keys);
		if (files.fingerprints) {
			userFiles.fingerprints = path_vfs(files.fingerprints);
		} else {
			userFiles.fingerprints = path_vfs(path.join(os.tmpdir(), "fingerprints.tmp"));
		}
		if (files.instags) userFiles.instags = path_vfs(files.instags);

		try {
			if (files.keys) VFS.importFile(path_real(files.keys), userFiles.keys, decryptor(password));
			if (files.instags) VFS.importFile(path_real(files.instags), userFiles.instags);
			if (files.fingerprints) VFS.importFile(path_real(files.fingerprints), userFiles.fingerprints, decryptor(password));
		} catch (E) {
			console.log("Error: Loading key-store", E);
			process.exit();
		}

		userFiles.save = function () {
			try {
				if (files.keys) VFS.exportFile(userFiles.keys, path_real(files.keys), encryptor(password));
				if (files.instags) VFS.exportFile(userFiles.instags, path_real(files.instags));
				if (files.fingerprints) VFS.exportFile(userFiles.fingerprints, path_real(files.fingerprints), encryptor(password));
			} catch (E) {
				console.log("Error: Saving key-store", E);
				process.exit();
			}
		};

	} else {
		if (files.keys) userFiles.keys = path_real(files.keys);
		if (files.fingerprints) {
			userFiles.fingerprints = path_real(files.fingerprints);
		} else {
			userFiles.fingerprints = path.join(os.tmpdir(), "fingerprints.tmp");
		}
		if (files.instags) userFiles.instags = path_real(files.instags);
		if (files.keys) make_paths(userFiles.keys);
		if (files.fingerprints) make_paths(userFiles.fingerprints);
		if (files.instags) make_paths(userFiles.instags);
		userFiles.save = function () {};
	}

	return userFiles;
}

function path_real(p) {
	return p ? p.replace(new RegExp('/', 'g'), path.sep) : p;
}

function path_vfs(p) {
	VFS_IMPORT_FILE_COUNTER = VFS_IMPORT_FILE_COUNTER + 1;
	p = p ? p.replace(new RegExp(/\\/g), '/') : p;
	p = p ? p + "." + VFS_IMPORT_FILE_COUNTER : p;
	return p;
}

function make_paths(destination) {
	if (!fs_existsSync(path_real(path.dirname(destination)))) fs.mkdirSync(path_real(path.dirname(destination)));
}

function encryptor(password) {
	if (!password) return undefined;
	return (function (buff) {
		return fcrypto.encryptBuffer(buff, password, "accessing key-store");
	});
}

function decryptor(password) {
	if (!password) return undefined;
	return (function (buff) {
		return fcrypto.decryptBuffer(buff, password, "accessing key-store");
	});
}
