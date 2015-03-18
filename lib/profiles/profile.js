var User = require("./user");
var BuddyList = require("./buddy_list");
var debug = require("debug")("profile");

module.exports = Profile;

function Profile(name, config, password, store) {
	var self = {};
	var user;
	var otrm;

	if (password) {
		otrm = require("otr4-em");
	} else {
		try {
			otrm = require("otr4");
		} catch (e) {
			otrm = require("otr4-em"); //fallback to otr4-em
		}
	}

	try {
		user = User.open(otrm, store.keystoreFiles(), password);
	} catch (e) {
		//parsing of keys file most likely failed because store is encrypted and password was not supplied
		//or decryption failed with wrong password
		return -1;
	}

	if (!user) return undefined;

	var accounts = user.accounts();
	var account;
	if (accounts.length) {
		account = accounts[0];
	} else {
		account = user.account(name, "otrtalk");
	}

	if (account.instag() === undefined) {
		account.generateInstag();
		user.saveFiles();
	}

	self.buddies = BuddyList(config, password, store);

	self.id = function () {
		return config.id;
	};

	self.name = function () {
		return name;
	};

	self.save = function () {
		store.save(config);
		user.saveFiles();
	};

	self.fingerprint = function () {
		return account.fingerprint();
	};

	//todo - print buddies
	self.toString = function () {
		var Table = require("cli-table");
		var table = new Table();
		var fingerprint = account.fingerprint();
		table.push({
			'profile': name
		}, {
			'otrtalk-id': config.id
		}, {
			'keystore': store.pathToKeys()
		}, {
			'fingerprint': fingerprint
		});
		return table.toString();
	};

	self.generateKey = function (next) {
		account.generateKey(function (err) {
			if (err) {
				next(err);
				return;
			} else {
				account.generateInstag(function (err, instag) {
					if (err) {
						next(err);
					} else {
						self.save();
						next();
					}
				});
			}
		});
	};

	self.changePassword = function (new_password, callback) {
		store.changePassword(password, new_password, function (err) {
			callback(err);
		});
	};

	return self;
}
