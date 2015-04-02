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
	var conn = connMgr.connect(settings);

	console.log("contacting %s ...", settings.buddy_name);

	connMgr.on("chat", function (id, session) {
		if (id !== conn.id) return;
		var chatui = require("./chat-ui.js");
		chatui.attach(session, function () {
			self.emit("closed");
		});
	});

	connMgr.on("error", function (id) {
		if (id !== conn.id) return;
		console.log("failed to create a session handler");
		self.emit("closed");
	});
};
