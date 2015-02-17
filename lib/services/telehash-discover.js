var telehash = require("get-telehash").telehash;
var iputil = require("get-telehash").iputil;
var events = require("events");
var util = require("util");

var MsgType = {
	/* requests */
	CONNECT: 100,
	/* responses */
	ACK: 201,
};

var CONNECT_RETRY_DELAY = 5000;

module.exports.create = function (param) {
	return new Discover(param);
};

util.inherits(Discover, events.EventEmitter);

function Discover(param) {
	var self = this;
	events.EventEmitter.call(self);

	var arr = [param.localid, "/otr-talk/", param.remoteid];
	this.localEndName = arr.join("");
	this.remoteEndName = arr.reverse().join("");
	this._listener = telehash.listen(self.localEndName, function (request) {
		self._handleConnect(request);
	});
}

Discover.prototype.start = function () {
	var self = this;
	if (self._connector) return;
	self._connector = telehash.connect(self.remoteEndName);
	self._listener.off = false;

	function connect() {
		if (!self._connector) return;
		if (!telehash.address()) {
			setTimeout(connect, CONNECT_RETRY_DELAY);
			return;
		}
		self._connector.send({
			type: MsgType.CONNECT,
			ipp: telehash.address().ipp
		});

		setTimeout(connect, CONNECT_RETRY_DELAY);
	}

	connect();
};

Discover.prototype.stop = function () {
	var self = this;
	if (self._connector) {
		self._connector.stop();
		self._listener.off = true;
		delete self._connector;
	}
};

Discover.prototype._handleConnect = function (request) {
	if (parseInt(request.message.type) !== MsgType.CONNECT) return;
	var self = this;
	if (!telehash.address()) return;
	request.reply({
		type: MsgType.ACK,
		ipp: telehash.address().ipp
	});
	self.emit("candidate", request.message.ipp);
};
