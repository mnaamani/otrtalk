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
