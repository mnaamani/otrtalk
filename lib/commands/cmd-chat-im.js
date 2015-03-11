var program = require("./commander");

module.exports = Command;

function Command(ui) {
	this.UI = ui;
}

Command.prototype.exec = function (cmdCallback) {
	var UI = this.UI;
	var mode;
	var settings = {};
	var app = program.pidgin ? "pidgin" : undefined;
	app = program.adium ? "adium" : app;
	app = app || "pidgin";

	var store = require("../profiles/im_store.js")(app);
	var pm = require("../profiles/profile_manager.js")(store);

	function getProfile(next) {
		var list = [];

		if (!pm.empty()) {
			//show a list selection of profiles to choose from.
			pm.profiles().forEach(function (prof) {
				list.push(prof);
			});
			UI.print("Select an Account:");
			program.choose(list, function (i) {
				pm.loadProfile(list[i], undefined, next);
			});
			return;
		}

		UI.print("No Accounts Found.");
	}

	function getBuddy(profile, next) {
		var list = [];

		if (profile.buddies.aliases().length) {
			UI.print('Select Contact:');
			profile.buddies.aliases().forEach(function (alias) {
				list.push(alias);
			});
			program.choose(list, function (i) {
				next(profile.buddies.getBuddy(list[i]));
			});
			return;
		}

		UI.print("No Contacts with verified fingerprints found.");
	}

	getProfile(function (err, profile) {
		if (err) {
			cmdCallback(err);
			return;
		}
		if (!profile) return;

		settings.profile = profile;

		getBuddy(profile, function (buddy) {
			if (!buddy) {
				cmdCallback(new Error("No contact was selected"));
				return;
			}

			settings.buddy = buddy;
			settings.mode = "chat"; //force chat mode!
			cmdCallback(undefined, "chat", settings);
		});
	});
};
