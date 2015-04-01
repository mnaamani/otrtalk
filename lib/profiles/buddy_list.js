var Buddy = require("./buddy.js");

module.exports = Buddies;

function Buddies(store, password) {
	var self = {};

	self.aliases = function () {
		return store.buddies();
	};

	self.toString = function () {
		var Table = require("cli-table");
		var table = new Table({
			head: ['buddy', 'fingerprint']
		});
		self.aliases().forEach(function (alias) {
			var buddy = self.getBuddy(alias);
			var fp;
			if (buddy) {
				fp = buddy.fingerprints();
				table.push([buddy.alias(), fp.length ? fp[0] : ""]);
			}
		});
		return table.toString();
	};

	self.getBuddy = function (alias) {
		var found;
		self.aliases().forEach(function (a) {
			if (alias === a) found = Buddy(alias, store, password);
		});
		return found;
	};

	self.newBuddy = function (alias) {
		if (alias.match(/^[A-Z0-9-_][A-Z0-9-_\.]+$/ig)) {
			return Buddy(alias, store, password);
		}
		return undefined;
	};

	self.deleteBuddy = function (alias) {
		if (alias.match(/^[A-Z0-9-_][A-Z0-9-_\.]+$/ig)) return store.removeBuddy(alias);
		return false;
	};

	return self;
}
