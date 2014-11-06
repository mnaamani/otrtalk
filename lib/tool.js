var _ = require("underscore");

module.exports.validateFP = function(str){
    //acceptable formats
    //(5 segements of 8 chars each with white optional space inbetween)
    //F88D5DFD BDB1C0A3 0D7543FF 2DF6F58C 28AE3F42
    if(!str) return;
    var valid = true;
    var segments = [];
    str.match( /(\s?\w+\s?)/ig ).forEach(function(segment){
        segments.push(segment.toUpperCase().trim());
    });
    if(segments.length == 5 ){
      segments.forEach(function(seg){
        if( !seg.match(/^[A-F0-9]{8}$/) ) valid = false;
      });

      if(valid) return segments.join(" ");
    }else if(segments.length == 1){
       if(!segments[0].match( /^[A-F0-9]{40}$/)) return;
       return segments[0].match(/([A-F0-9]{8})/g).join(" ");
    }else return;
}

var load_otr = (function(){
  var _instance;
  var modules = ['otr3','otr4-em','otr4'];

  return (function (choice){
    if(_instance){
      throw('you can only load one instance of otr module!');
    }
    if(choice && _.contains(modules, choice) == false){
      console.log("invalid otr module:",choice);
      process.exit();
    }
    try{
      var mod = _.contains(modules, choice) ? choice : 'otr4-em';
      console.error("loading module:",mod);
      _instance =  require( mod );
      console.error("using otr version:", _instance.version());
    } catch (e) {
      console.log("unable to load otr module:",choice,e.code);
      process.exit();
      return undefined;
    }
    return _instance;
  })
})();

module.exports.load_otr = load_otr;
