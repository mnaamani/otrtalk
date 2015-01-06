var UserFiles = require("./files.js").UserFiles;

module.exports = Buddy;

function Buddy(alias, id, config, password, store) {
    var self = {};
    var otrm = require(config.otr);

    self.alias = function () {
        return alias;
    };

    self.id = function () {
        return id;
    };

    self.fingerprint = function () {
        var user = UserFiles(otrm, store.buddyKeystoreFiles(alias), password);
        var account = user.account(config.accountname, config.protocol);
        var fingerprints = account.contact(self.id()).fingerprints();
        var fingerprint = "";
        if (fingerprints.length) {
            fingerprint = fingerprints[0].fingerprint();
        }
        if (user.deleteVfsFiles) user.deleteVfsFiles();
        user.state.free();
        return fingerprint;
    };

    self.setupSession = function (secret) {
        return (function () {
            var user = UserFiles(otrm, store.buddyKeystoreFiles(alias), password);
            var account = user.account(config.accountname, config.protocol);
            var contact = account.contact(self.id());
            return ({
                otr: contact.openSession({
                    policy: otrm.POLICY.ALWAYS,
                    secret: secret
                }),
                writeTrustedFingerprints: function () {
                    user.writeTrustedFingerprints();
                    user.saveUserFiles();
                },
                end: function () {
                    if (user.deleteVfsFiles) user.deleteVfsFiles();
                    user.state.free();
                }
            });
        });
    };

    return self;
}
