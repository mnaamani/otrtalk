var events = require("events");
var util = require("util");

var serviceManager = require("./service-manager.js");

util.inherits(Main, events.EventEmitter);

var main = module.exports = new Main();

function Main() {
	events.EventEmitter.call(this);
}

Main.prototype.requestService = function (name, settings) {
	return serviceManager.request(name, settings);
};

Main.prototype.exit = function () {
	this._shutdown();
};

Main.prototype._shutdown = function () {
	if (this._shuttingDown) return;
	this._shuttingDown = true;
	var self = this;
	console.log("main controller shuting down.");
	serviceManager.stopAll(function () {
		self.emit("shutdown");
	});
};
