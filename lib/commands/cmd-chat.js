var program = require("./commander");
var imapp = require("../imapp.js");
var tool = require("../tool.js");
var talk = require("../talk.js");
var pm = require("../profile_manager.js");
var endTalk;
module.exports = Command;

function Command(ui, alias, mode) {
	this.UI = ui;
	this.alias = alias;
	this.mode = mode;
}

Command.prototype.exit = function () {
	if (endTalk) endTalk();
	setTimeout(function () {
		process.exit();
	}, 350);
};

Command.prototype.exec = function (cmdCallback) {
	var UI = this.UI;
	var alias = this.alias;
	var mode = this.mode;

	var settings = {};
	settings.verbose = program.verbose;
	settings.interface = program.interface;
	settings.lan = program.lan;

	function getProfile(next) {
		var list = [];

		if (!pm.empty()) {
			//show a list selection of profiles to choose from.
			pm.profiles().forEach(function (prof) {
				list.push(prof);
			});
			UI.print("Select a profile:");
			program.choose(list, function (i) {
				pm.loadProfile(list[i], UI.enterPassword, next);
			});
			return;
		}

		//no profiles exist at all.. create a new one
		UI.print("No profile exists, let's create one now.");

		var _cmd = require("./cmd-profiles.js");
		var cmd = new _cmd(UI, "add");
		cmd.exec(cmdCallback);
	}

	function getBuddy(profile, alias, next) {
		var list = [];

		if (alias) {
			var buddy = profile.buddies.getBuddy(alias);
			if (buddy) {
				return next(buddy);
			}
			UI.print("Buddy not found.");
			program.confirm("  add [" + alias + "] to your buddy list now [y/n]? ", function (ok) {
				if (ok) {
					program.prompt("  " + alias + "'s otrtalk id: ", function (id) {
						if (!id) return;
						profile.buddies.createBuddy(alias, id);
						next(profile.buddies.getBuddy(alias));
					});
				} else next();
			});
			return;
		}

		if (profile.buddies.aliases().length) {
			UI.print('Select buddy:');
			profile.buddies.aliases().forEach(function (alias) {
				list.push(alias);
			});
			program.choose(list, function (i) {
				next(profile.buddies.getBuddy(list[i]));
			});
			return;
		}

		UI.print("No buddy specified, and your buddy list is empty.");
		UI.print("Enter new buddy details:");
		program.prompt("  alias: ", function (alias) {
			program.prompt("  " + alias + "'s otrtalk id: ", function (id) {
				if (!id) return;
				profile.buddies.createBuddy(alias, id);
				next(profile.buddies.getBuddy(alias));
			});
		});
	}

	//todo - double prompt for the secret
	function smpSecret(mode, secret, next) {
		if (mode == 'connect' && !secret) {
			UI.print("When establishing a new trust with a buddy you must provide a shared secret.");
			UI.print("This will be used by SMP authentication during connection establishment.");
			program.password("Enter SMP secret: ", "", function (secret) {
				next(secret);
			});
		} else {
			next(secret);
		}
	}

	getProfile(function (err, profile) {
		if (err) {
			cmdCallback(err);
			return;
		}
		if (!profile) return;

		settings.id = profile.id();

		getBuddy(profile, alias, function (buddy) {
			if (!buddy) {
				cmdCallback(new Error("No Buddy was selected or created to communicate with"));
				return;
			}
			if (buddy.id() == profile.id()) {
				cmdCallback(new Error(
					"otrtalk id conflict. Profile and buddy have same otrtalk id."));
				return;
			}
			settings.buddy = buddy.alias();
			settings.buddyID = buddy.id();

			//if the fingerprint exists.. we have already trusted buddy fingerprint
			if (buddy.fingerprint()) {
				if (mode == 'connect') {
					UI.print("You already have a trust with this buddy.\nSwitching to 'chat' mode.");
					mode = 'chat';
				}
			} else {
				if (mode == 'chat') {
					UI.print(
						"You haven't yet established a trust with this buddy.\nSwitching to 'connect' mode."
					);
					mode = 'connect';
				}
			}

			settings.mode = mode;
			settings.network = "telehash";
			settings.seed = program.seed;
			settings.port = program.port ? parseInt(program.port) : undefined;
			settings.upnp = program.upnp;

			if (program.broadcast) {
				settings.network = "broadcast";
			}

			//esnure fingerprint if entered as option is correctly formatted
			if (mode == 'connect') {
				if (program.fingerprint && !tool.validateFP(program.fingerprint)) {
					cmdCallback(new Error("Invalid fingerprint provided"));
					return;
				}
				settings.fingerprint = tool.validateFP(program.fingerprint);
				if (program.pidgin || program.adium) {
					UI.print("parsing IM app fingerprints");
					settings.trusted_fingerprints = new imapp(program.pidgin ? "pidgin" : "adium").parseFingerprints();
				}
			}

			//ensure we have a secret if we are in connect mode.
			smpSecret(mode, program.secret, function (secret) {
				settings.secret = secret;
				endTalk = talk.launch(settings, buddy.setupSession(secret));
				cmdCallback();
			});

		});
	});
};
