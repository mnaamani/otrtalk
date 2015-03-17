var program = require('./commander.js');
var pm = require("../profiles/profile_manager.js")();

module.exports = Command;

function Command(ui, action) {
	this.UI = ui;
	this.action = action;
}

Command.prototype.exec = function (cmdCallback) {
	var UI = this.UI;
	var action = this.action || "list";

	function selectProfile(next, noprompt) {
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
			pm.loadProfile(list[i], noprompt ? undefined : UI.enterPassword, next);
		});
	}

	function enterNewProfileInfo(next) {
		UI.print("Enter a profile name (alphanumeric characters only)");
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
			UI.print(pm.toString());
			cmdCallback();
		}
		break;

	case 'info':
		selectProfile(function (err, profile) {
			if (err) {
				cmdCallback(err);
				return;
			}
			UI.print(profile.toString());
			cmdCallback();
		});
		break;

	case 'add':
		enterNewProfileInfo(function (name, id) {
			UI.print("Creating profile and generating your OTR key...");
			pm.createProfile(name, {
				id: id
			}, program.encrypted ? UI.enterNewPassword : undefined, function (err, profile) {
				if (err) {
					cmdCallback(err);
					return;
				}
				UI.print(profile.toString());
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
			UI.print(profile.toString());
			program.confirm("**Are you sure you want to remove this profile [y/n]? ",
				function (ok) {
					if (ok) {
						pm.deleteProfile(profile.name());
					}
					cmdCallback();
				});
		}, true);
		break;

	case 'set-password':
		// re-encrypt key and fingerprints file of the profile with a new password
		selectProfile(function (err, profile) {
			if (err) {
				cmdCallback(err);
				return;
			}
			//prompt for new password
			UI.enterNewPassword(function (new_password) {
				if (new_password) {
					profile.changePassword(new_password, function (err) {
						if (!err) UI.print("password changed successfully.");
						cmdCallback(err);
					});
				} else {
					cmdCallback();
				}
			});
		});
		break;

	case 'remove-password':
		//keep key and fingerprints files of the profile in cleartext - (for export or to use otr4 module)
		selectProfile(function (err, profile) {
			if (err) {
				cmdCallback(err);
				return;
			}
			if (profile.encrypted) {
				profile.changePassword(undefined, function (err) {
					if (!err) UI.print("password removed");
					cmdCallback(err);
				});
			} else {
				UI.print("profile is not encrypted");
				cmdCallback();
			}
		});
		break;

	default:
		cmdCallback("Invalid profiles sub command");
		break;
	}
};
