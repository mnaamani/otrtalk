var node = module.exports;

var events = require("events");
var util = require("util");
var telehash = require("get-telehash").v1.telehash;
var iputil = require("get-telehash").iputil;
var upnp = require("./upnp/nat-upnp");

util.inherits(Node, events.EventEmitter);

node.create = function (settings) {
	settings.mode = settings.mode || 3;
	settings.broadcastMode = settings.broadcastMode || false;
	settings.respondToBroadcasts = settings.broadcastMode || false;
	return new Node(settings);
};

function Node(settings) {
	this._settings = settings;
	events.EventEmitter.call(this);
}

Node.prototype.stop = function (callback) {
	telehash.shutdown();
	if (!this._mapped_port) {
		callback();
		return;
	}
	this._unmapPort(function () {
		callback();
	});
};

Node.prototype.start = function () {
	var settings = this._settings;
	var self = this;

	if (self._th) return;

	if (settings.upnp) {
		self._upnp = upnp.createClient(settings.interface);
	}

	if (settings.interface === 'zt0' && !settings.seeds) {
		settings.seeds = ["28.192.75.206:42424"]; //default zerotier seed on earth network
	}

	self._th = telehash.init({
		log: self._log.bind(self),
		mode: settings.mode,
		seeds: settings.seeds,
		port: settings.port,
		broadcastMode: settings.broadcastMode,
		respondToBroadcasts: settings.respondToBroadcasts,
		interface: settings.interface,
		onSocketBound: self._socketBound.bind(self)
	});
};

Node.prototype._log = function () {
	this.emit("log", Array.prototype.join.apply(arguments, [" "]));
};

Node.prototype._mapPort = function (port, callback) {
	console.log("portmapping", port);
	var self = this;
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
	self._upnp.portUnmapping({
		public: self._mapped_port,
		protocol: 'udp'
	}, function (err) {
		callback(err);
	});
};

Node.prototype._socketBound = function (addr) {
	var self = this;

	//make sure we did not bind to 127.0.0.1
	self._log("listening on\nip:", addr.address);
	self._log("port:", addr.port);

	if (iputil.isPrivateIP(addr.address) && self._settings.upnp) {
		self._log("trying upnp port mapping.");
		self._mapPort(addr.port, function (err) {
			if (err) {
				self.emit("upnp-timeout");
			}
			telehash.seed(function (err) {
				if (err) return;
				self.emit("online", telehash);
			});
		});

	} else {
		telehash.seed(function (err) {
			if (err) {
				return;
			}
			if (self._th.snat && self._settings.mode === 3) {
				self.emit("snat");
			} else {
				self.emit("online", telehash);
			}
		});
	}
};
