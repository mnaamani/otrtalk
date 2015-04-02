var events = require("events");
var util = require("util");
var debug = require("debug")("bcast");

module.exports.create = function (param) {
	return new Discover(param);
};

util.inherits(Discover, events.EventEmitter);

function Discover(param) {
	var self = this;
	events.EventEmitter.call(self);
	self._settings = param;
}

Discover.prototype.start = function () {
	var self = this;
	var bcast = require("./manager.js").require("broadcast");

	self._broadcastInterval = setInterval(function () {
		self._announce();
	}, 10000);

	self._announce();

	bcast.on("announcement", function (announcement) {
		//check it is who we are looking for
		if (self._settings.remoteid !== announcement.id) return;
		if (!announcement.port) return;
		var ipp = announcement.ip + ":" + announcement.port;
		self.emit("candidate", ipp);
	});
};

Discover.prototype.stop = function () {
	var self = this;
	if (self._broadcastInterval) {
		clearInterval(self._broadcastInterval);
		delete self._broadcastInterval;
	}
};

Discover.prototype._announce = function () {
	var self = this;
	var addr = require("./manager.js").require("socket").address();
	if (!addr) return;
	var bcast = require("./manager.js").require("broadcast");

	var announcement = JSON.stringify({
		id: self._settings.localid,
		port: addr.port
	});

	bcast.announce(new Buffer(announcement), self._settings.address || "255.255.255.255");
};
