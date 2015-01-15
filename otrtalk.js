#!/usr/bin/env node

var OTRTALK_VERSION = require("./lib/version.js").version;
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

var program = require("./lib/commander");
var UI = require("./lib/ui.js");

var _cmd; //command which was executed

process.title = "otrtalk";

    if (process.platform != 'win32') process.on('SIGINT', function () {
        if (_cmd.exit) _cmd.exit();
    });

    program
        .links("Report bugs: <https://github.com/mnaamani/node-otr-talk/issues>\n" +
            "Documentation: <https://github.com/mnaamani/node-otr-talk/wiki>")
        .version("otrtak " + OTRTALK_VERSION + "\nCopyright (C) 2013 Mokhtar Naamani <mokhtar.naamani@gmail.com>\n" +
            "This program is free software; you can redistribute it and/or modify it\n" +
            "under the terms of version 2 of the GNU General Public License as published by\n" +
            "the Free Software Foundation.\n" +
            "The Off-the-Record Messaging library is\n" +
            " Copyright (C) 2004-2012  Ian Goldberg, Rob Smits, Chris Alexander,\n" +
            "         Willy Lew, Lisa Du, Nikita Borisov\n" +
            "    <otr@cypherpunks.ca> https://otr.cypherpunks.ca/\n" +
            "\n" +
            "The ENet Networking Library is Copyright (c) 2002-2013 Lee Salzman\n\n" +
            "Report bugs: <https://github.com/mnaamani/node-otr-talk/issues>\n" +
            "Documentation: <https://github.com/mnaamani/node-otr-talk/wiki>")
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
        .option("--upnp", "try to use upnp port mapping");

    program
        .command('connect [buddy]')
        .description('establish new trust with buddy')
        .action(function (alias) {
            var cmd = require("./lib/commands/chat_connect.js");
            _cmd = new cmd(UI);
            _cmd.exec(alias, 'connect');
        });

    program
        .command('chat [buddy]')
        .description('chat with trusted buddy')
        .action(function (alias) {
            var cmd = require("./lib/commands/chat_connect.js");
            _cmd = new cmd(UI);
            _cmd.exec(alias, 'chat');
        });

    program
        .command('profiles [list|info|add|remove]')
        .description('manage profiles')
        .action(function (action) {
            got_command = true;
            var cmd = require("./lib/commands/profiles.js");
            _cmd = new cmd(UI);
            _cmd.exec(action);
        });

    program
        .command('buddies [list|remove]')
        .description('manage buddies')
        .action(function (action) {
            got_command = true;
            var cmd = require("./lib/commands/buddies.js");
            _cmd = new cmd(UI);
            _cmd.exec(action);
        });

    program
        .command('import-key [pidgin|adium] [profile] [otrtalk-id]')
        .description('import a key from pidgin/adium into a new profile')
        .action(function (app, profile, id) {
            got_command = true;
            var cmd = require("./lib/commands/import-key.js");
            _cmd = new cmd(UI);
            _cmd.exec(app, profile, id);
        });

    program
        .command('im-buddies')
        .description('list pidgin and/or adium trusted buddies')
        .action(function () {
            got_command = true;
            var cmd = require("./lib/commands/im-buddies.js");
            _cmd = new cmd(UI);
            _cmd.exec();
        });

    program
        .command('update')
        .description('check if we are running latest version')
        .action(function () {
            got_command = true;
            var cmd = require("./lib/commands/update.js");
            _cmd = new cmd();
            _cmd.exec();
        });

    program
        .command('host')
        .description('host a telehash seed node')
        .action(function () {
            got_command = true;
            var cmd = require("./lib/commands/host.js");
            _cmd = new cmd();
            _cmd.exec();
        });

    program.parse(process.argv);

    process.stdin.on('end', function () {
        if (_cmd.exit) _cmd.exit();
    });

    if (!_cmd) {
        program.help();
    }
