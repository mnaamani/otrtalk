var UserFiles = require("./files").UserFiles;

var BuddyList = require("./buddy_list");

module.exports = Profile;

function Profile(name, config, password, store) {
    var self = {};
    var otrm = require(config.otr);
    var user = UserFiles(otrm, store.keystoreFiles(), password);

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
        var account = user.account(config.accountname, config.protocol);
        account.generateKey(function (err) {
            if (err) {
                next(err);
                return;
            } else {
                if (!account.generateInstag) {
                    next();
                    return;
                }
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
        var account = user.account(config.accountname, config.protocol);
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
