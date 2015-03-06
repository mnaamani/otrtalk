var events = require("events");
var util = require("util");
var debug = require("debug")("torrent-discover");
var hash = require("get-telehash").hash;
var telehash = require("get-telehash").telehash;
var debug = require("debug")("torrent-discover");

module.exports.create = function (param) {
	return new Discover(param);
};

util.inherits(Discover, events.EventEmitter);

function Discover(param) {
	var self = this;
	events.EventEmitter.call(self);
	self._settings = {
		remoteid_hash: new hash.Hash(param.remoteid).toString(),
		localid_hash: new hash.Hash(param.localid).toString()
	};
}

Discover.prototype.start = function () {
	var self = this;
	var torrent = require("./manager.js").require("bittorrent");

	self._discoverInterval = setInterval(function () {
		self._announce();
	}, 10000);

	self._announce();

	torrent.on("peer", function (addr, infohash) {
		//check it is who we are looking for
		debug("peer", addr, infohash);
		if (self._settings.remoteid_hash !== infohash) return;
		debug("infohash match");
		self.emit("candidate", addr);
	});
};

Discover.prototype.stop = function () {
	var self = this;
	if (self._discoverInterval) {
		clearInterval(self._discoverInterval);
		delete self._discoverInterval;
	}
};

Discover.prototype._announce = function () {
	var self = this;
	var addr = telehash.address();
	if (!addr) return;

	var torrent = require("./manager.js").require("bittorrent");

	//announce localid infohash and port of enethost
	torrent.announce(self._settings.localid_hash, addr.port);

	//lookup remote id infohash
	torrent.lookup(self._settings.remoteid_hash);
};
