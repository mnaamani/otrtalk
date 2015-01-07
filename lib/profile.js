var UserFiles = require("./files").UserFiles;

var BuddyList = require("./buddy_list");

module.exports = Profile;

function Profile(name, config, password, store) {
    var self = {};

    //override otr3 with otr4-em, (deprecating support for otr3)
    //     - but userfiles will not be encrypted because we don't prompt for a password
    //override otr4 with otr4-em while we upgrade otr4 api to match otr4-em
    if (config.otr === "otr3" || config.otr === "otr4") {
        otrm = require("otr4-em");
    } else {
        otrm = require(config.otr);
    }
    var user = UserFiles(otrm, store.keystoreFiles(), password);
    var account = user.account(config.accountname, config.protocol);

    //if we are overriding otr3 for first time we need to generate an instag
    if (config.otr === "otr3") {
        if (account.instag() === undefined) {
            account.generateInstag();
            user.saveUserFiles();
        }
    }

    self.buddies = BuddyList(config, password, store);

    self.id = function () {
        return config.id;
    };

    self.name = function () {
        return name;
    };

    self.save = function () {
        store.save(config);
        user.saveUserFiles();
    };

    //todo - print buddies
    self.print = function () {
        var Table = require("cli-table");
        var table = new Table();
        var account = user.account(config.accountname, config.protocol);
        var fingerprint = account.fingerprint();
        table.push({
            'Profile': name
        }, {
            'otrtalk-id': config.id
        }, {
            'keystore': store.pathToKeys()
        }, {
            'otr-module': config.otr
        }, {
            'fingerprint': fingerprint
        });
        console.log(table.toString());
    };

    self.generateKey = function (next) {
        account.generateKey(function (err) {
            if (err) {
                next(err);
                return;
            } else {
                account.generateInstag(function (err, instag) {
                    if (err) {
                        next(err);
                    } else {
                        self.save();
                        next();
                    }
                });
            }
        });
    };

    self.importKey = function (privkey, callback) {
        try {
            account.importKey(privkey);
            account.generateInstag();
            self.save();
            callback(undefined);
        } catch (e) {
            callback(e);
        }
    };

    return self;
}
