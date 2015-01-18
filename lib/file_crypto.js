var fs = require("fs");
var crypto = require("crypto");
var debug = require("./debug");

module.exports.decryptFile = function (filename, password, context) {
	return decrypt_buffer(fs.readFileSync(filename), password, context);
};

module.exports.decryptBuffer = decrypt_buffer;

function decrypt_buffer(buf, password) {
	if (!password) return buf;

	var c = crypto.createDecipher('aes256', password);
	var output = c.update(buf.toString('binary'), 'binary', 'binary') + c.final('binary');
	return (new Buffer(output, 'binary'));

}

module.exports.encryptBuffer = encrypt_buffer;

//password must be a 'binary' encoded string or a buffer.
function encrypt_buffer(buf, password) {
	if (!password) return buf;

	var c = crypto.createCipher('aes256', password);
	var output = c.update(buf.toString('binary'), 'binary', 'binary') + c.final('binary');
	return (new Buffer(output, 'binary'));

}
