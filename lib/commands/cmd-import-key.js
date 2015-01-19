var fs = require("fs");
var path = require("path");
var fs_existsSync = fs.existsSync || path.existsSync;
var os = require("os");
var imapp = require("../imapp.js");
var program = require('./commander.js');
var pm = require("../profile_manager.js");

module.exports = Command;

function Command(ui, app, profilename, id) {
	this.UI = ui;
	this.app = app;
	this.profilename = profilename;
	this.id = id;
}

Command.prototype.exec = function (cmdCallback) {
	var UI = this.UI;
	var app = this.app;
	var profilename = this.profilename;
	var id = this.id;

	var filename;

	profilename = profilename || program.profile;

	if (!app) {
		UI.error("You did not specify an application.");
		UI.error("specify either: pidgin or adium");
		cmdCallback(new Error("IM app not specified"));
		return;
	}

	var im = new imapp(app);
	if (!im.valid()) {
		UI.error("I don't know about this application:", app);
		cmdCallback(new Error("Unknown IM app"));
		return;
	}

	if (!im.supported()) {
		UI.error("I don't know how to import", app, "keys on", process.platform);
		cmdCallback(new Error("Cannot locate IM app keystore files on this platform"));
		return;
	}

	if (!profilename) {
		cmdCallback(new Error("Target profile name for import not specified!\n"));
		return;
	}

	filename = im.keystore();
	UI.print("looking for key-store:", filename);
	if (fs_existsSync(filename)) {

		//check if profile already exists - don't overwrite!
		if (pm.profileExists(profilename)) {
			UI.error("Profile '" + profilename +
				"' already exists. Please specify a different profile to import into.");
			cmdCallback(new Error("Profile Exists"));
			return;
		}

		selectAccountToImport(UI, filename, function (err, privkey) {
			if (err) {
				cmdCallback(err);
				return;
			}
			pm.createProfile(profilename, {
				id: id,
				otr: program.otr
			}, UI.enterNewPassword, function (err, profile) {
				if (err) {
					UI.error("Failed to add new profile.");
					cmdCallback(err);
					return;
				}
				UI.print("Importing Key...");
				profile.importKey(privkey, function (err) {
					if (err) {
						UI.error("Key import failed.");
						cmdCallback(err);
						return;
					}
					UI.print("Key import complete.");
					UI.print(profile.toString());
					cmdCallback();
				});
			}, true);
		});
	} else {
		cmdCallback(new Error("key-store file not found."));
	}
};

function selectAccountToImport(UI, filename, next) {
	var source = {};

	if (!(program.otr == "otr4-em" || program.otr == "otr4")) {
		next(new Error("error: Only supported otr modules for import are otr4-em and otr4"));
		return;
	}

	source.otrm = require("otr4-em");

	source.user = new source.otrm.User({
		keys: filename
	});

	UI.print("Select an account to import:");
	var list = [];
	var accounts = source.user.accounts();

	if (!accounts.length) {
		next(new Error("no accounts found"));
		return;
	}

	accounts.forEach(function (account) {
		list.push(account.protocol() + ":" + account.name());
	});

	program.choose(list, function (i) {
		var privkey = source.user.account(accounts[i].name(), accounts[i].protocol()).exportKey();
		next(undefined, privkey);
	});
}
