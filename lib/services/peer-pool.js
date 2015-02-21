var events = require("events");
var util = require("util");
var iputil = require("get-telehash").iputil;
var enet = require("enet");

util.inherits(PeerPool, events.EventEmitter);

var instance; //only one peer-pool per application
var enethost;

module.exports.create = function () {
	if (instance) return instance;
	instance = new PeerPool();
	return instance;
};

function PeerPool() {
	var self = this;
	events.EventEmitter.call(self);
	self._activePeers = {};
	self._candidates = {};
	enethost = require("./manager.js").require("enet");
}

PeerPool.prototype.start = function () {
	var self = this;
	self._onConnect = self._handleConnection.bind(self);
	enethost.on("connect", self._onConnect);
};

PeerPool.prototype.stop = function () {
	var self = this;
	enethost.removeListener("connect", self._onConnect);

	for (var ipp in self._activePeers) {
		self._activePeers[ipp].disconnect();
	}

	self._candidates = {};
	self._activePeers = {};
};

PeerPool.prototype.addCandidate = function (ipp, id) {
	var self = this;
	if (self._activePeers[ipp] || self._candidates[ipp]) return;
	self._candidates[ipp] = id;

	var buf = new enet.Buffer(JSON.stringify({}));
	enethost.send(iputil.IP(ipp), iputil.PORT(ipp), buf);

	setTimeout(function () {
		enethost.connect(ipp, 2, 0, function (err, peer) {
			if (err) {
				delete self._candidates[ipp];
			}
		});
	}, Math.random() * 3000);
};

PeerPool.prototype._handleConnection = function (peer, data, outgoing) {
	var self = this;
	var ip = peer.address().address;
	var port = peer.address().port;
	var ipp = ip + ":" + port;
	var id = self._candidates[ipp];

	if (!id || self._activePeers[ipp]) {
		peer.disconnectLater();
		return;
	}

	self._activePeers[ipp] = peer;
	delete self._candidates[ipp];
	peer.on("disconnect", function () {
		delete self._activePeers[ipp];
	});
	self.emit("peer", peer, id);
};
