var program = require('./commander.js');
var telehash = require("get-telehash").v1.telehash;
var iputil = require("get-telehash").iputil;
var upnp = require("../upnp/nat-upnp.js").createClient(program.interface);
var didMapping = false;

var PORT = program.port ? parseInt(program.port) : 42424;

module.exports = Command;

function Command(ui) {
	this.UI = ui;
}

Command.prototype.exit = function (callback) {
	if (!didMapping) {
		callback();
		return;
	}
	upnp.portUnmapping({
		public: PORT,
		protocol: 'udp'
	}, function (err) {
		callback(err);
	});
};

Command.prototype.exec = function (cmdCallback) {
	var UI = this.UI;

	//allow multiple seeds.. comma separated
	var seeds = program.seed ? [program.seed] : undefined;

	if (program.interface === 'zt0' && !seeds) {
		seeds = ["28.192.75.206:42424"]; //default zerotier seed on earth network
	}
	UI.debug("starting telehash node");
	if (program.interface) UI.debug("on interface:", program.interface);
	if (seeds) UI.debug("using telehash seed(s):", seeds);
	var th = telehash.init({
		log: UI.debug,
		mode: 3,
		seeds: seeds,
		port: PORT,
		udplib: "node",
		broadcastMode: false,
		respondToBroadcasts: false,
		interface: program.interface,
		onSocketBound: function (addr) {
			UI.print("listening on:", addr);
			if (iputil.isPrivateIP(addr.address) && program.upnp) {
				UI.print("trying upnp port mapping..");
				upnp.portMapping({
					public: PORT,
					private: PORT,
					ttl: 0,
					protocol: 'udp'
				}, function (err) {
					if (err) {
						cmdCallback(new Error("upnp:" + err));
						return;
					} else didMapping = true;
					telehash.seed();
					cmdCallback();
				});
			} else {
				telehash.seed(function (err) {
					if (err) {
						return;
					}
					if (th.snat) {
						telehash.shutdown();
						UI.error(
							"You are behind a restrictive NAT/firewall. A telehash seed node can not operate effectively."
						);
						UI.error(
							"Try again using the --upnp option to attenpt to get around the firewall."
						);
						process.exit();
					}
				});
				cmdCallback();
			}
		}
	});
};
