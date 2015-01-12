var udplib = require("get-telehash").udplib;
var enet = udplib.enet;

var connectCallback;
var activePeers = {};
var host;
var broadcastInterval;
var paused = true;

module.exports.Link = Link;

module.exports.init = function(settings, onReady){
    if(host) return;
    var socket = udplib.createSocket("enet",function(){},7777,"0.0.0.0",settings.interface,function(){},true);

    host = socket.host;

    host.on("ready",function(){
        var localAddr = socket.address();
        //filter out local broadcasts from ourself
        enet.init(function(ip,port){
            if(ip===localAddr.address && port === localAddr.port) return 0;
            return 1;
        });
        onReady();
    });

    host.on("connect",function(peer,data,outgoing){
        var ip = peer.address().address();
        var port = peer.address().port();    
        var ipp = ip+":"+port;
        //reject connections if we are paused
        if(paused){
            peer.disconnect();
            return;
        }
        if(activePeers[ipp]){
            peer.disconnect();
            return;
        }
        activePeers[ipp] = peer;
        peer.on("disconnect",function(){
            if(activePeers[ipp]) delete activePeers[ipp];
        });
        connectCallback(peer);
    });

    host.start();
};

module.exports.shutdown = function(){
    host.stop();
    host.destroy();
};

function Link(){
}

Link.prototype.connect = function(onConnect){
    if(connectCallback) return;
    connectCallback = onConnect;
    paused = false;
    broadcastInterval = setInterval(function(){
        host.connect(new enet.Address("255.255.255.255",7777), 4, 0);
    },20000);
};

Link.prototype.pause = function(){
    paused = true;
    if(broadcastInterval) clearInterval(broadcastInterval);
};
