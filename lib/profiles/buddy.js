var User = require("./user");

module.exports = Buddy;

function Buddy(alias, store, password) {
	var self = {};
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

	self.alias = function () {
		return alias;
	};

	self.fingerprints = function () {
		var user = User.open(otrm, store.buddyKeystoreFiles(alias), password);
		var accounts = user.accounts();
		var account;
		if (accounts.length === 1) {
			account = accounts[0];
		} else {
			account = user.account(store.name(), store.protocol());
		}
		var contacts = account.contacts();
		var fp, fp_array = [];
		if (contacts.length) {
			if (contacts.length === 1) {
				fp = contacts[0].fingerprints();
			} else {
				//use alias name as contact name
				fp = account.contact(alias).fingerprints();
			}
		}
		if (fp && fp.length) {
			fp.forEach(function (f) {
				if (f.trust()) fp_array.push(f.fingerprint());
			});
		}
		if (user.deleteVfsFiles) user.deleteVfsFiles();
		user.state.free();
		return fp_array;
	};

	self.setupSession = function (secret) {
		var user = User.open(otrm, store.buddyKeystoreFiles(alias), password);
		var accounts = user.accounts();
		var account;
		if (accounts.length === 1) {
			account = accounts[0];
		} else {
			account = user.account(store.name(), store.protocol());
		}
		var contact;
		var contacts = account.contacts();
		if (contacts.length) {
			if (contacts.length === 1) {
				contact = contacts[0];
			} else {
				//use alias name as contact name
				contact = account.contact(alias);
			}
		}
		return ({
			otr: contact.openSession({
				policy: otrm.POLICY.ALWAYS,
				secret: secret
			}),
			writeTrustedFingerprints: function () {
				user.writeTrustedFingerprints();
				user.saveFiles();
			},
			end: function () {
				if (user.deleteVfsFiles) user.deleteVfsFiles();
				user.state.free();
			}
		});

	};

	return self;
}
