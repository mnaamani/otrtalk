var beacon = module.exports;

var events = require("events");
var util = require("util");
var iputil = require("get-telehash").iputil;

var debug = require("debug")("beacon");
var dgram = require("dgram");

util.inherits(Beacon, events.EventEmitter);

var instance;

beacon.create = function () {
	if (instance) return instance;
	instance = new Beacon();
	return instance;
};

function Beacon() {
	var self = this;
	events.EventEmitter.call(self);
}

Beacon.prototype.start = function (settings) {
	var self = this;
	self._settings = settings;
	self._socket = dgram.createSocket("udp4");

	self._socket.on("listening", function () {
		self._socket.setBroadcast(true);
	});

	self._socket.on("message", function (msg, from) {
		if (iputil.isLocalIP(from.address)) return; //ignore beacons from self
		var announcement = msg.toString();
		try {
			announcement = JSON.parse(announcement);
		} catch (e) {
			return;
		}
		announcement.ip = from.address;
		self.emit("announcement", announcement);
	});

	self._socket.bind(7777, "0.0.0.0");
};

Beacon.prototype.announce = function (buf, address) {
	//todo - limit announcements to max 1 every 10 secs
	this._send(buf, 0, buf.length, 7777, address);
};

Beacon.prototype.stop = function () {
	var self = this;
	if (self._socket) self._socket.close();
	delete self._socket;
};

Beacon.prototype._send = function (buf, begin, len, port, ip, func) {
	var self = this;
	if (self._socket) {
		self._socket.send(buf, begin, len, port, ip, func);
	}
};
