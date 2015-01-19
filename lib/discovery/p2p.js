var telehash = require("get-telehash").v1.telehash;
var iputil = require("get-telehash").iputil;
var enet = require("get-telehash").udplib.enet;
var _upnp = require("../upnp/nat-upnp.js");
var upnp;

var callbacks = {};
var activePeers = {};
var connectingPeers = {};
var p2p;
var localAddr;
var didMapping = false;
exports.seedMode = seedMode;
exports.broadcastMode = broadcastMode;

exports.setCallbacks = function (cb) {
	callbacks.onConnect = cb.onConnect;
};
exports.connect = doConnector;
exports.listen = doListener;
exports.shutdown = function () {
	if (!didMapping) {
		telehash.shutdown();
		return;
	}
	upnp.portUnmapping({
		public: iputil.PORT(localAddr),
		protocol: 'udp'
	}, function (err) {
		if (err) console.log(err);
		telehash.shutdown();
	});
};

var MsgType = {
	/* requests */
	CONNECT: 100,

	/* responses */
	ACK: 201,
	ACK_LOCAL: 202,
	ACK_SNAT: 204 //no longer used
};

var CONNECT_RETRY_DELAY_MS = 5000;
var CONNECT_RESPONSE_TIMEOUT_S = 8;
var CONNECT_INIT_WAIT_MS = 5000;

function broadcastMode(arg) {
	CONNECT_RETRY_DELAY_MS = 5000;
	CONNECT_RESPONSE_TIMEOUT_S = 5;
	CONNECT_INIT_WAIT_MS = 5000;

	return init({
		mode: 3,
		seeds: [],
		port: arg.port,
		udplib: "enet",
		broadcastMode: true,
		respondToBroadcasts: (arg.port === 42424),
		ready: arg.ready,
		interface: arg.interface
	});
}

function seedMode(arg) {
	return init(arg);
}

function init(arg) {
	if (p2p) return p2p;

	arg.mode = arg.mode || 2;
	if (arg.mode < 2) arg.mode = 2; //minimum required is mode 2

	p2p = telehash.init({
		p2p_instance: true, //make sure we initialsed telehash module
		mode: arg.mode,
		seeds: arg.seeds,
		port: arg.port,
		ip: arg.ip,
		udplib: "enet",
		broadcastMode: arg.broadcastMode,
		respondToBroadcasts: arg.respondToBroadcasts,
		interface: arg.interface,
		lan: arg.lan
	});

	if (!p2p.p2p_instance) {
		console.log("Warning: p2p module needs to be initialise before telehash module!");
		process.exit();
	}

	p2p.server.host.on("connect", function (peer, data, outgoing) {
		var ip = peer.address().address();
		var port = peer.address().port();
		var ipp = ip + ":" + port;
		if (activePeers[ipp]) {
			peer.disconnect();
			return;
		}
		activePeers[ipp] = peer;
		if (connectingPeers[ipp]) delete connectingPeers[ipp];
		peer.on("disconnect", function () {
			if (activePeers[ipp]) delete activePeers[ipp];
		});
		callbacks.onConnect(peer);
	});

	p2p.server.host.on("ready", function () {
		localAddr = p2p.server.address();
		localAddr = localAddr.address + ":" + localAddr.port;
		if (arg.broadcastMode) {
			telehash.broadcast(localAddr);
			if (arg.ready) arg.ready(localAddr);
		} else {
			console.log("local address:", localAddr);
			if (iputil.isPrivateIP(p2p.server.address().address) && arg.upnp) {
				console.log("doing upnp port mapping..");
				upnp = _upnp.createClient(arg.interface);
				upnp.portMapping({
					public: iputil.PORT(localAddr),
					private: iputil.PORT(localAddr),
					ttl: 0,
					protocol: 'udp'
				}, function (err) {
					if (err) {
						console.log("upnp:", err);
					} else didMapping = true;
					telehash.seed(function (err) {
						if (err) {
							return;
						}
						console.log("public address:", p2p.me.ipp);
						//inform app we are seeded and ready to connect/listen
						if (arg.ready) arg.ready(p2p.me.ipp);
					});
				});
			} else {
				telehash.seed(function (err) {
					if (err) {
						return;
					}
					console.log("public address:", p2p.me.ipp);
					//inform app we are seeded and ready to connect/listen
					if (arg.ready) arg.ready(p2p.me.ipp);
				});
			}
		}
	});
	return p2p;
}

function doConnector() {
	return (function (name, retry) {
		var active = true;
		var connector = telehash.connect(name);

		function connect() {
			if (!active) return;
			connector.send({
				type: MsgType.CONNECT,
				ipp: p2p.me.ipp,
				localipp: p2p.lan ? localAddr : undefined
			}, function (response) {
				if (response) {
					handleResponse(response);
				} else {
					//timeout..loop again
					setTimeout(connect, retry ? retry * 1000 : CONNECT_RETRY_DELAY_MS); //try again after 'retry' seconds, or 5 seconds default
				}
			}, CONNECT_RESPONSE_TIMEOUT_S); //8 second timeout for responses
		}

		//5 second delay before we start using connector to allow time for underlying dialer and tapping to occur
		setTimeout(connect, CONNECT_INIT_WAIT_MS);

		return ({
			pause: function () {
				active = false;
				//connector.stop(); - todo  (stop dialing)
			},
			resume: function () {
				if (active) return;
				active = true;
				connect();
			}
		});

	}).apply(this, arguments);
}

function doListener(name) {
	var active = true;
	var listener = telehash.listen(name, function (request) {
		if (active) handleConnect(request);
	});
	return ({
		pause: function () {
			active = false;
			//listener.stop(); - todo (stop .tap)
		},
		resume: function () {
			active = true;
		}
	});
}

function popf(to) {
	var buf = new Buffer(JSON.stringify({}));
	p2p.server.send(buf, 0, buf.length, iputil.PORT(to), iputil.IP(to));
}

function handleConnect(request) {
	if (parseInt(request.message.type) !== MsgType.CONNECT) return;
	request.reply({
		type: (p2p.lan && request.message.localipp) ? MsgType.ACK_LOCAL : MsgType.ACK,
		ipp: p2p.me.ipp,
		localipp: (p2p.lan && request.message.localipp) ? localAddr : undefined
	});
}

function handleResponse(response) {
	var message = response.message;
	switch (parseInt(message.type)) {
	case MsgType.ACK:
		popf(message.ipp);
		doOutgoingConnection(message.ipp, message.id);
		break;
	case MsgType.ACK_LOCAL:
		//try to connect on local address (maybe we are on the same LAN)
		if (p2p.lan && message.localipp) {
			doOutgoingConnection(message.localipp, message.id);
		}
		//also try to connect on public address but give local a head start
		setTimeout(function () {
			popf(message.ipp);
			doOutgoingConnection(message.ipp, message.id);
		}, 2000);
		break;
	}
}

function doOutgoingConnection(ipp, id) {
	if (activePeers[ipp]) return;
	if (connectingPeers[ipp]) return;
	connectingPeers[ipp] = p2p.server.host.connect(new enet.Address(ipp), 4, id ? id : 0, function (err, peer) {
		if (err) {
			delete connectingPeers[ipp];
		}
	});
}
