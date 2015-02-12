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

var commands = !module.parent ? require("./lib/commands") : undefined;

if (commands) {
	process.title = "otrtalk";

	//otrtalk being run as an application - process commands and options
	commands.process(function (err, cmd) {
		var mainCtrl;
		if (err) {
			console.log(err);
			return;
		}

		if (cmd) {
			mainCtrl = require("./lib/controllers/main.js");
			mainCtrl.on("shutdown", function () {
				console.log("exiting.");
				process.exit();
			});

			cmd.exec(function (err, mode, config) {
				if (err) {
					console.log(err);
				}
				console.log("command finished.");
				//command may have started services and is still running.
				//when the command finishes its job it will call mainCtrl.exit() which
				//will stop running services and shutdown the application.
			}, mainCtrl);
		} else {
			console.log("You did not issue a command");
			commands.help();
		}
	});

} else {
	//otrtalk has been loaded as a module
	//todo - export service manager, profile manager, session and chat managers...
}
