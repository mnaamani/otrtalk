var connectionsManager = module.exports;
var SessionHandler = require("./session-handler.js");

var events = require("events");
var util = require("util");
var telehash = require("get-telehash").telehash;

util.inherits(ConnectionsManager, events.EventEmitter);

var instance;

var connections = {};
var connectionCounter = 0;
var pool;

connectionsManager.create = function () {
	if (instance) return instance;
	instance = new ConnectionsManager();
	return instance;
};

function ConnectionsManager() {
	var self = this;
	events.EventEmitter.call(self);
	pool = require("./manager.js").require("peer-pool");
	pool.on("peer", function (peer, id) {
		self.handleConnection(peer, id);
	});
}

ConnectionsManager.prototype.start = function (settings) {
	this._settings = settings;
};

ConnectionsManager.prototype.stop = function () {
	for (var id in connections) {
		connections[id].discovery.stop();
		connections[id].queue.forEach(function (session) {
			session.end();
		});
	}
};

ConnectionsManager.prototype.connectTelehash = function (config) {
	//config comes from the chat command
	//should contain a 'mode', 'profile', 'buddy' and 'secret'
	var connid = ++connectionCounter;
	var self = this;

	var conn = connections[connid] = {
		id: connid,
		keepLooking: true,
		queue: [],
		config: config,
		discovery: require("./telehash-discover").create({
			localid: config.profile.id(),
			remoteid: config.buddy.id()
		})
	};

	conn.discovery.on("candidate", function (ipp) {
		pool.addCandidate(ipp, conn.id);
	});

	conn.discovery.start();

	return conn;
};

ConnectionsManager.prototype.handleConnection = function (peer, id) {
	var self = this;
	var conn = connections[id];

	if (!conn.keepLooking) {
		peer.disconnectLater();
		return;
	}

	var sessionHandler = new SessionHandler(peer, conn.config);

	sessionHandler.on("auth", function () {
		if (!conn.keepLooking) {
			sessionHandler.end();
			return;
		}
		conn.queue.push(sessionHandler);
		self.emit("auth-connection", conn.id);
	});

	sessionHandler.start();
};
