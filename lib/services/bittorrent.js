var DHT = require("bittorrent-dht");
var debug = require("debug")("bittorrent");
var events = require("events");
var util = require("util");

util.inherits(Torrent, events.EventEmitter);

var instance;

var torrent = module.exports;

torrent.create = function () {
	if (instance) return instance;
	instance = new Torrent();
	return instance;
};

function Torrent() {
	var self = this;
	events.EventEmitter.call(self);
	var dht = self._dht = new DHT();

	dht.on('ready', function () {
		debug("ready");
		self.emit("ready");
	});

	dht.on('peer', function (addr, hash, from) {
		debug("peer", addr, hash, from);
		self.emit("peer", addr, hash);
	});
}

Torrent.prototype.start = function () {
	var self = this;
	if (self._dht) self._dht.listen(function () {
		debug("listening");
	});
};

Torrent.prototype.stop = function () {
	var self = this;
	if (self._dht) self._dht.destroy();
	delete self._dht;
};

Torrent.prototype.announce = function (infohash, port) {
	var self = this;
	if (self._dht) self._dht.announce(infohash, port, function (err) {
		if (!err) debug("announcing: %s", infohash);
	});
};

Torrent.prototype.lookup = function (infohash) {
	var self = this;
	if (self._dht) self._dht.lookup(infohash);
};
