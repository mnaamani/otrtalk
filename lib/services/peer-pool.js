var events = require("events");
var util = require("util");

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
	self._connectingPeers = {};
	self._candidates = {};

	enethost = require("../service-manager.js").require("enet");
	enethost.on("connect", function (peer, data, outgoing) {
		self._handleConnection(peer, data, outgoing);
	});
}

PeerPool.prototype.start = PeerPool.prototype.stop = function () {};

PeerPool.prototype.addCandidate = function (ipp, id) {
	var self = this;
	if (self._activePeers[ipp]) return;
	if (self._connectingPeers[ipp]) return;
	self._candidates[ipp] = id;
	self._connectingPeers[ipp] = enethost.connect(ipp, 2, 0, function (err, peer) {
		if (err) {
			delete self._connectingPeers[ipp];
		}
	});
};

PeerPool.prototype._handleConnection = function (peer, data, outgoing) {
	var ip = peer.address().address;
	var port = peer.address().port;
	var self = this;
	var ipp = ip + ":" + port;
	var id = self._candidates[ipp];

	if (!id || self._activePeers[ipp]) {
		peer.disconnectLater();
		return;
	}

	self._activePeers[ipp] = peer;
	if (self._candidates[ipp]) delete self._candidates[ipp];
	if (self._connectingPeers[ipp]) delete self._connectingPeers[ipp];
	peer.on("disconnect", function () {
		if (self._activePeers[ipp]) delete self._activePeers[ipp];
	});
	self.emit("peer", peer, id);
};
