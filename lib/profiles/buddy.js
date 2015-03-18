var User = require("./user");

module.exports = Buddy;

function Buddy(alias, id, config, password, store) {
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

	self.id = function () {
		return id;
	};

	self.fingerprint = function () {
		var user = User.open(otrm, store.buddyKeystoreFiles(alias), password);
		var accounts = user.accounts();
		var account;
		if (accounts.length) {
			account = accounts[0];
		} else {
			account = user.account(store.name(), "otrtalk");
		}
		var fingerprints = account.contact(self.id()).fingerprints();
		var fingerprint = "";
		if (fingerprints.length) {
			fingerprint = fingerprints[0].fingerprint();
		}
		if (user.deleteVfsFiles) user.deleteVfsFiles();
		user.state.free();
		return fingerprint;
	};

	self.setupSession = function (secret) {

		var user = User.open(otrm, store.buddyKeystoreFiles(alias), password);
		var accounts = user.accounts();
		var account;
		if (accounts.length) {
			account = accounts[0];
		} else {
			account = user.account(store.name(), "otrtalk");
		}
		var contact = account.contact(self.id());
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
