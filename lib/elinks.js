var telehash = require("get-telehash").v1.telehash;
var iputil = require("get-telehash").iputil;
var enet = require("get-telehash").udplib.enet;

exports.init = init;
exports.connect = doConnector;
exports.listen = doListener;
exports.shutdown = telehash.shutdown;

var peers = {};
var channels = {};

var self;

function init(arg) {
    if (self) return self;
    
    if(arg.mode !=2 || arg.mode !=3) arg.mode = 2; //minimum required is mode 2 for channels to work.
    
    self = telehash.init({
        channels_init:true,     //to check if we initialsed telehash module first
        mode:arg.mode,
        seeds: arg.seeds,
        port: arg.port,
        ip: arg.ip,
        udplib: "enet"
    });

    if( !self.channels_init ){
        console.log("Warning: elinks module needs to be initialise before telehash module!");
        process.exit();
    }
    
    self.server.host.on("connect",enet_on_connect);
    self.server.host.on("disconnect",enet_on_disconnect);
    self.server.host.on("message",enet_on_message);    
    self.server.host.on("ready",function(){
       //console.log("ENET HOST READY");
       //console.log("listening on ",self.server.host.address().address(),self.server.host.address().port());
       //we can get the udp port number we are binding to.
       telehash.seed(function (err) {
               if (err) {
                   //console.log(err);
                   return;
               }
               //inform app we are seeded so they can start to connect/listen
               if (arg.ready) arg.ready(); 
       });
    });
    return self;
}

function activateChannel(ipp, enet_peer,cb) {    
    //return an object to use to communicate with the connected peer
    if(channels[ipp]) return channels[ipp];
    console.error("Activating Channel");
    
    channels[ipp] = {        
        close: function(){
            if(enet_peer) enet_peer.disconnectLater();
        },
        destroy:function(){
            //enet_peer.delete();//double check if this is needed..(does disconnect() also delete the peer?)
        },
        ipp: ipp,
        send:function(buffer,subchannel){
            try{
               if(enet_peer) enet_peer.send(subchannel||0, new enet.Packet(buffer,enet.Packet.FLAG_RELIABLE) );
            }catch(e){
                console.error("Send Error:",e);
            }
        },
        data:function(buffer,subchannel){},
        disconnected:function(){}
    }
    console.error("Calling Back Channel Handler...");
    cb( channels[ipp] );
}

function enet_on_connect(enet_peer,data){
    console.error("ENET_ON_CONNECT");
    var ip = enet_peer.address().address();
    var port = enet_peer.address().port();    
    var ipp = ip+":"+port;
    
    var _ipp = ipp;
    var channel = peers[ipp];
    if(!channel && !channels[ipp]){
        for(i in peers){
            if(peers[i].snat && peers[i].ip == ip && peers[i].id==data){
                channel = peers[i];
                _ipp = i;
                break;
            }    
        }
    }
    if(channel){
        if(channel.id && channel.id !=data){
            console.error("NOT EXCPECTING THIS CONNECTION");
            enet_peer.disconnect();
            return;
        }
        activateChannel(ipp, enet_peer,channel.cb);
        delete peers[_ipp];
    }
}

function enet_on_disconnect(enet_peer,data){
    console.error("ENET_ON_DISCONNECT");//this also happens on connect timeout...
    var ip = enet_peer.address().address();
    var port = enet_peer.address().port();    
    var ipp = ip+":"+port;
    if(channels[ipp] && channels[ipp].disconnected) channels[ipp].disconnected();
    if(channels[ipp]) delete channels[ipp];
    if(self.server.host.peers[ipp]) delete self.server.host.peers[ipp];
}

function enet_on_message(enet_peer,packet,chan,data){
    //console.error("ENET_ON_MESSAGE");
    var ip = enet_peer.address().address();
    var port = enet_peer.address().port();    
    var ipp = ip+":"+port;
    var channel = channels[ipp];
    if(channel && channel.data){
        channel.data(packet.data(),chan);
    }
}

//using the telehash.connect() function find switches on the network listening for 'name'
//and send them a connection request. the connection setup is handeled by handleResponse which will
//callback onConnect with a new peer handler object
function doConnector(name, onConnect, retry) {
    //console.log("ECHANNELS: Connecting To: ", name);
    var connector = telehash.connect(name);
    var localipp = self.server.address();
    localipp = localipp.address+":"+localipp.port;
    
    setTimeout(function(){
    connector.send({x:'CONNECT',snat:self.snat,ipp:self.me.ipp, localipp:localipp}, function(obj){
        if( obj ){
           handleResponse(obj.message,onConnect);
        }else{        
           //connect timeout..loop again.           
           setTimeout( function(){
                doConnector(name,onConnect);           
           }, retry? retry*1000:20000 ); //try again after 'retry' seconds, or 20 seconds default
        }    
    },5);//5 second timeout for responses
    },5000);//5 second delay before we start using connector to allow time for underlying dialer and tapping to occur
}

