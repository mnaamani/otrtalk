var p2p = require("./p2p"); //enet connections established by telehash discovery

module.exports.Link = Link;

module.exports.init = function (settings, onReady) {
	if (settings.interface === 'zt0' && !settings.seed) {
		settings.seed = "28.192.75.206:42424"; //default zerotier seed on earth network
	}
	p2p.seedMode({
		mode: 2,
		ready: onReady,
		interface: settings.interface,
		seeds: settings.seed ? [settings.seed] : undefined,
		port: settings.port ? settings.port : undefined,
		upnp: settings.upnp
	});
};

module.exports.shutdown = function () {
	p2p.shutdown();
};

function Link(local, remote) {
	var arr = [local, "/otr-talk/", remote];
	this.local_end_name = arr.join("");
	this.remote_end_name = arr.reverse().join("");
}

Link.prototype.connect = function (onConnect) {
	p2p.setCallbacks({
		'onConnect': onConnect
	});
	this._listener = p2p.listen(this.local_end_name);
	this._connector = p2p.connect(this.remote_end_name);
};

Link.prototype.pause = function () {
	this._connector.pause();
	this._listener.pause();
};
