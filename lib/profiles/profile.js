var User = require("./user");
var BuddyList = require("./buddy_list");
var debug = require("debug")("profile");

module.exports = Profile;

function Profile(store, password) {
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
		return undefined;
	}

	if (!user) return undefined;

	var accounts = user.accounts();
	var account;
	if (accounts.length === 1) {
		//profiles created with older version of otrtalk accountname may not match profile name
		//this also allows profile folder name to change without needing to change the account name in the
		//key file
		account = accounts[0];
	} else {
		account = user.account(store.name(), store.protocol());
	}

	self.buddies = BuddyList(store, password);

	self.id = function () {
		return store.id();
	};

	self.name = function () {
		return store.name();
	};

	self.save = function () {
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
			'profile': store.name()
		}, {
			'otrtalk-id': store.id()
		}, {
			'keystore': store.pathToKeys()
		}, {
			'fingerprint': fingerprint
		});
		return table.toString();
	};

	self.generateKey = function (next) {
		//only generate key once for the profile
		if (account.fingerprint()) {
			next(new Error("key already generated"));
			return;
		}

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
