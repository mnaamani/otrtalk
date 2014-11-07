var imapp = require("../imapp.js");
var tool = require("../tool.js");
var program = require('../commander.js');

module.exports = Command;

function Command(ui){
  this.UI = ui;
}

Command.prototype.exec = function(){
  var check = [];
  if(program.pidgin) check.push('pidgin');
  if(program.adium) check.push('adium');
  if(!check.length) check = ['pidgin','adium'];

  check.forEach(function(app){
    var entries = new imapp(app).parseFingerprints().fingerprints();
    if(!entries.length) return;
    var Table = require("cli-table");
    var table = new Table({
        head:['username','accountname','protocol','fingerprint']
    });
    entries.forEach( function(buddy){
        var fp = tool.validateFP(buddy.fingerprint);
        table.push( [buddy.username,buddy.accountname,buddy.protocol,fp] );
    });
    console.log(" ==",app,"authenticated buddies ==");
    console.log(table.toString());
  });
}
