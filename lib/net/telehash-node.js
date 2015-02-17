var node = module.exports;

var events = require("events");
var util = require("util");
var telehash = require("get-telehash").telehash;
var iputil = require("get-telehash").iputil;
var upnp = require("./upnp/nat-upnp");

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
	var settings = self._settings;
	this._restartAfterShutdown = false;
	self._log("telehash: starting...");

	if (settings.interface === 'zt0' && !settings.seeds) {
		settings.seeds = ["28.192.75.206:42424"]; //default zerotier seed on earth network
	}

	telehash.init({
		//log: self._log.bind(self),
		//packetLog: console.log,
		mode: settings.telehashMode,
		seeds: settings.seeds,
		port: settings.port,
		broadcastMode: settings.broadcastMode,
		respondToBroadcasts: settings.respondToBroadcasts,
		interface: settings.interface,
	}, function (err) {
		if (err) {
			self.emit("error", err);
		} else {
			var addr = telehash.socketAddress();
			self._log("telehash: socket address", addr.address, "port:", addr.port);
			self.emit("started");
			self.connect();
		}
	});
};

Node.prototype.restart = function (newSettings) {
	this._restartAfterShutdown = true;
	if (newSettings) this._settings = newSettings;
	this.stop();
};

Node.prototype.connect = function () {
	var addr = telehash.socketAddress();
	var self = this;
	var settings = self._settings;

	if (!self._upnp && settings.upnp && typeof settings.socket === 'undefined') {
		self._upnp = upnp.createClient(settings.interface);
	}

	if (iputil.isPrivateIP(addr.address) && self._upnp) {
		self._mapPort(addr.port, function (err) {
			if (err) {
				self._log("upnp error:", err);
			}
			telehash.seed(self._onStatusChange.bind(self));
		});
	} else {
		telehash.seed(self._onStatusChange.bind(self));
	}
};

Node.prototype._onStatusChange = function (status, info) {
	var self = this;

	switch (status) {
	case "not-initialised":
		self._log("telehash: need to call telehash.init() first");
		self.emit("error", "not-initialised");
		break;

	case "online":
		self._log("telehash: Online. public address:", info);
		self.emit("online", info);
		break;

	case "offline":
		self._log("telehash: gone offline, reason:", info);
		if (info === 'snat-detected') self.emit("snat");
		break;

	case "connecting":
		self._log("telehash: seeding into DHT...");
		break;

	case "shutdown":
		self._log("telehash: shutdown.");
		if (self._mapped_port) {
			self._unmapPort(function () {
				self._upnp.close();
				if (self._restartAfterShutdown) process.nextTick(function () {
					self.start();
				});
			});
		} else {
			if (self._restartAfterShutdown) process.nextTick(function () {
				self.start();
			});
		}
		break;
	}
};

Node.prototype.stop = function () {
	telehash.shutdown();
	this.emit("stopped");
};

Node.prototype._log = function () {
	this.emit("log", Array.prototype.join.apply(arguments, [" "]));
};

Node.prototype._mapPort = function (port, callback) {
	var self = this;
	self._log("upnp: mapping port:", port);
	self._upnp.portMapping({
		public: port,
		private: port,
		ttl: 0,
		protocol: 'udp'
	}, function (err) {
		if (!err) {
			self._mapped_port = port;
		}
		callback(err);
	});
};

Node.prototype._unmapPort = function (callback) {
	var self = this;
	if (!self._mapped_port) {
		callback();
		return;
	}
	self._log("upnp: unmapping port:", self._mapped_port);
	self._upnp.portUnmapping({
		public: self._mapped_port,
		protocol: 'udp'
	}, function (err) {
		callback(err);
	});
};
