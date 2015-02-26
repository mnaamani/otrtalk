var https = require('https');
var VERSION = require("../package.json").version;

var version = module.exports;

version.current = function () {
	return VERSION;
};

version.checkForUpdate = function (callback) {
	var pkg;
	https.get("https://raw.githubusercontent.com/mnaamani/node-otr-talk/master/package.json", function (res) {
		res.on('data', function (d) {
			try {
				pkg = JSON.parse(d.toString());
			} catch (e) {
				callback(new Error("Failed to parse new package version information"));
				return;
			}
			if (!pkg.version) {
				callback(new Error("New package has no version number!"));
				return;
			}
			if (pkg.version === version.current()) {
				callback(undefined, null);
			} else {
				callback(undefined, pkg.version);
			}

		});
	}).on('error', function (e) {
		callback(new Error("Update server unreachable."));
	});
};
