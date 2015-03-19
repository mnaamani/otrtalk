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
			head: ['buddy alias', 'otrtalk id', 'fingerprint']
		});
		self.aliases().forEach(function (alias) {
			var buddy = self.getBuddy(alias);
			if (buddy) table.push([buddy.alias(), buddy.id(), buddy.fingerprint()]);
		});
		return table.toString();
	};

	self.getBuddy = function (alias, id) {
		var found;
		self.aliases().forEach(function (a) {
			if (alias === a) found = Buddy(alias, id, store, password);
		});
		return found;
	};

	self.newBuddy = function (alias, id) {
		if (alias.match(/^[A-Z0-9-_][A-Z0-9-_\.]+$/ig) && id.match(/^[A-Z0-9-_@\.]+$/ig)) {
			return Buddy(alias, id, store, password);
		}
		return undefined;
	};

	self.deleteBuddy = function (alias) {
		if (alias.match(/^[A-Z0-9-_][A-Z0-9-_\.]+$/ig)) return store.removeBuddy(alias);
		return false;
	};

	return self;
}
