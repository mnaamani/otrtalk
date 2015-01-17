module.exports = Command;
var version = require("../version.js");

function Command() {}

Command.prototype.exec = function () {
	version.checkForUpdate(function (err, new_version) {
		if (err) {
			console.error(err);
			return;
		}
		if (new_version) {
			console.log("A new version:", new_version, "is available to download.");
			console.log("Use npm to download and install it:\n  npm -g update otrtalk");
		} else {
			console.log("No update available.");
			console.log("Version", version.current(), "is the latest version.");
		}
	});
};
