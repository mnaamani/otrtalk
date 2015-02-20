var events = require("events");
var util = require("util");
var telehash = require("get-telehash").telehash;
var debug = require("debug")("main");

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
	debug("stopping services");
	serviceManager.stopAll();
	process.stdin.pause();
	debug("exiting");
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
		main.startNetworkServices(function () {
			main.startChat(config);
		});
		return;
	}
};

Main.prototype.startChat = function (cfg) {
	var chat = require("./chat-controller");
	debug("started chat controller");
	chat.start(cfg);
	chat.on("closed", function () {
		main.exit();
	});
};

Main.prototype.startNetworkServices = function (callback) {
	var thnode = serviceManager.require("telehash");
	var enetnode = serviceManager.require("enet");
	serviceManager.require("peer-pool").start();
	serviceManager.require("connections-manager").start(main._networkSettings);

	thnode.on("started", function () {
		debug("telehash node started.");
		enetnode.start({
			socket: telehash.socket(),
			peers: 128,
			channels: 2
		});
	});

	thnode.on("snat", function () {
		console.log("SNAT detected.");
		enetnode.stop();
		thnode.stop();
	});

	thnode.on("error", function (err) {
		console.log(err);
		enetnode.stop();
		thnode.stop();
	});

	enetnode.on("started", function () {
		debug("enet node started.");
	});

	thnode.once("online", function () {
		if (typeof callback === 'function') callback();
	});

	thnode.start(main._networkSettings);
};

Main.prototype.runTelehashNode = function () {
	var node = serviceManager.require("telehash");

	node.on("snat", function () {
		console.log("SNAT detected.");
		node.stop();
	});

	node.on("error", function (err) {
		console.log(err);
		node.stop();
	});

	node.on("started", function () {
		console.log("started");
		console.log("socket address:", telehash.socketAddress());
	});

	node.on("online", function () {
		console.log("online.\npublic address:", telehash.address().ipp);
	});

	node.on("stopped", function () {
		console.log("stopping.");
		clearInterval(peerUpdateInterval);
	});

	main._networkSettings.telehashMode = telehash.MODE.FULL;

	node.start(main._networkSettings);

	var peerUpdateInterval = setInterval(function () {
		console.log("peers:", telehash.peers().length);
		//others stats... ?
	}, 10000);
};


if (process.platform !== 'win32') process.on('SIGINT', function () {
	main.exit();
});

process.stdin.on('end', function () {
	main.exit();
});
