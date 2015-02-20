var program = require("./commands/commander");
var events = require("events");
var util = require("util");

util.inherits(ChatManager, events.EventEmitter);

module.exports = new ChatManager();

function ChatManager() {
	var self = this;
	events.EventEmitter.call(self);
}

ChatManager.prototype.start = function (settings) {
	var self = this;

	var connMgr = require("./services/manager.js").require("connections-manager");

	self.connection = connMgr.connectTelehash(settings);

	connMgr.on("verify", function (id, session, callback) {
		if (id !== self.connection.id) return;
		self._verifyFingerprint(session, callback);
	});

	connMgr.on("chat", function (id, session) {
		if (id !== self.connection.id) return;
		var chatui = require("./chat-ui.js");
		chatui.attach(session, function () {
			self.emit("closed");
		});
	});

	connMgr.on("error", function (id) {
		if (id !== self.connection.id) return;
		self.emit("closed");
	});

};

ChatManager.prototype._verifyFingerprint = function (session, callback) {
	var done = callback;

	session.on("closed", function () {
		console.log("\nRemote party disconnected or timed-out.");
		if (done) {
			console.log("Aborting verification.");
			process.stdin.removeListener("data", onData);
			done = undefined;
			callback(false);
		}
	});

	console.log("Authenticated Connection Established.");
	console.log("Remote public key fingerprint:\n");
	console.log("\t" + session.fingerprint());

	prompt();

	function prompt() {
		process.stdout.write("Do you want to accept this connection [y/n]?");
		process.stdin.setEncoding('utf8');
		process.stdin.once('data', onData).resume();
	}

	function parseBool(str) {
		return /^y|yes|ok|true$/i.test(str);
	}

	function onData(val) {
		if (done) {
			if (!val.trim()) {
				prompt();
				return;
			}
			var ok = parseBool(val);
			if (ok) {
				if (!session.ending) {
					console.log("Waiting for remote party...");
				}
			} else {
				console.log("Rejecting connection.");
			}
			done = undefined;
			callback(ok);
		}

	}
};
