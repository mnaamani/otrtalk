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
	//otr module to use for new profiles
	.option("--otr <module>", "otr4-em, otr4 (for new profiles) default:otr4-em", "otr4-em")
	//discover/connect mode options
	.option("--fingerprint <fingerprint>", "buddy key fingerprint", "")
	.option("--pidgin", "check pidgin buddylist for known fingerprints", "")
	.option("--adium", "check adium buddylist for known fingerprints", "")
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
	.command('profiles [action]')
	.description('manage profiles. actions: list, info, add, remove')
	.action(function (action) {
		var _cmd = require("./cmd-profiles.js");
		cmd = new _cmd(UI, action);
	});

program
	.command('buddies [action]')
	.description('manage buddies. actions: list, remove')
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
	.description('host a standalone telehash seed node')
	.action(function () {
		var _cmd = require("./cmd-host.js");
		cmd = new _cmd(UI);
	});

program
	.command('im-buddies')
	.description('list pidgin and adium trusted buddies')
	.action(function () {
		var _cmd = require("./cmd-im-buddies.js");
		cmd = new _cmd(UI);
	});

program
	.command('import-key <app> <profile> [otrtalk-id]')
	.description('\n\timport a key from app "pidgin" or "adium" into a new profile')
	.action(function (app, profile, id) {
		var _cmd = require("./cmd-import-key.js");
		cmd = new _cmd(UI, app, profile, id);
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
