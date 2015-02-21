var events = require("events");
var util = require("util");
var debug = require("debug")("bcast");

module.exports.create = function (param) {
	return new Discover(param);
};

util.inherits(Discover, events.EventEmitter);
var enethost;
var activePeers = {};

function Discover(param) {
	var self = this;
	events.EventEmitter.call(self);
}

Discover.prototype.start = function () {
	var self = this;
	enethost = require("./manager.js").require("enet");

	self._onConnect = self._handleConnection.bind(self);
	enethost.on("connect", self._onConnect);

	self._broadcastInterval = setInterval(function () {
		debug("broadcasting");
		enethost.connect("255.255.255.255:7777", 2, 0);
	}, 20000);

	enethost.connect("255.255.255.255:7777", 2, 0);
};

Discover.prototype.stop = function () {
	var self = this;
	if (self._broadcastInterval) {
		clearInterval(self._broadcastInterval);
		delete self._broadcastInterval;
	}
	if (self._onConnect) {
		enethost.removeListener("connect", self._onConnect);
	}
};

Discover.prototype._handleConnection = function (peer, data, outgoing) {
	var self = this;
	var ip = peer.address().address;
	var port = peer.address().port;
	var ipp = ip + ":" + port;

	if (activePeers[ipp]) {
		peer.disconnectLater();
		return;
	}
	activePeers[ipp] = peer;
	peer.on("disconnect", function () {
		if (activePeers[ipp]) delete activePeers[ipp];
	});

	self.emit("peer", peer);
};
