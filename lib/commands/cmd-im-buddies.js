var imapp = require("../util/imapp.js");
var fingerprints = require("../util/fingerprints.js");
var program = require('./commander.js');

module.exports = Command;

function Command(ui) {
	this.UI = ui;
}

Command.prototype.exec = function (cmdCallback) {
	var UI = this.UI;

	['pidgin', 'adium'].forEach(function (app) {
		var entries = new imapp(app).parseFingerprints().fingerprints();
		if (!entries.length) {
			UI.print("No", app, "buddies found.");
			return;
		}
		var Table = require("cli-table");
		var table = new Table({
			head: ['username', 'accountname', 'protocol', 'fingerprint']
		});
		entries.forEach(function (buddy) {
			var fp = fingerprints.human(buddy.fingerprint);
			table.push([buddy.username, buddy.accountname, buddy.protocol, fp]);
		});
		UI.print(" ==", app, "authenticated buddies ==");
		UI.print(table.toString());
	});
	cmdCallback();
};
