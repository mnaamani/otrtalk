var program = require("./commander.js");

var UI = {};

UI.enterPassword = function(next){
  program.password('enter key-store password: ', '', next);
};

UI.enterNewPassword = function(next){
  console.log("Your keys are stored in an encrypted key-store, protected with a password.");
  console.log("** Pick a long password to protect your keys in case the key-store is stolen **");
  program.password('new key-store password: ', '', function(password){
    program.password('      confirm password: ', '', function(password_confirm){
        if(password !== password_confirm){
            console.log("password mismatch!");
            next();
        }else{
            next(password);
        }
    });
  });
};

module.exports = UI;
