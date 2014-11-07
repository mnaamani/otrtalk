module.exports = Command;


function Command() {
}

Command.prototype.exec = function(){
  require("../version.js").update();
}
