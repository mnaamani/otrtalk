var User = require("./user");

module.exports = Buddy;

function Buddy(alias, id, store, password) {
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
		if (id) return id; //new buddy or id passed in by chat-im
		var user = User.open(otrm, store.buddyKeystoreFiles(alias), password);
		var accounts = user.accounts();
		var account;
		if (accounts.length === 1) {
			account = accounts[0];
		} else {
			account = user.account(store.name(), store.protocol());
		}
		var contacts = account.contacts();
		var buddyid;

		if (contacts.length) {
			buddyid = contacts[0].name();
		}
		if (user.deleteVfsFiles) user.deleteVfsFiles();
		user.state.free();
		return buddyid;
	};

	self.fingerprint = function () {
		if (!self.id()) return "";
		var user = User.open(otrm, store.buddyKeystoreFiles(alias), password);
		var accounts = user.accounts();
		var account;
		if (accounts.length === 1) {
			account = accounts[0];
		} else {
			account = user.account(store.name(), store.protocol());
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
		if (accounts.length === 1) {
			account = accounts[0];
		} else {
			account = user.account(store.name(), store.protocol());
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
