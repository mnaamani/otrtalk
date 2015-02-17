var async = require("async");
var program = require("../commands/commander");
var events = require("events");
var util = require("util");

var instance;
util.inherits(ChatManager, events.EventEmitter);

module.exports.create = function () {
	if (instance) return instance;
	instance = new ChatManager();
	return instance;
};

function ChatManager() {
	var self = this;
	events.EventEmitter.call(self);
}

ChatManager.prototype.start = function (settings) {
	var self = this;
	var connMgr = require("../service-manager").require("connections-manager");

	self.auth_queue = async.queue(self._handleSession.bind(self), 1);
	self.buddyID = settings.buddy.id();
	self.connection = connMgr.connectTelehash(settings);

	connMgr.on("auth-connection", function (id) {
		if (id !== self.connection.id) return;
		var session = self.connection.queue.shift();
		if (session && !session.ending) {
			self.auth_queue.push(session);
		}
	});
};

ChatManager.prototype.stop = function () {
	if (this.activeSession) this.activeSession.end();
};

ChatManager.prototype._openChatUI = function (session) {
	var self = this;
	var chatui = require("../chat-ui.js");
	self.activeSession = session;
	chatui.attach(session, function () {
		self.emit("closed");
	});
};

ChatManager.prototype._handleSession = function (session, callback) {
	var self = this;
	var done = callback;

	if (!self.connection.keepLooking) {
		session.end();
		return;
	}

	session.on("closed", function () {
		if (done) done();
		done = undefined;
	});

	session.on("start_chat", function () {
		self.connection.keepLooking = false;
		self.connection.discovery.stop();
		if (done) done();
		done = undefined;

		//bring-up chat console
		self._openChatUI(session);
	});

	switch (session.mode()) {
	case 'chat':
		if (session.isTrusted() && !session.isNewFingerprint()) {
			session.go_chat();
		} else {
			session.end();
		}

		break;
	case 'connect':
		if (session.isNewFingerprint()) {
			console.log("You have connected to someone who claims to be", self.buddyID);
			console.log("They know the authentication secret.");
			console.log("Their public key fingerprint:\n");
			console.log("\t" + session.fingerprint());
			program.confirm("\nDo you want to trust this fingerprint [y/n]? ", function (ok) {
				if (!ok) {
					console.log("rejecting fingerprint.");
					session.end();
				} else {
					if (session.ending) {
						//remote rejected, and closed the session
						console.log("session closed, fingerprint not saved.");
						return;
					}
					console.log("accepted fingerprint.");
					session.go_chat();
				}
			});
		} else if (session.Trusted()) {
			//we used connect mode and found an already trusted fingerprint...
			session.go_chat();
		}
		break;
	}
};
