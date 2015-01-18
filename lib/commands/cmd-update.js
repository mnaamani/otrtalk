module.exports = Command;
var version = require("../version.js");

function Command(ui) {
	this.UI = ui;
}

Command.prototype.exec = function (callback) {
	var UI = this.UI;
	version.checkForUpdate(function (err, new_version) {
		if (err) {
			callback(err);
			return;
		}
		if (new_version) {
			UI.print("A new version:", new_version, "is available to download.");
			UI.print("Use npm to download and install it:\n  npm -g update otrtalk");
		} else {
			UI.print("No update available.");
			UI.print("Version", version.current(), "is the latest version.");
		}
		callback();
	});
};
