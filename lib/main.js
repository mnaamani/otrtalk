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
		"upnp": options.upnp,
		"broadcast": options.broadcast ? (options.broadcast === true ? "255.255.255.255" : options.broadcast) : undefined,
		"torrent": options.torrent
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
		main._networkSettings.telehashMode = telehash.MODE.FULL;
		main.startNetworkServices({
			"telehash": true
		}, function () {
			main._monitorTelehashNode();
		});
		return;

	case "chat":
		if (main._networkSettings.broadcast) {
			delete main._networkSettings.upnp;
		}
		if (main._networkSettings.torrent) {
			main._networkSettings.telehashMode = telehash.MODE.ANNOUNCER;
		}
		main.startNetworkServices({
			"telehash": main._networkSettings.broadcast ? false : true,
			"beacon": main._networkSettings.broadcast ? true : false,
			"bittorrent": main._networkSettings.torrent ? true : false,
			"enet": true,
			"connections-manager": true,
			"peer-pool": true
		}, function () {
			config.broadcast = main._networkSettings.broadcast;
			config.torrent = main._networkSettings.torrent;
			main.startChat(config);
		});
		return;
	}
};

Main.prototype.startChat = function (cfg) {
	var chat = require("./chat-controller");
	debug("started chat controller");
	chat.on("closed", function () {
		main.exit();
	});
	chat.start(cfg);
};

Main.prototype.startNetworkServices = function (services, callback) {
	//create a socket, native or proxied over websockets relay server
	//handle upnp port mapping..
	var socket = serviceManager.require("socket");

	socket.on("started", function () {
		if (services["beacon"]) serviceManager.require("beacon").start();
		if (services["telehash"]) main._startTelehashNode();
		if (services["enet"]) main._startENetNode();
		if (services["bittorrent"]) main._startBitTorrentNode();
		if (services["connections-manager"]) serviceManager.require("connections-manager").start();
		if (services["peer-pool"]) serviceManager.require("peer-pool").start();
		callback();
	});

	socket.start(main._networkSettings);
};

Main.prototype._startBitTorrentNode = function () {
	serviceManager.require("bittorrent").start(main._networkSettings.socket);
};

Main.prototype._startENetNode = function () {
	serviceManager.require("enet").start({
		socket: main._networkSettings.socket,
		peers: 128,
		channels: 2
	});
};

Main.prototype._startTelehashNode = function () {
	var thnode = serviceManager.require("telehash");

	thnode.on("snat", function () {
		console.log("SNAT detected.");
		main.exit();
	});

	thnode.on("error", function (err) {
		console.log(err);
		main.exit();
	});

	thnode.start(main._networkSettings);
};

Main.prototype._monitorTelehashNode = function () {
	var node = serviceManager.require("telehash");

	node.on("online", function () {
		console.log("online.\npublic address:", telehash.address().ipp);
	});

	node.on("stopped", function () {
		console.log("stopping.");
		clearInterval(peerUpdateInterval);
	});

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
