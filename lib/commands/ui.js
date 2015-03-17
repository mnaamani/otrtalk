var program = require("./commander.js");
var UI = module.exports;
var debug = require("debug")("cmd");

UI.enterPassword = function (next) {
	program.password('enter key-store password: ', '', next);
};

UI.enterNewPassword = function (next) {
	console.log("Your keys will be stored in an encrypted key-store, protected with a password.");
	console.log("** Pick a long password to protect your keys in case the key-store is stolen **");
	program.password('new key-store password: ', '', function (password) {
		program.password('      confirm password: ', '', function (password_confirm) {
			if (password !== password_confirm) {
				console.log("password mismatch!");
				next();
			} else {
				next(password);
			}
		});
	});
};

UI.debug = debug;
UI.print = console.log;
UI.error = console.log;
