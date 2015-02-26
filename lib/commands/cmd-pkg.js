module.exports = Command;

var npm = require("npm");

var packages = {
	"otr4": "otr4@0.2.1"
};

function Command(ui, action, pkg) {
	this.UI = ui;
	this.action = action;
	this.pkg = pkg;
}

Command.prototype.exec = function (callback) {
	var UI = this.UI;

	var pkg = packages[this.pkg];
	var action = this.action;

	if (!(action === 'install' || action === 'remove')) {
		callback("invalid-action");
		return;
	}

	if (!pkg) {
		UI.print("Package not found.");
		callback("invalid-package-name");
		return;
	}

	npm.load({
		loaded: false
	}, function (err) {
		// catch errors
		if (err) {
			callback(err);
			return;
		}

		npm.commands[action]([pkg], function (err, data) {
			// log the error or data
			callback(err);
		});

		npm.on("log", function (message) {
			// log the progress of the installation
			UI.print(message);
		});
	});

};