//using the telehash.listen() function accept connections from switches on the network looking for 'name'
//establishing a line to them. The connectio setup is handled by handleConnect which will callback onConnect 
//with a new peer handler object
function doListener(name, onConnect) {
    //console.log("ECHANNELS: Listening For:", name);
    telehash.listen(name, function ( conn ) {
        handleConnect(conn, onConnect);
    });
}

function popf(to){
    var buf = new Buffer(JSON.stringify({}));
    self.server.send(buf, 0, buf.length, iputil.PORT(to), iputil.IP(to));    
}

function handleConnect(conn, callback) {

    if( conn.message.x != "CONNECT") return;
    if(channels[conn.message.ipp] || channels[conn.message.localipp]) return;
    console.error("Got A CONNECT request from: " + conn.from + " via:" + conn.source);

    var randID = Math.round(Math.random()*65534);    
    
    if(conn.message.snat || iputil.IP(conn.message.ipp)==self.me.ip ){        
        if(!self.nat){                        
            if(conn.message.snat){
                if (!peers[conn.message.ipp]) {
                    peers[conn.message.ipp] = {
                        cb:callback,
                        id:randID,
                        snat:true,
                        ip:iputil.IP(conn.message.ipp)
                    };
                }
            }else{
                if (!peers[conn.message.ipp]) {
                    peers[conn.message.ipp] = {
                        cb:callback,
                        id:randID
                    };
                }
            }
            
            conn.reply({status:'OK', ipp:self.me.ipp, id:peers[conn.message.ipp].id});
            
            return;
        }
    }else{
        if(!self.snat){
            popf(conn.message.ipp);//pop our firewall
            if (!peers[conn.message.ipp]) {
                peers[conn.message.ipp] = {
                    cb:callback,
                    id:randID
                };                
            }
            conn.reply({status:'OK', ipp:self.me.ipp, id:peers[conn.message.ipp].id}); 
            return;
        }else{
            //reverse..we will do a enethost.connect
            if(peers[conn.message.ipp]){
               conn.reply({status:'REVERSE', ipp:self.me.ipp, id:peers[conn.message.ipp].reverse_id});
            }else{
               conn.reply({status:'REVERSE', ipp:self.me.ipp, id:randID});
            }
            console.error("CHANNELS: Reversing Direction");
            //short delay..
            setTimeout(function(){
                if (!peers[conn.message.ipp]) {
                    peers[conn.message.ipp] = {
                        cb:callback,
                        reverse_id:randID
                    };
                    if(!self.server.host.peers[conn.message.ipp]){
                        self.server.host.peers[conn.message.ipp] = self.server.host.connect(new enet.Address(conn.message.ipp), 2, parseInt(peers[conn.message.ipp].reverse_id)); 
                    }
                }                
            },1000);
            
            return;
        }
    }
    
    if( iputil.IP(conn.message.ipp)==self.me.ip && conn.message.localipp) {         
        var addr = self.server.address();
        addr = addr.address+":"+addr.port;        
        if (!peers[conn.message.localipp]) {
                peers[conn.message.localipp] = {
                    cb:callback,
                    id:randID
                };                               
        }
        console.error("Sending our LOCAL IP",addr);
        conn.reply({status:"LOCAL", ipp:addr, id:peers[conn.message.localipp].id}); 
    }else{
        conn.reply({status:"FAILED"});
    }
}

function handleResponse(message, callback) {         
    if( message.status == "FAILED"){
        //todo: we will need to proxy our connections through a 3rd party!
        return;
    }
    if( message.status == "LOCAL"){        
        //todo we are behind same NAT.. exchange local ip addresses - nice if we are on the same LAN
        //if we are both behind a 3G/mobile network chances are low that we are going to see each other        
        if (!peers[message.ipp]) {            
            peers[message.ipp] = {
                cb:callback
            };
            
            //self.server.host.getPeers check if we are aready connecting...to same peer?
            if(!self.server.host.peers[message.ipp]){
                console.error("Connecting to LOCAL PEER:",message.ipp);
                self.server.host.peers[message.ipp] = self.server.host.connect(new enet.Address(message.ipp), 2, parseInt(message.id)); 
            }
        }
        return;
    }
    
    if( message.status == "REVERSE"){
        //this will work from first time as long as other end is not behind a load balancer (multiple ip addresses)
        //otherwise multiple connect retries will be required..
                
        if (!peers[message.ipp]) {
            peers[message.ipp] = {
                cb:callback ,
                id:message.id,
                snat:true,
                ip:iputil.IP(message.ipp)
            };
        }
        console.error("CHANNELS: Reversing Direction");
        return;    
    }
    
    if (message.status == "OK" ){
        popf(message.ipp);//pop the firewall
        if (!peers[message.ipp]) {            
            peers[message.ipp] = {
                cb:callback                
            };
            
            if(!self.server.host.peers[message.ipp]){
                console.error("Connecting to Remote Peer:",message.ipp);
                self.server.host.peers[message.ipp] = self.server.host.connect(new enet.Address(message.ipp), 2, parseInt(message.id)); 
            } 
        }
    }
}
