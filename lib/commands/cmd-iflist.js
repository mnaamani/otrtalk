var program = require('./commander.js');
var os = require("os");

module.exports = Command;

function Command(ui) {
	this.UI = ui;
}

Command.prototype.exec = function (cmdCallback) {
	var UI = this.UI;

	var ifaces = os.networkInterfaces();
	var iface;

	for (iface in ifaces) {
		ifaces[iface].filter(function (addr) {
			if (addr.internal) return false;
			if (addr.family === 'IPv6') return false;
			return true;
		}).forEach(function (i) {
			UI.print(iface, i.address);
		});
	}

	cmdCallback();
};
