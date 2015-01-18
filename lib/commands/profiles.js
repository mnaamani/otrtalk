var program = require('./commander.js');
var pm = require("../profile_manager.js");

module.exports = Command;

function Command(ui, action) {
	this.UI = ui;
	this.action = action;
}

Command.prototype.exec = function (cmdCallback) {
	var UI = this.UI;
	var action = this.action || "list";

	function selectProfile(next) {
		var list = [];

		if (pm.empty()) {
			next(new Error("No profiles found"));
			return;
		}

		//show a list selection of profiles to choose from.
		pm.profiles().forEach(function (prof) {
			list.push(prof);
		});
		UI.print("Select a profile:");
		program.choose(list, function (i) {
			pm.loadProfile(list[i], UI.enterPassword, next);
		});
	}

	function enterNewProfileInfo(next) {
		program.prompt("  profile name: ", function (name) {
			if (pm.profileExists(name)) {
				UI.error("Profile already exists! Choose another name");
				enterNewProfileInfo(next);
				return;
			}
			UI.print(
				"Enter an otrtalk id for this profile.\nThis is a public name that you give out to your buddies."
			);
			program.prompt("  otrtalk id: ", function (id) {
				if (!id) return;
				next(name, id);
			});
		});
	}

	switch (action) {
	case 'list':
		if (pm.empty()) {
			cmdCallback(new Error("No profiles found"));
		} else {
			pm.printList();
			cmdCallback();
		}
		break;

	case 'info':
		selectProfile(function (err, profile) {
			if (err) {
				cmdCallback(err);
				return;
			}
			profile.print();
			cmdCallback();
		});
		break;

	case 'add':
		enterNewProfileInfo(function (name, id) {
			UI.print("Creating profile and generating your OTR key...");
			pm.createProfile(name, {
				id: id,
				otr: program.otr
			}, UI.enterNewPassword, function (err, profile) {
				if (err) {
					cmdCallback(err);
					return;
				}
				profile.print();
				UI.print("created new profile:", profile.name());
				cmdCallback();
			});
		});
		break;

	case 'remove':
		selectProfile(function (err, profile) {
			if (err) {
				cmdCallback(err);
				return;
			}
			profile.print();
			program.confirm("**Are you sure you want to remove this profile [y/n]? ",
				function (ok) {
					if (ok) {
						pm.deleteProfile(profile.name());
					}
					cmdCallback();
				});
		});
		break;
	}
};
