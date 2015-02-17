var node = module.exports;

var events = require("events");
var util = require("util");
var iputil = require("get-telehash").iputil;
var enet = require("enet");

util.inherits(Node, events.EventEmitter);

var instance; //only one enet host per application

node.create = function () {
	if (instance) return instance;
	instance = new Node();
	return instance;
};

function Node() {
	var self = this;
	events.EventEmitter.call(self);
}

Node.prototype.start = function (settings) {
	var self = this;

	enet.createServerFromSocket(settings, function (err, host) {
		if (err) {
			self.emit("error", err);
			return;
		} else {
			self._host = host;
			self.emit("started");
			host.on("connect", function (peer, data, outgoing) {
				self.emit("connect", peer, data, outgoing);
			});
		}
	});
};

Node.prototype.connect = function (addr, channels, data, callback) {
	if (this._host) {
		this._host.connect(addr, channels, data, callback);
	} else {
		callback("no-host");
	}
};

Node.prototype.stop = function () {
	if (this._host) this._host.stop();
	this.emit("stopped");
};
