var telehashNode = require("../net/telehash-node");

var services = {};


var serviceManager = module.exports = {
	request: function (name, settings) {
		switch (name) {
		case "telehash":
			return getTelehashNode(settings);
		}
		return undefined;
	},
	stopAll: function (callback) {
		if (services["telehash"]) services["telehash"].stop(callback); //todo chain multiple services
	}
};


function getTelehashNode(settings) {
	var srvc = services["telehash"] = services["telehash"] || telehashNode.create(settings);
	return srvc;
}
