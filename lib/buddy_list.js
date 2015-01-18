var Buddy = require("./buddy.js");

module.exports = Buddies;


function Buddies(config, password, store) {
	var self = {};

	self.aliases = function () {
		var buddies = [];
		config.buddies.forEach(function (buddy) {
			buddies.push(buddy.alias);
		});
		return buddies;
	};

	self.toString = function () {
		var Table = require("cli-table");
		var table = new Table({
			head: ['buddy alias', 'otrtalk id', 'fingerprint']
		});
		self.aliases().forEach(function (alias) {
			var buddy = self.getBuddy(alias);
			table.push([buddy.alias(), buddy.id(), buddy.fingerprint()]);
		});
		return table.toString();
	};

	self.getBuddy = function (alias) {
		var bud;
		config.buddies.forEach(function (buddy) {
			if (buddy.alias === alias) bud = Buddy(alias, buddy.id, config, password, store);
		});
		return bud;
	};

	self.createBuddy = function (alias, id) {
		return store.addBuddy(alias, id);
	};

	self.deleteBuddy = function (alias) {
		return store.removeBuddy(alias);
	};

	return self;
}
