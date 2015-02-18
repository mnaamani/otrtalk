var events = require("events");
var util = require("util");
var telehash = require("get-telehash").telehash;

var serviceManager = require("./services/manager.js");
var commands = require("./commands");

util.inherits(Main, events.EventEmitter);

var main = module.exports = new Main();

function Main() {
	events.EventEmitter.call(this);
}

Main.prototype.exit = function () {
	if (this._shuttingDown) return;
	this._shuttingDown = true;
	serviceManager.stopAll();
};

Main.prototype.parseNetworkSettings = function (options) {
	main._networkSettings = {
		"seeds": options.seed ? [options.seed] : undefined,
		"interface": options.interface,
		"port": options.port ? parseInt(options.port) : undefined,
		"upnp": options.upnp
	};
};

Main.prototype.run = function () {
	commands.process(function (err, cmd, options) {
		if (err) {
			console.log(err);
			return;
		}

		main.parseNetworkSettings(options);

		if (cmd) {
			cmd.exec(function (err, action, config) {
				if (err) {
					console.log(err);
					main.exit();
					return;
				}
				if (action) {
					main.takeAction(action, config);
				} else main.exit();
			});

		} else {
			console.log("You did not issue a command.");
			commands.help();
		}
	});
};

Main.prototype.takeAction = function (action, config) {
	switch (action) {
	case "run-telehash-node":
		main.runTelehashNode();
		return;
	case "chat":
		main.startNetworkServices();
		main.startChat(config);
		return;
	}
};

Main.prototype.startChat = function (cfg) {
	var chat = serviceManager.require("chat-manager");
	chat.start(cfg);
	chat.on("closed", function () {
		main.exit();
	});
};

Main.prototype.startNetworkServices = function () {
	var thnode = serviceManager.require("telehash");
	var enetnode = serviceManager.require("enet");
	serviceManager.require("peer-pool");
	serviceManager.require("connections-manager").start(main._networkSettings);

	thnode.on("started", function () {
		console.log("telehash node started.");
		enetnode.start({
			socket: telehash.socket(),
			peers: 128,
			channels: 2
		});
	});

	thnode.on("snat", function () {
		console.log("SNAT detected. Stopping.");
		enetnode.stop();
		thnode.stop();
	});

	thnode.on("error", function (err) {
		console.log(err);
		enetnode.stop();
		thnode.stop();
	});

	thnode.on("log", console.log);

	enetnode.on("started", function () {
		console.log("enet node started");
	});

	thnode.start(main._networkSettings);
};

Main.prototype.runTelehashNode = function () {
	var node = serviceManager.require("telehash");

	node.on("log", console.log);

	node.on("snat", function () {
		console.log("SNAT detected. Stopping.");
		node.stop();
	});

	node.on("error", function (err) {
		console.log(err);
		node.stop();
	});

	main._networkSettings.telehashMode = telehash.MODE.FULL;

	node.start(main._networkSettings);
};


if (process.platform !== 'win32') process.on('SIGINT', function () {
	main.exit();
});

process.stdin.on('end', function () {
	main.exit();
});
