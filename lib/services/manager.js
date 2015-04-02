var telehashNode = require("./telehash-node");
var enetNode = require("./enet-node");
var connManager = require("./connections-manager.js");
var peerPool = require("./peer-pool.js");
var socketManager = require("./socket.js");
var broadcast = require("./broadcast.js");
var torrent = require("./torrent.js");

var services = {};

var serviceManager = module.exports = {
	require: function (name) {
		var srvc;
		switch (name) {
		case "telehash":
			srvc = services[name] = services[name] || telehashNode.create();
			break;
		case "enet":
			srvc = services[name] = services[name] || enetNode.create();
			break;
		case "connections-manager":
			srvc = services[name] = services[name] || connManager.create();
			break;
		case "peer-pool":
			srvc = services[name] = services[name] || peerPool.create();
			break;
		case "socket":
			srvc = services[name] = services[name] || socketManager.create();
			break;
		case "broadcast":
			srvc = services[name] = services[name] || broadcast.create();
			break;
		case "torrent":
			srvc = services[name] = services[name] || torrent.create();
			break;

		}
		return srvc;
	},
	stopAll: function () {
		if (services["broadcast"]) services["broadcast"].stop();
		if (services["connections-manager"]) services["connections-manager"].stop();
		if (services["peer-pool"]) services["peer-pool"].stop();
		if (services["enet"]) services["enet"].stop();
		if (services["telehash"]) services["telehash"].stop();
		if (services["socket"]) services["socket"].stop();
		if (services["torrent"]) services["torrent"].stop();
	}
};
