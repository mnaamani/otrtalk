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

	self.connection = connMgr.connect(settings);

	if (!self.connection) {
		console.log("failed to setup connection.");
		self.emit("closed");
		return;
	}

	console.log("contacting %s ...", settings.buddy_name);

	connMgr.on("chat", function (id, session) {
		if (id !== self.connection.id) return;
		var chatui = require("./chat-ui.js");
		chatui.attach(session, function () {
			self.emit("closed");
		});
	});

	connMgr.on("error", function (id) {
		if (id !== self.connection.id) return;
		console.log("failed to create a session handler");
		self.emit("closed");
	});

};
