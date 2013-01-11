var elinks = require("./elinks");//enet connections established by telehash discovery

module.exports.Link = Link;

var ONLINE = false;

module.exports.init = function( ready ){
    elinks.init({
        mode:2,
        ready: function(){
            ONLINE = true;
            if(ready) ready();
        }
    });
}
module.exports.shutdown = function(){
    elinks.shutdown();
}
function Link(local,remote){
    var arr = [local,"/otr-talk/",remote];
    this.local_end_name = arr.join("");
    this.remote_end_name = arr.reverse().join("");
}

Link.prototype.connect = function(onConnect){
    elinks.listen(this.local_end_name, function(peer){
        if(onConnect) onConnect(peer);
    });    
    elinks.connect(this.remote_end_name, function(peer){
        if(onConnect) onConnect(peer,true);
    });
}
