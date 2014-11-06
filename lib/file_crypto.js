var fs = require("fs");
var crypto = require("crypto");
var program = require("./commander.js");

module.exports.decryptFile = function(filename,password,context){
  return decrypt_buffer(fs.readFileSync(filename), password,context);
}

module.exports.decryptBuffer = decrypt_buffer;

function decrypt_buffer(buf,password,context){
  if(!password) return buf;
  context = context || "";
  try{
      var c = crypto.createDecipher('aes256', password);
      var output = c.update(buf.toString('binary'),'binary','binary')+c.final('binary');
      return (new Buffer(output,'binary'));
  }catch(e){
      console.log("decryption failed:",context);
      if(program.verbose) console.log(e.message);
      process.exit();
  }
}

module.exports.encryptBuffer = encrypt_buffer;

//password must be a 'binary' encoded string or a buffer.
function encrypt_buffer(buf,password,context){
    if(!password) return buf;
    context = context || "";
    try{
        var c = crypto.createCipher('aes256', password);
        var output = c.update(buf.toString('binary'),'binary','binary')+c.final('binary');
        return (new Buffer(output,'binary'));
    }catch(e){
        console.log("encryption failed:",context);
        if(program.verbose) console.log(e.message);
        process.exit();
    }
}
