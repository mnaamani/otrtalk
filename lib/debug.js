var program = require("./commander");

module.exports = debug;

debug("Turning on debug mode.");

function debug(){
  if(program.verbose || process.env["DEBUG"]) {
    console.log.apply(undefined,arguments);
  }
}
