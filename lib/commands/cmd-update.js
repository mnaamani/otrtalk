module.exports = Command;
var version = require("../version.js");
var exec = require('child_process').exec;

function Command(ui) {
	this.UI = ui;
}

Command.prototype.exec = function (callback) {
	var UI = this.UI;
	UI.print("checking for new version..");
	version.checkForUpdate(function (err, new_version) {
		if (err) {
			callback(err);
			return;
		}
		if (new_version) {
			UI.print("A new version:", new_version, "is available to download.");
			//UI.print("Use npm to download and install it:\n  npm -g update otrtalk");
			update(callback);
		} else {
			UI.print("No update available.");
			UI.print("Version", version.current(), "is the latest version.");
			callback();
		}
	});

	function update(callback) {
		UI.print("running: npm -g update otrtalk");
		exec('npm -g update otrtalk',
			function (error, stdout, stderr) {
				if (stdout) console.log('stdout: ' + stdout);
				if (stderr) console.log('stderr: ' + stderr);
				callback(error);
				UI.print("If update did not install correctly try to install it manually with 'sudo'");
				UI.print("sudo npm -g update otrtalk");
			});
	}
};
