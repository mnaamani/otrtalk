var keypress = require('keypress');
var tty = require('tty');
var ansi = require('ansi');

var defaultChatPrompt = 'otrtalk: ';

function setRawMode(mode) {
	if (process.stdin.setRawMode) {
		process.stdin.setRawMode(mode);
	} else {
		tty.setRawMode(mode);
	}
}

function timestamp() {
	return new Date().toTimeString();
}

module.exports.attach = function (session, done_callback) {
	session.attached();
	var SMP;
	var UI = new ChatConsole(onInput, onEnd, onCancel);

	function onInput(txt, inputMode) {
		switch (inputMode) {
		case 1: //message or command
			txt = txt.trim();
			if (!txt) return;
			switch (txt) {
			case "/help":
				console.log("available commands");
				console.log("/auth\n/info\n/clear\n/exit");
				return;
			case "/exit":
			case "/quit":
			case "/end":
				console.log("press Ctrl-D to end the chat");
				return;
			case "/clear":
				//best way to clear the screen..?
				UI.clear();
				return;
			case "/auth": //start smp
				if (SMP && SMP.incoming) {
					console.log("enter authentication response:");
					return ({
						prompt: '[secret]: ',
						inputMode: 4
					});
				} else {
					SMP = {
						outgoing: true
					};
					console.log("preparing to send authentication request:");
					return ({
						prompt: '[question]: ',
						inputMode: 2
					});
				}
				return;
			case "/info": //get session info, state,ip:port (geoip),fingerprint,buddy,buddyid
				console.log("[session " + (session.authenticated() ? "authenticated" : "not authenticated!") +
					"]");
				console.log("[session " + (session.encrypted() ? "encrypted" : "not encrypted!") + "]");
				console.log("[peer address " + session.remote() + "]");
				console.log("[buddy fingerprint:", session.fingerprint());
				return;
			default:
				if (txt[0] == '/') {
					console.log("[unrecognised command, /help for help]");
					return;
				}
				if (session.secure()) {
					session.send(txt);
					console.log(timestamp(), "me", ": " + txt);
				} else session.end(); //hmmm
				return;
			}
			break;

		case 2: //entering smp question
			SMP.question = txt ? txt.trim() : undefined;
			if (SMP.question) {
				console.log("AUTH: Question = '" + SMP.question + "'");
			} else {
				console.log("AUTH: No question.");
			}
			return ({
				inputMode: 3,
				prompt: '[secret]: '
			});

		case 3: //entering smp secret to start smp request.
			SMP.secret = txt ? txt.trim() : undefined;
			if (SMP.secret) {
				console.error("[authentication request sent]");
				SMP.question ? session.smpq(SMP.question, SMP.secret) : session.smp(SMP.secret);
				return ({
					inputMode: 100,
					prompt: 'authenticating...'
				});
			}
			break;
		case 4: //entering smp secret to reply to smp request.
			SMP.response = txt ? txt.trim() : undefined;
			if (SMP.response) {
				console.error("[authentication response sent]");
				session.smpRespond(SMP.response);
				return ({
					inputMode: 100,
					prompt: 'authenticating...'
				});
			} else {
				//try again...
				return;
			}
		}
	}

	function onEnd() {
		//callback when Ctrl-D is pressed.
		session.end();
	}

	function onCancel() {
		if (SMP && SMP.outgoing) {
			console.log("cancelling SMP authentication.");
			session.smpAbort();
			SMP = undefined;
		}
	}

	session.on("message", function (msg) {
		console.log(timestamp(), session.buddy().alias(), ": " + msg);
	});

	session.on("smp", function (question) {
		if (SMP) return;
		SMP = {
			incoming: true
		};
		console.log("[received authentication request]");
		if (question) {
			console.log("AUTH: Question = '" + question + "'");
		} else {
			console.log("AUTH: No Question was attached to request.");
		}
		console.log("respond with the /auth command.");
	});

	session.on("auth-success", function () {
		//return chat console to inputMode 1
		console.log("[authentication successful]");
		SMP = undefined;
		UI.reset();
	});

	session.on("auth-failed", function () {
		//return chat console to inputMode 1
		console.log("[authentication failed]");
		SMP = undefined;
		UI.reset();
	});

	session.on("auth-aborted", function () {
		//return chat console to inputMode 1
		console.log("[authentication aborted]");
		SMP = undefined;
		UI.reset();
	});

	session.on("closed", function () {
		console.log("[chat terminating]");
		process.stdin.removeAllListeners('keypress');
		setRawMode(false);
		process.stdin.end();
		done_callback();
	});

	UI.clear();

	console.log('--------------------------------------------------------------');
	console.log('  connected to:', session.buddy().alias());
	console.log('  address:', session.remote());
	console.log('  fingerprint:', session.fingerprint());
	console.log('--------------------------------------------------------------');
};

