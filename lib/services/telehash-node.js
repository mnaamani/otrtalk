var node = module.exports;

var events = require("events");
var util = require("util");
var telehash = require("get-telehash").telehash;
var debug = require("debug")("telehash");

util.inherits(Node, events.EventEmitter);

var instance; //only one telehash node can be created per application

node.create = function () {
	if (instance) return instance;
	instance = new Node();
	return instance;
};

function Node() {
	var self = this;
	events.EventEmitter.call(self);
}

Node.prototype.start = function (newSettings) {
	var self = this;
	if (newSettings) self._settings = newSettings;
	var settings = self._settings || {};
	this._restartAfterShutdown = false;
	debug("starting");

	if (settings.interface === 'zt0' && !settings.seeds) {
		settings.seeds = ["28.192.75.206:42424"]; //default zerotier seed on earth network
	}

	telehash.init({
		mode: settings.telehashMode,
		seeds: settings.seeds,
		port: settings.port,
		broadcastMode: settings.broadcastMode,
		respondToBroadcasts: settings.respondToBroadcasts,
		interface: settings.interface,
		socket: settings.socket
	}, function (err) {
		if (err) {
			self.emit("error", err);
		} else {
			var addr = telehash.socketAddress();
			debug("socket address", addr.address, "port:", addr.port);
			self.emit("started");
			self._connect();
		}
	});
};

Node.prototype.restart = function (newSettings) {
	this._restartAfterShutdown = true;
	if (newSettings) this._settings = newSettings;
	this.stop();
};

Node.prototype._connect = function () {
	var self = this;
	telehash.seed(self._onStatusChange.bind(self));
};

Node.prototype._onStatusChange = function (status, info) {
	var self = this;

	switch (status) {
	case "not-initialised":
		debug("need to call telehash.init() first");
		self.emit("error", "not-initialised");
		break;

	case "online":
		debug("online. public address:", info);
		self.emit("online", info);
		break;

	case "offline":
		debug("gone offline, reason:", info);
		if (info === 'snat-detected') self.emit("snat");
		break;

	case "connecting":
		debug("seeding");
		break;

	case "shutdown":
		debug("shutdown.");
		self.emit("stopped");
		if (self._restartAfterShutdown) process.nextTick(function () {
			self.start();
		});
		break;
	}
};

Node.prototype.stop = function () {
	telehash.shutdown();
};
