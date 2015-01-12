var program = require("../commander");
var imapp = require("../imapp.js");
var tool = require("../tool.js");
var talk = require("../talk.js");
var debug = require("../debug.js");
var pm = require("../profile_manager.js");

module.exports = Command;

function Command(ui) {
    this.UI = ui;
}


Command.prototype.exec = function (alias, mode) {
    var UI = this.UI;
    var settings = {};
    settings.verbose = program.verbose;
    settings.interface = program.interface;
    settings.host = program.host;

    function getProfile(next) {
        var list = [];

        if (!pm.empty()) {
            //show a list selection of profiles to choose from.
            pm.profiles().forEach(function (prof) {
                list.push(prof);
            });
            console.log("Select a profile:");
            program.choose(list, function (i) {
                pm.loadProfile(list[i], UI.enterPassword, next);
            });
            return;
        }

        //no profiles exist at all.. create a new one
        console.log("No profile exists, let's create one now.");

        var cmd = require("./profiles.js");
        var _cmd = new cmd(UI);
        _cmd.exec('add');

    }

    function getBuddy(profile, alias, next) {
        var list = [];

        if (alias) {
            var buddy = profile.buddies.getBuddy(alias);
            if (buddy) {
                return next(buddy);
            }
            console.log("Buddy not found.");
            program.confirm("  add [" + alias + "] to your buddy list now [y/n]? ", function (ok) {
                if (ok) {
                    program.prompt("  " + alias + "'s otrtalk id: ", function (id) {
                        if (!id) return;
                        profile.buddies.createBuddy(alias, id);
                        next(profile.buddies.getBuddy(alias));
                    });
                } else next();
            });
            return;
        }

        if (profile.buddies.aliases().length) {
            console.log('Select buddy:');
            profile.buddies.aliases().forEach(function (alias) {
                list.push(alias);
            });
            program.choose(list, function (i) {
                next(profile.buddies.getBuddy(list[i]));
            });
            return;
        }

        console.log("No buddy specified, and your buddy list is empty.");
        console.log("Enter new buddy details:");
        program.prompt("  alias: ", function (alias) {
            program.prompt("  " + alias + "'s otrtalk id: ", function (id) {
                if (!id) return;
                profile.buddies.createBuddy(alias, id);
                next(profile.buddies.getBuddy(alias));
            });
        });
    }

    //todo - double prompt for the secret
    function smpSecret(mode, secret, next) {
        if (mode == 'connect' && !secret) {
            console.log("When establishing a new trust with a buddy you must provide a shared secret.");
            console.log("This will be used by SMP authentication during connection establishment.");
            program.password("Enter SMP secret: ", "", function (secret) {
                next(secret);
            });
        } else {
            next(secret);
        }
    }

    getProfile(function (err, profile) {
        if (!profile) return;
        settings.id = profile.id();

        getBuddy(profile, alias, function (buddy) {
            if (!buddy) return;

            if (buddy.id() == profile.id()) {
                console.log("otrtalk id conflict. Profile and buddy have same otrtalk id.");
                return;
            }
            settings.buddy = buddy.alias();
            settings.buddyID = buddy.id();

            //if the fingerprint exists.. we have already trusted buddy fingerprint
            if (buddy.fingerprint()) {
                if (mode == 'connect') {
                    debug("You already have a trust with this buddy.\nSwitching to 'chat' mode.");
                    mode = 'chat';
                }
            } else {
                if (mode == 'chat') {
                    debug(
                        "You haven't yet established a trust with this buddy.\nSwitching to 'connect' mode."
                    );
                    mode = 'connect';
                }
            }

            settings.mode = mode;
            settings.network = "telehash";
            settings.seed = program.seed;
            settings.port = program.port;

            if (program.broadcast) {
                settings.network = "broadcast";
            }

            //esnure fingerprint if entered as option is correctly formatted
            if (mode == 'connect') {
                if (program.fingerprint && !tool.validateFP(program.fingerprint)) {
                    console.log("Invalid fingerprint provided");
                    return;
                }
                settings.fingerprint = tool.validateFP(program.fingerprint);
                if (program.pidgin || program.adium) {
                    debug("parsing IM app fingerprints");
                    settings.trusted_fingerprints = new imapp().parseFingerprints();
                }
            }

            //ensure we have a secret if we are in connect mode.
            smpSecret(mode, program.secret, function (secret) {
                settings.secret = secret;
                talk.launch(settings, buddy.setupSession(secret));
            });

        });
    });
};