function ChatConsole(onInput, onEnd, onCancel) {
	var self = this;
	var buf = '';
	var inputMode = 1; //message,commands
	var prompt = defaultChatPrompt;
	var cursor = ansi(process.stdout);

	process.stdin.removeAllListeners('keypress'); //be the only listener!
	keypress(process.stdin);

	redraw_inputline();

	setRawMode(true); //when we close the console we will return to normal mode

	console.log = function (X) {
		//array join arguments - cursor.write(takes only one arg)
		if (arguments.length > 1) {
			X = Array.prototype.join.call(arguments, " ");
		}
		X = X || ''; //must be buffer or string..!

		cursor.horizontalAbsolute(0);
		cursor.eraseLine();
		cursor.write(X + '\n');
		if (inputMode > 0) redraw_inputline();
	};

	function redraw_inputline() {
		cursor.horizontalAbsolute(0);
		cursor.eraseLine();
		cursor.write(prompt);
		if (inputMode == 3 || inputMode == 4) {
			for (var m = 0; m < buf.length; m++) cursor.write("*");
			return;
		}
		cursor.write(buf);
	}

	this.reset = function () {
		inputMode = 1;
		prompt = defaultChatPrompt;
		buf = '';
		redraw_inputline();
	};

	function lf() {
		return '\n';
	}

	this.clear = function () {
		cursor.write(Array.apply(null, Array(process.stdout.getWindowSize()[1])).map(lf).join(''))
			.eraseData(2)
			.goto(1, process.stdout.getWindowSize()[1]);

		redraw_inputline();
	};

	// keypress
	process.stdin.on('keypress', function (c, key) {
		if (key && ('enter' == key.name || 'return' == key.name)) {
			var result;
			var oninput_mode = inputMode;
			process.stdin.pause();
			inputMode = 0; //if app wants to do console.log in oninput.. it can overwrite the input line
			cursor.horizontalAbsolute(0);
			cursor.eraseLine();
			if (buf.trim()) {
				result = onInput(buf, oninput_mode);
				if (result) {
					prompt = result.prompt ? defaultChatPrompt + result.prompt : prompt;
					inputMode = result.inputMode || oninput_mode;
				}
			} else process.stdout.write('\n');
			inputMode = inputMode || oninput_mode;

			buf = '';
			redraw_inputline();
			process.stdin.resume();
			return;
		}

		if (key && key.ctrl && 'c' == key.name) {
			self.reset();
			onCancel();
			return;
		}

		if (key && key.ctrl && 'd' == key.name) {
			inputMode = -1;
			cursor.write('\n');
			setRawMode(false);
			onEnd();
			return;
		}

		if (inputMode > 10) return;

		//filter out non text keypresses..
		if (c) {
			if (key && (key.name || key.code)) {
				if (key.ctrl) return;
				if (key.code) return;
				if (key.name) {
					switch (key.name) {
					case 'backspace':
						//remove last char from buf, redraw the input line
						if (buf.length) {
							buf = buf.substr(0, buf.length - 1);
							redraw_inputline();
						}
						return;
					case 'escape':
						buf = '';
						redraw_inputline();
						return;
					}
				}
			}
			//mask input if entering secrets .. inputModes 3,4
			if (inputMode == 3 || inputMode == 4) {
				process.stdout.write("*");
			} else process.stdout.write(c);
			buf += c;
		}
	}).resume();

	return self;
}
