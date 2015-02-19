var async = require("async");
var events = require("events");
var util = require("util");
var assert = require("assert");
var debug = require("debug")("session");

module.exports = SessionHandler;

util.inherits(SessionHandler, events.EventEmitter);

var ConnState = {
	INIT: 0,
	SECURE: 2,
	AUTH: 4,
	TRUSTED: 6,
	CHAT: 8,
	ENDED: 10
};


function SessionHandler(peer, settings) {
	var handler = this;
	if (settings && settings.profile && settings.buddy) {
		if (!settings.buddy.fingerprint() && !settings.secret) return undefined;
	} else {
		return undefined;
	}
	var session = settings.buddy.setupSession(settings.secret);
	events.EventEmitter.call(handler);

	var state = {
		initAT: Date.now(),
		initiator: false,
		//state of buddy's fingerprint in this session
		trust: {
			NewFingerprint: false, //fingerprint not previously on file
			Authenticated: false, //successfully smp authenticated at least once in this session.
			Trusted: false //when connection goes encrypted, will be set to true if previously SMP authenticated
		},
		conn: ConnState.INIT,
		flags: {
			rcvd_go_chat: false,
			sent_go_chat: false,
			rcvd_start_otr: false,
			rcvd_start_smp: false
		},
		toss: parseInt(Math.random() * 1000000), //coin toss to decide who will be initiator
		mode: settings.buddy.fingerprint() ? "chat" : "connect" //initial mode
	};

	handler.isAuthenticated = function () {
		return state.trust.Authenticated;
	};

	handler.isTrusted = function () {
		return state.trust.Trusted;
	};

	handler.isNewFingerprint = function () {
		return state.trust.NewFingerprint;
	};

	var queue = async.queue(inject_worker, 1);

	function inject_worker(buffer, callback) {
		peer.send(1, buffer, callback); //keep otr conversation on channel 1
	}

	session.otr.on("inject_message", function (msg) {
		//remove username from ?OTR? query message
		var query = msg.match(/^\?OTR\?v[1-3]+\?/);
		if (query) {
			msg = query[0];
		}
		queue.push(new Buffer(msg));
	});

	session.otr.on("message", function (msg, encrypted) {
		//reject plaintext and insecure messages
		if (!encrypted) return;
		if (!session.otr.isAuthenticated()) return;
		if (state.conn == ConnState.CHAT) handler.emit('message', msg);
	});

	//new_fingerprint event raised before gone_secure
	session.otr.on("new_fingerprint", function (fp) {
		state.trust.NewFingerprint = true;
		debug("[new fingerprint]:", fp);
	});

	session.otr.on("gone_secure", function () {
		debug("[gone secure]");
		state.trust.Trusted = session.otr.isAuthenticated();
		state.conn = ConnState.SECURE;
		onEncrypted();
	});

	session.otr.on("still_secure", function () {
		debug("[still_secure]");
	});

	function onEncrypted() {
		switch (state.mode) {
		case 'chat':
			if (state.trust.Trusted) {
				state.conn = ConnState.TRUSTED;
				handler.emit("auth");
			} else {
				debug("[only accepting authenticated fingerprints]");
				state.conn = ConnState.ENDED;
				handler.end();
			}
			break;

		case 'connect':
			/* user specified fingerprint of buddy, if this connection doesn't match
				   reject it and don't waste time with SMP */
			if (settings.fingerprint) {
				if (handler.fingerprint() != settings.fingerprint) {
					handler.end();
				} else {
					debug("[connection fingerprint match]");
				}
			}
			/* user wants to cross check fingerprints against pidgin/adium buddies, if we don't get a match
				   reject connection */
			if (settings.trusted_fingerprints) {
				var known = settings.trusted_fingerprints.match(handler.fingerprint());
				if (known) {
					debug("found IM trusted buddy:", known.username);
				} else {
					handler.end();
					break;
				}
			}

			//starting smp on both sides at the same time problematic.
			//so we notify peer that we are ready to start SMP
			peer.send(0, new Buffer(JSON.stringify({
				cmd: "START_SMP"
			})));

			break;
		}
	}

	session.otr.on("disconnect", function () {
		debug("[remote closed session]");
		handler.end();
	});

	session.otr.on("smp", function (type, question) {
		switch (type) {
		case "request":
			if (state.conn == ConnState.SECURE || state.conn == ConnState.CHAT) {
				if (state.mode == "connect") {
					//auto SMP authentication, ignoring question... and will respond with settings.secret
					debug("[responding to authentication request]");
					session.otr.smpRespond();
				} else {
					//in chat mode - do interactive SMP.
					handler.emit("smp", question);
				}
			}
			break;
		case "complete":
			debug("[authentication success]");
			state.trust.Authenticated = true;
			if (state.mode == 'connect') {
				handler.emit("auth");
				state.conn = ConnState.TRUSTED;
			} else {
				if (state.conn == ConnState.CHAT) handler.emit("auth-success"); //event will be consumed by chat ui
			}
			break;
		case "failed":
			debug("[authentication failed]");
			if (state.mode == 'connect') {
				//auto SMP in connect mode, only get one chance.. per session!
				handler.end();
			} else handler.emit("auth-failed"); //for the chat ui
			break;
		case "aborted":
			debug("[authentication aborted]");
			if (state.mode == 'connect') {
				//auto SMP in connect mode, only get one chance.. per session!
				handler.end();
			} else handler.emit("auth-failed"); //for the chat ui
			break;
		}
	});


	peer.on("message", function (packet, chan) {
		var buff = packet.data();
		var control;

		if (chan == 1) {
			session.otr.recv(buff);
			return;
		}

		if (chan === 0) {
			if (state.conn === ConnState.CHAT || state.conn === ConnState.ENDED) return;
			try {
				control = JSON.parse(buff.toString());
				processControlMessage(control);
			} catch (E) {
				debug("otrtalk connection setup protocol error.", E);
				peer.send(0, new Buffer(JSON.stringify({
					cmd: "ABORTING",
					reason: 'PROTOCOL_ERROR'
				})));
				handler.end();
			}
		}
	});

	function processControlMessage(control) {
		switch (control.cmd) {
		case "START_OTR":
			if (state.conn !== ConnState.INIT) break;
			if (state.flags.rcvd_start_otr) break;
			state.flags.rcvd_start_otr = true;
			if (state.toss > parseInt(control.toss)) {
				state.initiator = true;
				debug("[initiating otr]");
				session.otr.start();
			} else {
				if (state.toss == control.toss) {
					//todo - do coin toss again...
					handler.end();
				} else debug("[waiting for otr init]");
			}
			break;
		case "START_SMP":
			if (state.mode === 'chat') {
				//remote is excpecting to do SMP (most likely they dont trust our fingerprint and are in connect mode)
				//let them know we already trust their fingerprint. (They will have already been sent the GO_CHAT msg)
				//todo: add option to do re-authenticate
				if (state.trust.Trusted) debug("remote buddy requestig re-authentication");
				peer.send(0, new Buffer(JSON.stringify({
					cmd: "ABORTING",
					reason: 'NOT_EXCPECTING_SMP_1'
				})));
				handler.end();
				break;
			} else {
				if (state.flags.rcvd_start_smp) break;
				state.flags.rcvd_start_smp = true;
				if (!state.trust.Trusted) {
					state.conn = ConnState.AUTH;
					debug("[starting authentication]");
					if (state.initiator) session.otr.smpStart();
				} else {
					//we should not be in connect mode, or get a START_SMP command if we
					//already trust our buddy
					peer.send(0, new Buffer(JSON.stringify({
						cmd: "ABORTING",
						reason: 'NOT_EXCPECTING_SMP_2'
					})));
					handler.end();
				}
			}
			break;
		case "ABORTING":
			debug("[remote is aborting connection] reason:", control.reason);
			handler.end();
			break;
		case "GO_CHAT":
			//remote is ready to enter secure chat..
			if (state.flags.rcvd_go_chat) break;
			state.flags.rcvd_go_chat = true;
			if (state.flags.sent_go_chat) {
				if (state.mode == 'connect') handler.writeAuthenticatedFingerprints();
				state.mode = "chat";
				handler.emit("start_chat");
			}
			break;
		}
	}


	peer.on("disconnect", function () {
		debug("[peer disconnected]");
		handler.end();
	});

	handler.goEncrypted = function () {
		session.otr.start();
	};

	handler.abort_smp = function () {
		session.otr.smpAbort();
	};

	handler.respond_smp = function (secret) {
		session.otr.smpRespond(secret);
	};

	handler.smp = function (secret) {
		session.otr.smpStart(secret);
	};

	handler.smpq = function (Q, secret) {
		session.otr.smpStartQuestion(Q, secret);
	};

	handler.secure = function () {
		return (session.otr.isEncrypted() && session.otr.isAuthenticated());
	};

	handler.encrypted = function () {
		return session.otr.isEncrypted();
	};

	handler.authenticated = function () {
		return session.otr.isAuthenticated();
	};

	handler.send = function (msg) {
		if (state.conn !== ConnState.CHAT) return;
		if (session.otr.isAuthenticated() && session.otr.isEncrypted()) session.otr.send(msg);
	};

	handler.fingerprint = function () {
		return session.otr.theirFingerprint();
	};

	handler.remote = function () {
		return (peer.address().address + ":" + peer.address().port);
	};

	handler.writeAuthenticatedFingerprints = function () {
		session.writeTrustedFingerprints();
	};

	handler.end = function () {
		if (handler.ending) return;
		handler.ending = true;
		state.conn = ConnState.ENDED;
		session.otr.end();
		setTimeout(function () {
			session.otr.destroy();
			session.end();
			peer.disconnectLater();
			handler.emit("closed");
		}, 150);
	};

	//a chat UI attached to this session
	handler.attached = function () {
		if (state.conn != ConnState.TRUSTED) return;
		state.conn = ConnState.CHAT;
	};

	handler.go_chat = function () {
		if (state.conn == ConnState.ENDED) return;
		//we are ready to enter secure chat
		if (session.otr.isAuthenticated()) {
			peer.send(0, new Buffer(JSON.stringify({
				cmd: "GO_CHAT"
			})));
			state.flags.sent_go_chat = true;
			state.conn = ConnState.TRUSTED;
			if (state.flags.rcvd_go_chat) {
				if (state.mode == 'connect') handler.writeAuthenticatedFingerprints();
				state.mode = "chat";
				handler.emit("start_chat");
			}
		} else handler.end();
	};

	handler.start = function () {
		//if both ends initiate otr at the same time... protocol hangs.. :(
		peer.send(0, new Buffer(JSON.stringify({
			cmd: "START_OTR",
			toss: state.toss
		})));
		//todo - timeout after 30s if connection hasn't gone_secure
	};

	handler.mode = function (mode) {
		return state.mode;
	};

	handler.buddy = function () {
		return settings.buddy;
	};

	return handler;
}
