var program = require('./commander.js');
var pm = require("../profile_manager.js");

module.exports = Command;

function Command(ui, action) {
	this.UI = ui;
	this.action = action;
}

Command.prototype.exec = function (cmdCallback) {
	var UI = this.UI;
	var action = this.action;

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

	action = action || "list";

	switch (action) {

	case 'remove':

		selectProfile(function (err, profile) {
			if (err) {
				cmdCallback(err);
				return;
			}
			var list = [];
			if (profile.buddies.aliases().length) {
				UI.print('Select buddy:');
				profile.buddies.aliases().forEach(function (alias) {
					list.push(alias);
				});
				program.choose(list, function (i) {
					program.confirm("Are you sure you want to remove buddy: " + list[i] +
						" [y/n]? ",
						function (ok) {
							if (ok) {
								var removed = profile.buddies.deleteBuddy(list[i]);
								if (removed) {
									UI.print("Removed buddy:", list[i]);
								} else {
									UI.error("Unable to remove buddy");
								}
							}
							cmdCallback();
						});
				});
				return;
			}
		});
		break;

	case 'list':

		selectProfile(function (err, profile) {
			if (profile) {
				UI.print(profile.buddies.toString());
				cmdCallback();
			} else {
				cmdCallback(err);
			}

		});

		break;
	}
};
