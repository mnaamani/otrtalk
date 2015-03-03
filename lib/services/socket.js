var socketManager = module.exports;

var events = require("events");
var util = require("util");
var iputil = require("get-telehash").iputil;
var upnp = require("../upnp/nat-upnp");
var debug = require("debug")("socket");
var dgram = require("dgram");

util.inherits(SocketManager, events.EventEmitter);

var instance;

socketManager.create = function () {
	if (instance) return instance;
	instance = new SocketManager();
	return instance;
};

function SocketManager() {
	var self = this;
	events.EventEmitter.call(self);
}

SocketManager.prototype.start = function (settings) {
	var self = this;
	self._settings = settings;
	createSocket(settings, function (err, socket) {
		if (err) {
			console.log(err);
			return;
		}
		self._socket = settings.socket = socket;
		var addr = self._socket.address();
		if (iputil.isPrivateIP(addr.address) && settings.upnp) {
			self._mapPort(addr.port, function (err) {
				if (err) {
					debug("upnp error:", err);
				}
				self.emit("started");
			});
		} else self.emit("started");
	});
};

SocketManager.prototype.stop = function () {
	var self = this;
	if (self._socket) self._socket.close();
	if (self._mapped_port) {
		self._unmapPort(function () {
			self._upnp.close();
		});
	} else {
		if (self._upnp) self._upnp.close();
	}
};

SocketManager.prototype.address = function () {
	var self = this;
	if (self._socket) {
		return self._socket.address();
	}
};

SocketManager.prototype.send = function (buf, begin, len, port, ip, func) {
	var self = this;
	if (self._socket) {
		self._socket.send(buf, begin, len, port, ip, func);
	}
};

SocketManager.prototype._mapPort = function (port, callback) {
	var self = this;
	debug("upnp: mapping port:", port);
	if (!self._upnp) {
		self._upnp = upnp.createClient();
	}
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

SocketManager.prototype._unmapPort = function (callback) {
	var self = this;
	if (!self._mapped_port) {
		callback();
		return;
	}
	debug("upnp: unmapping port:", self._mapped_port);
	self._upnp.portUnmapping({
		public: self._mapped_port,
		protocol: 'udp'
	}, function (err) {
		callback(err);
	});
};

function defaultInterfaceIP(iface) {
	//iface can be an interface name string or ip address string
	//returns first ip address of interface or the ip address if it matches
	//an ipv4 external network interface address
	var ip = iputil.getLocalIP(iface);
	if (ip.length) return ip[0];
}

function createSocket(settings, createdCallback) {
	var port = settings.port;
	var iface = settings.interface;
	var ip;

	iface = iface || "ALL";

	if (iface === "ALL") {
		ip = "0.0.0.0";
	}

	if (iface === "127.0.0.1") {
		ip = iface;
	} else {
		if (!ip) ip = defaultInterfaceIP(iface);
	}

	if (!ip && iface) {
		ip = iface;
	}

	createNodeDgramSocket(port, ip, createdCallback);
}

function createNodeDgramSocket(port, ip, createdCallback) {
	createdCallback = createdCallback || function () {};
	var socket = dgram.createSocket("udp4");

	socket.on("listening", function () {
		debug("address %s:%s", socket.address().address, socket.address().port);
		createdCallback(undefined, socket);
	});

	socket.on("error", function (e) {
		createdCallback(e);
	});

	socket.bind(port, ip);
}
