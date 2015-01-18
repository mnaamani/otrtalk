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
	.option("-v, --verbose", "show debug info")
	.option("-f, --fingerprint <FINGERPRINT>", "buddy key fingerprint (connect mode)", "")
	.option("-s, --secret <SECRET>", "SMP authentication secret (connect mode)", "")
	.option("-o, --otr <module>", "otr4-em, otr4 (for new profiles) default:otr4-em", "otr4-em")
	.option("-i, --interface <interface>", "optional network interface to use for communication")
	.option("--pidgin", "check pidgin buddylist for known fingerprints (connect mode)", "")
	.option("--adium", "check adium buddylist for known fingerprints (connect mode)", "")
	.option("--port <port>", "listen on custom port")
	.option("--broadcast", "broadcast LAN discovery")
	.option("--seed <ip:port>", "use custom seed")
	.option("--upnp", "try to use upnp port mapping")
	.option("--lan", "share our local ip when searching for buddy");

program
	.command('connect [buddy]')
	.description('establish new trust with buddy')
	.action(function (alias) {
		var _cmd = require("./cmd-chat.js");
		cmd = new _cmd(UI, alias, 'connect');
	});

program
	.command('chat [buddy]')
	.description('chat with trusted buddy')
	.action(function (alias) {
		var _cmd = require("./cmd-chat.js");
		cmd = new _cmd(UI, alias, 'chat');
	});

program
	.command('profiles [list|info|add|remove]')
	.description('manage profiles')
	.action(function (action) {
		var _cmd = require("./cmd-profiles.js");
		cmd = new _cmd(UI, action);
	});

program
	.command('buddies [list|remove]')
	.description('manage buddies')
	.action(function (action) {
		var _cmd = require("./cmd-buddies.js");
		cmd = new _cmd(UI, action);
	});

program
	.command('import-key [pidgin|adium] [profile] [otrtalk-id]')
	.description('import a key from pidgin/adium into a new profile')
	.action(function (app, profile, id) {
		var _cmd = require("./cmd-import-key.js");
		cmd = new _cmd(UI, app, profile, id);
	});

program
	.command('im-buddies')
	.description('list pidgin and/or adium trusted buddies')
	.action(function () {
		var _cmd = require("./cmd-im-buddies.js");
		cmd = new _cmd(UI);
	});

program
	.command('update')
	.description('check for newer versino of otrtalk')
	.action(function () {
		var _cmd = require("./cmd-update.js");
		cmd = new _cmd(UI);
	});

program
	.command('host')
	.description('host a telehash seed node')
	.action(function () {
		var _cmd = require("./cmd-host.js");
		cmd = new _cmd(UI);
	});

commands.process = function (callback) {
	try {
		program.parse(process.argv);
		callback(undefined, cmd);
	} catch (e) {
		callback(e);
		return;
	}
};

commands.help = function () {
	program.help();
};
