var version = require("../version.js");
var program = require("./commander");
var UI = require("./ui.js");

var commands = module.exports;

var cmd; //the issued command

program
	.links("Report bugs: <https://github.com/mnaamani/node-otr-talk/issues>")
	.version("otrtak " + version.current() + "\nCopyright (C) 2012-2015 Mokhtar Naamani <mokhtar.naamani@gmail.com>\n" +
		"This program is free software; you can redistribute it and/or modify it\n" +
		"under the terms of version 2 of the GNU General Public License as published by\n" +
		"the Free Software Foundation.\n" +
		"The Off-the-Record Messaging library is\n" +
		" Copyright (C) 2004-2012  Ian Goldberg, Rob Smits, Chris Alexander,\n" +
		"         Willy Lew, Lisa Du, Nikita Borisov\n" +
		"    <otr@cypherpunks.ca> https://otr.cypherpunks.ca/\n" +
		"\n" +
		"The ENet Networking Library is Copyright (c) 2002-2013 Lee Salzman\n\n" +
		"Report bugs: <https://github.com/mnaamani/node-otr-talk/issues>")
	.option("--encrypted", "encrypt new profile with a password")
	//discover/connect mode options
	.option("--fingerprint <fingerprint>", "buddy key fingerprint", "")
	//network options
	.option("--interface <interface>", "network interface to use for communication")
	.option("--port <port>", "bind to specific UDP port")
	.option("--seed <ip:port>", "use custom telehash seed")
	.option("--upnp", "try to use upnp port mapping")
	//alternative discovery protocols
	.option("--broadcast [addr]", "use broadcast LAN discovery instead of telehash")
	.option("--torrent", "use bittorrent DHT for discovery instead of telehash")
	//direct ip:port
	//telehash-v3
	//blockchain based protocol .. suggestions?
	//DP5

program
	.command('chat [buddy-alias]')
	.description('chat with buddy')
	.action(function (alias) {
		var _cmd = require("./cmd-chat.js");
		cmd = new _cmd(UI, alias);
	});

program
	.command('chat-im [app]')
	.description('chat using pidgin or adium identity')
	.action(function (app) {
		var _cmd = require("./cmd-chat-im.js");
		cmd = new _cmd(UI, app);
	});

program
	.command('profiles [action]')
	.description('actions: list, info, add, remove, set-password, remove-password')
	.action(function (action) {
		var _cmd = require("./cmd-profiles.js");
		cmd = new _cmd(UI, action);
	});

program
	.command('buddies [action]')
	.description('actions: list, remove')
	.action(function (action) {
		var _cmd = require("./cmd-buddies.js");
		cmd = new _cmd(UI, action);
	});

program
	.command('update')
	.description('check for newer version of otrtalk')
	.action(function () {
		var _cmd = require("./cmd-update.js");
		cmd = new _cmd(UI);
	});

program
	.command('host')
	.description('run a telehash node')
	.action(function () {
		var _cmd = require("./cmd-host.js");
		cmd = new _cmd(UI);
	});

commands.process = function (callback) {
	try {
		program.parse(process.argv);
		callback(undefined, cmd, program);
	} catch (e) {
		callback(e);
		return;
	}
};

commands.help = function () {
	program.help();
};
