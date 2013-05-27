var udplib = require("get-telehash").udplib;
var enet = udplib.enet;

var connectCallback;
var activePeers = {};
var host;
var broadcastInterval;
var paused = true;

module.exports.Link = Link;

module.exports.init = function( onReady ){
    if(host) return;
    var localAddr;
    var socket = udplib.createSocket("enet",function(){},7777,"0.0.0.0");

    host = socket.host;

    host.on("ready",function(){
        localAddr = socket.address();
        localAddr = localAddr.address+":"+localAddr.port;
        onReady();
    });

    host.on("connect",function(peer,data,outgoing){
        var ip = peer.address().address();
        var port = peer.address().port();    
        var ipp = ip+":"+port;
        //reject connections coming from ourself and if we are paused!
        if((localAddr === ipp) || paused){
            peer.disconnect();
            return;
        }
        if(activePeers[ipp]){
            peer.disconnect();
            return;
        }
        console.log("incoming connection from:",ipp);
        activePeers[ipp] = peer;
        peer.on("disconnect",function(){
            if(activePeers[ipp]) delete activePeers[ipp];
        });
        console.log("connectCallback()!");
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
    host.connect(new enet.Address("255.255.255.255",7777), 4, 0);
    broadcastInterval = setInterval(function(){
        console.log("broadcasting...");
        host.connect(new enet.Address("255.255.255.255",7777), 4, 0);
    },5000);
};

Link.prototype.pause = function(){
    paused = true;
    if(broadcastInterval) clearInterval(broadcastInterval);
};
