var program = require('./commander.js');

module.exports = Command;

function Command() {}

Command.prototype.exec = function (cmdCallback) {
	cmdCallback(undefined, "run-telehash-node");
};
