var program = require("./commander.js");
var UI = module.exports;

UI.enterPassword = function (next) {
	program.password('enter key-store password: ', '', next);
};

UI.enterNewPassword = function (next) {
	console.log("Your keys are stored in an encrypted key-store, protected with a password.");
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

UI.debug = function () {
	if (program.verbose || process.env["DEBUG"]) {
		console.error.apply(undefined, arguments);
	}
};

UI.print = function () {
	console.log.apply(undefined, arguments);
};

UI.error = function () {
	console.log.apply(undefined, arguments);
};
