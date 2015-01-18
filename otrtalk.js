#!/usr/bin/env node

/*
	This program is free software; you can redistribute it and/or modify
	it under the terms of version 2 of the GNU General Public License as published by
	the Free Software Foundation.

	This program is distributed in the hope that it will be useful,
	but WITHOUT ANY WARRANTY; without even the implied warranty of
	MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
	GNU General Public License for more details.

	You should have received a copy of the GNU General Public License
	along with this program. If not, see http://www.gnu.org/licenses/.

	The Off-the-Record Messaging library is
	Copyright (C) 2004-2012  Ian Goldberg, Rob Smits, Chris Alexander,
	Willy Lew, Lisa Du, Nikita Borisov
	<otr@cypherpunks.ca>
	https://otr.cypherpunks.ca/

	ENet Networking Library is Copyright (c) 2002-2013 Lee Salzman
*/

/* This is the Main Application Controller */

process.title = "otrtalk";

var commands;

if (!module.parent) {
	//otrtalk being run as an application - process commands and options
	commands = require("./lib/commands");
	commands.process(function (err, cmd) {
		if (err) {
			console.log(err);
			return;
		}

		if (cmd) {
			if (process.platform !== 'win32') process.on('SIGINT', function () {
				if (typeof cmd.exit === 'function') {
					cmd.exit(function (err) {
						if (err) console.log(err);
						process.exit();
					});
				} else {
					process.exit();
				}
			});

			process.stdin.on('end', function () {
				if (typeof cmd.exit === 'function') {
					cmd.exit(function (err) {
						if (err) console.log(err);
						process.exit();
					});
				} else {
					process.exit();
				}
			});

			cmd.exec(function (err) {
				if (err) {
					console.log(err);
					process.exit();
				} else {
					//command completed successfully
				}
			});

		} else {
			console.log("You did not issue a command");
			commands.help();
		}
	});

} else {
	//otrtalk has been loaded as a module
}
