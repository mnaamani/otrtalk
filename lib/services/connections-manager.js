var connectionsManager = module.exports;
var SessionHandler = require("./session-handler.js");
var async = require("async");
var events = require("events");
var util = require("util");
var telehash = require("get-telehash").telehash;
var debug = require("debug")("conn-mgr");

util.inherits(ConnectionsManager, events.EventEmitter);

var instance;

var connections = {};
var connectionCounter = 0;
var peerPool;

connectionsManager.create = function () {
	if (instance) return instance;
	instance = new ConnectionsManager();
	return instance;
};

function ConnectionsManager() {
	var self = this;
	events.EventEmitter.call(self);
	self._onPeer = self._handleConnection.bind(self);
}

ConnectionsManager.prototype.start = function () {
	var self = this;
	self.queue = async.queue(self._handleAuthenticatedSession.bind(self), 1);
	if (!peerPool) {
		peerPool = require("./manager.js").require("peer-pool");
	}
	peerPool.on("peer", self._onPeer);
};

ConnectionsManager.prototype.stop = function () {
	var self = this;
	for (var id in connections) {
		connections[id].discovery.stop();
	}

	peerPool.removeListener("peer", self._onPeer);

	if (self.queue) {
		self.queue.kill();
		delete self.queue;
	}
};

ConnectionsManager.prototype.connect = function (config) {
	if (config.broadcast) return this.connectBroadcast(config);
	if (config.torrent) return this.connectTorrent(config);
	return this.connectTelehash(config);
};

ConnectionsManager.prototype.connectBroadcast = function (config) {
	var self = this;
	var connid = ++connectionCounter;

	var conn = connections[connid] = {
		id: connid,
		keepLooking: true,
		config: config,
		discovery: require("./broadcast-discover").create({
			localid: config.local_fp,
			remoteid: config.remote_fp,
			address: config.broadcast
		})
	};

	conn.discovery.on("candidate", function (ipp) {
		peerPool.addCandidate(ipp, conn.id);
	});

	conn.discovery.start();

	return conn;
};

ConnectionsManager.prototype.connectTorrent = function (config) {
	var self = this;
	var connid = ++connectionCounter;

	var conn = connections[connid] = {
		id: connid,
		keepLooking: true,
		config: config,
		discovery: require("./torrent-discover").create({
			localid: config.local_fp,
			remoteid: config.remote_fp,
		})
	};

	conn.discovery.on("candidate", function (ipp) {
		peerPool.addCandidate(ipp, conn.id);
	});

	conn.discovery.start();

	return conn;
};

ConnectionsManager.prototype.connectTelehash = function (config) {
	var connid = ++connectionCounter;
	var self = this;

	var conn = connections[connid] = {
		id: connid,
		keepLooking: true,
		config: config,
		discovery: require("./telehash-discover").create({
			localid: config.local_fp,
			remoteid: config.remote_fp,
		})
	};

	conn.discovery.on("candidate", function (ipp) {
		peerPool.addCandidate(ipp, conn.id);
	});

	conn.discovery.start();

	return conn;
};

ConnectionsManager.prototype._handleConnection = function (peer, id) {
	var self = this;
	var conn = connections[id];

	if (!self.queue || !conn || !conn.keepLooking) {
		peer.disconnectLater();
		return;
	}

	var sessionHandler = new SessionHandler(peer, conn.config);

	if (!sessionHandler) {
		conn.keepLooking = false;
		conn.discovery.stop();
		self.emit("error", conn.id);
		return;
	}

	sessionHandler.on("auth", function () {
		debug("got an authenticated connection");
		if (!conn.keepLooking) {
			sessionHandler.end();
			return;
		}
		self.queue.push({
			connection: conn,
			session: sessionHandler
		});
	});

	sessionHandler.start();
};

ConnectionsManager.prototype._handleAuthenticatedSession = function (authSession, callback) {
	var self = this;
	var done = callback;
	var connection = authSession.connection;
	var session = authSession.session;

	debug("handling authenticated session");

	if (!connection.keepLooking || session.ending) {
		session.end();
		done();
		return;
	}

	session.on("closed", function () {
		if (done) done();
		done = undefined;
	});

	session.on("start_chat", function () {
		connection.keepLooking = false;
		connection.discovery.stop();
		if (done) done();
		done = undefined;
		//bring-up chat console
		self.emit("chat", connection.id, session);
	});

	session.go_chat();
};
