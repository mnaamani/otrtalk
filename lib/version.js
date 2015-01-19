var https = require('https');
var VERSION = require("../package.json").version;

var version = module.exports;

version.current = function () {
	return VERSION;
};

version.checkForUpdate = function (callback) {
	var package;
	https.get("https://raw.githubusercontent.com/mnaamani/node-otr-talk/master/package.json", function (res) {
		res.on('data', function (d) {
			try {
				package = JSON.parse(d.toString());
				if (!package.version) {
					callback(new Error("New package has no version number!"));
					return;
				}
				if (package.version === version.current()) {
					callback(undefined, null);
				} else {
					callback(undefined, package.version);
				}
			} catch (e) {
				callback(new Error("Failed to parse new package version information"));
			}
		});
	}).on('error', function (e) {
		callback(new Error("Update server unreachable."));
	});
};
