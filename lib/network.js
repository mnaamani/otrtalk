var p2p = require("./p2p");//enet connections established by telehash discovery

module.exports.Link = Link;

var ONLINE = false;

module.exports.init = function( ready ){
    p2p.init({
        mode:2,
        ready: function(){
            ONLINE = true;
            if(ready) ready();
        }
    });
};

module.exports.shutdown = function(){
    p2p.shutdown();
};

function Link(local,remote){
    var arr = [local,"/otr-talk/",remote];
    this.local_end_name = arr.join("");
    this.remote_end_name = arr.reverse().join("");
}

Link.prototype.connect = function(onConnect){
    p2p.setCallbacks({'onConnect':onConnect});
    this._listener = p2p.listen(this.local_end_name);
    this._connector = p2p.connect(this.remote_end_name);
};

Link.prototype.pause = function(){
   this._connector.pause();
   this._listener.pause();
};
