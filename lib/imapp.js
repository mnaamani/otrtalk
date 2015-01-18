var _ = require("underscore");
var fs = require("fs");
var path = require("path");
var fs_existsSync = fs.existsSync || path.existsSync;
module.exports = App;

var imapps = require('./imapp-paths.json').apps;

function App(app) {
	var found = _.findWhere(imapps, {
		name: app
	});
	if (found) this._platforms = found.platforms;
}

App.prototype.valid = function () {
	return (this._platforms !== undefined);
};

App.prototype.supported = function () {
	return _.findWhere(this._platforms, {
		platform: process.platform
	}) ? true : false;
};

App.prototype.keystore = function () {
	var settings = _.findWhere(this._platforms, {
		platform: process.platform
	});
	if (!settings) return;
	return resolve_home_path(settings.keys);
};

App.prototype.parseFingerprints = function () {
	var self = this;
	self._parsed_fingerprints = [];
	if (!self._platforms) return;
	var settings = _.findWhere(self._platforms, {
		platform: process.platform
	});
	if (!settings) return;

	var filename = resolve_home_path(settings.fingerprints);
	if (fs_existsSync(filename)) {
		//buddy-username    accountname     protocol    fingerprint     smp
		var buddies = fs.readFileSync(filename, "utf-8").split('\n');
		if (buddies && buddies.length) {
			buddies.forEach(function (line) {
				var entry = line.split(/\s+/);
				if (entry[4] == 'smp') self._parsed_fingerprints.push({
					username: entry[0],
					accountname: entry[1],
					protocol: entry[2],
					fingerprint: entry[3]
				});
			});
		}
	}
	return this;
};

App.prototype.match = function (fp) {
	var match;
	if (this._parsed_fingerprints.length) {
		this._parsed_fingerprints.forEach(function (entry) {
			if (entry.fingerprint.toUpperCase() == fp.replace(/\s/g, "")) match = entry;
		});
	}
	return match;
};

App.prototype.fingerprints = function () {
	return this._parsed_fingerprints;
};

function resolve_home_path(str) {
	if (!str) {
		return;
	}
	return str.replace("~", process.env[process.platform == 'win32' ? 'USERPROFILE' : 'HOME']);
}
