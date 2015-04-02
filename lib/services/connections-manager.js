var SessionHandler = require("./session-handler.js");
var async = require("async");
var events = require("events");
var util = require("util");
var telehash = require("get-telehash").telehash;
var debug = require("debug")("conn-mgr");

util.inherits(ConnectionsManager, events.EventEmitter);

module.exports.create = (function () {
	var instance;
	return (function () {
		instance = instance || new ConnectionsManager();
		return instance;
	});
})();

function ConnectionsManager() {
	var self = this;
	var connections = {};
	var connectionCounter = 1;
	var queue;
	var peerPool;

	events.EventEmitter.call(self);

	self.start = function () {
		queue = queue || async.queue(handleAuthenticatedSession, 1);
		peerPool = peerPool || require("./manager.js").require("peer-pool");
		peerPool.on("peer", handleConnection);
	};

	self.stop = function () {
		for (var id in connections) {
			connections[id].discovery.stop();
		}

		peerPool.removeListener("peer", handleConnection);

		if (queue) {
			queue.kill();
			queue = undefined;
		}
	};

	self.connect = function (config) {
		var connid = connectionCounter++;

		var conn = connections[connid] = {
			id: connid,
			keepLooking: true,
			config: config
		};

		if (config.broadcast) {
			conn.discovery = connectBroadcast(config);
		} else if (config.torrent) {
			conn.discovery = connectTorrent(config);
		} else {
			conn.discovery = connectTelehash(config);
		}

		conn.discovery.on("candidate", function (ipp) {
			peerPool.addCandidate(ipp, conn.id);
		});

		conn.discovery.start();

		return conn;
	};

	function connectBroadcast(config) {
		return require("./broadcast-discover").create({
			localid: config.local_fp,
			remoteid: config.remote_fp,
			address: config.broadcast
		});
	}

	function connectTorrent(config) {
		return require("./torrent-discover").create({
			localid: config.local_fp,
			remoteid: config.remote_fp
		});
	}

	function connectTelehash(config) {
		return require("./telehash-discover").create({
			localid: config.local_fp,
			remoteid: config.remote_fp
		});
	}

	function handleConnection(peer, id) {
		var conn = connections[id];

		if (!queue || !conn || !conn.keepLooking) {
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
			queue.push({
				connection: conn,
				session: sessionHandler
			});
		});

		sessionHandler.start();
	}

	function handleAuthenticatedSession(authSession, callback) {
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
	}

}
