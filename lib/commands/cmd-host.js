var program = require('./commander.js');

module.exports = Command;

function Command() {}

Command.prototype.exec = function (cmdCallback, mainCtrl) {

	var settings = {
		"seeds": program.seed ? [program.seed] : undefined,
		"interface": program.interface,
		"port": program.port ? parseInt(program.port) : 42424,
		"upnp": program.upnp
	};

	var node = mainCtrl.requestService("telehash", settings);

	if (!node) {
		cmdCallback("host command: failed request for service telehash.");
		return;
	}

	if (process.platform !== 'win32') process.on('SIGINT', function () {
		mainCtrl.exit();
	});

	process.stdin.on('end', function () {
		mainCtrl.exit();
	});

	node.on("log", console.log);

	node.on("snat", function () {
		console.log("SNAT detected. Stopping.");
		mainCtrl.exit();
	});

	node.start();

};
