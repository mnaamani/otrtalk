var fs = require("fs");
var path = require("path");
var fs_existsSync = fs.existsSync || path.existsSync;
var imapp = require("../imapp.js");
var tool = require("../tool.js");
var program = require('../commander.js');
var pm = require("../profile_manager.js");

module.exports = Command;

function Command(ui) {
    this.UI = ui;
}

//todo - move buddies command to be a subcommand of profiles command
Command.prototype.exec = function (action) {
    var UI = this.UI;

    function selectProfile(next) {
        var list = [];

        if (pm.empty()) {
            console.error("no profiles exist");
            next("no-profiles-exist");
            return;
        }

        //show a list selection of profiles to choose from.
        pm.profiles().forEach(function (prof) {
            list.push(prof);
        });
        console.log("Select a profile:");
        program.choose(list, function (i) {
            pm.loadProfile(list[i], UI.enterPassword, next);
        });
    }

    action = action || "list";

    switch (action) {

    case 'remove':

        selectProfile(function (err, profile) {
            if (err) return;
            var list = [];
            if (profile.buddies.aliases().length) {
                console.log('Select buddy:');
                profile.buddies.aliases().forEach(function (alias) {
                    list.push(alias);
                });
                program.choose(list, function (i) {
                    program.confirm("Are you sure you want to remove buddy: " + list[i] +
                        " [y/n]? ",
                        function (ok) {
                            if (ok) {
                                profile.buddies.deleteBuddy(list[i]);
                                console.log("removed buddy:", list[i]);
                            }
                        });
                });
                return;
            }
        });
        break;

    case 'list':

        selectProfile(function (err, profile) {
            if (profile) {
                profile.buddies.printList();
            }
        });

        break;
    }
};
