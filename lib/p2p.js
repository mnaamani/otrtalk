var telehash = require("get-telehash").v1.telehash;
var iputil = require("get-telehash").iputil;
var enet = require("get-telehash").udplib.enet;

exports.init = init;
exports.connect = doConnector;
exports.listen = doListener;
exports.shutdown = telehash.shutdown;

//during peer discovery stores info on who is responding to our telehash connect messages or
// sending us a telehash connect message.
var peers = {};
var active_peers = {};//enet connected peers

var self;

function init(arg) {
    if (self) return self;
    
    if(arg.mode !=2 || arg.mode !=3) arg.mode = 2; //minimum required is mode 2
    
    self = telehash.init({
        elinks_instance:true,     //make sure we initialsed telehash module
        mode:arg.mode,
        seeds: arg.seeds,
        port: arg.port,
        ip: arg.ip,
        udplib: "enet"
    });

    if( !self.elinks_instance ){
        console.log("Warning: elinks module needs to be initialise before telehash module!");
        process.exit();
    }
    
    self.server.host.on("connect",enet_on_connect);
    self.server.host.on("disconnect",enet_on_disconnect);
    self.server.host.on("message",enet_on_message);

    self.server.host.on("ready",function(){
       telehash.seed(function (err) {
               if (err) {
                   //console.log(err);
                   return;
               }
               //inform app we are seeded and ready to connect/listen
               if (arg.ready) arg.ready(); 
       });
    });
    return self;
}

function activatePeer(ipp, enet_peer,cb) {    
    if(active_peers[ipp]) return active_peers[ipp];

    active_peers[ipp] = {        
        close: function(){
            if(enet_peer) enet_peer.disconnectLater();
        },
        destroy:function(){
            //enet_peer.delete();//double check if this is needed..(does disconnect() also delete the peer?)
        },
        ipp: ipp,
        send:function(buffer,channel){
            try{
               if(enet_peer) enet_peer.send(channel||0, new enet.Packet(buffer,enet.Packet.FLAG_RELIABLE) );
            }catch(e){
                console.error("Send Error:",e);
            }
        },
        data:function(buffer,channel){},
        disconnected:function(){}
    }
    cb( active_peers[ipp] );
}

function enet_on_connect(enet_peer,data){
    var ip = enet_peer.address().address();
    var port = enet_peer.address().port();    
    var ipp = ip+":"+port;
    
    var _ipp = ipp;
    var peer = peers[ipp];
    if(!peer && !active_peers[ipp]){
        for(i in peers){
            if(peers[i].snat && peers[i].ip == ip && peers[i].id==data){
                peer = peers[i];
                _ipp = i;
                break;
            }    
        }
    }
    if(peer){
        if(peer.id && peer.id !=data){
            console.error("NOT EXCPECTING THIS CONNECTION");
            enet_peer.disconnect();
            return;
        }
        activatePeer(ipp, enet_peer,peer.cb);
        delete peers[_ipp];
    }
}

function enet_on_disconnect(enet_peer,data){
    console.error("ENET_ON_DISCONNECT");//this also happens on connect timeout...
    var ip = enet_peer.address().address();
    var port = enet_peer.address().port();    
    var ipp = ip+":"+port;
    if(active_peers[ipp] && active_peers[ipp].disconnected) active_peers[ipp].disconnected();
    if(active_peers[ipp]) delete active_peers[ipp];
    if(self.server.host.peers[ipp]) delete self.server.host.peers[ipp];
}

function enet_on_message(enet_peer,packet,channel,data){
    var ip = enet_peer.address().address();
    var port = enet_peer.address().port();    
    var ipp = ip+":"+port;
    var peer = active_peers[ipp];
    if(peer && peer.data){
        peer.data(packet.data(),channel);
    }
}

//using the telehash.connect() function find switches on the network listening for 'name'
//and send them a connection request. the connection setup is handeled by handleResponse which will
//callback onConnect with a new peer handler object
function doConnector(name, onConnect, retry) {
    var connector = telehash.connect(name);
    var localipp = self.server.address();
    localipp = localipp.address+":"+localipp.port;
    
    setTimeout(function(){
    connector.send({x:'CONNECT',snat:self.snat,ipp:self.me.ipp, localipp:localipp}, function(response){
        if( response ){
           handleResponse(response,onConnect);
        }else{        
           //connect timeout..loop again.           
           setTimeout( function(){
                doConnector(name,onConnect); 
           }, retry? retry*1000:5000 ); //try again after 'retry' seconds, or 5 seconds default
        }    
    },8);//8 second timeout for responses
    },5000);//5 second delay before we start using connector to allow time for underlying dialer and tapping to occur
}

//using the telehash.listen() function accept connections from switches on the network looking for 'name'
//The connection setup is handled by handleConnect which will callback onConnect 
function doListener(name, onConnect) {
    telehash.listen(name, function ( request ) {
        handleConnect(request, onConnect);
    });
}

function popf(to){
    var buf = new Buffer(JSON.stringify({}));
    self.server.send(buf, 0, buf.length, iputil.PORT(to), iputil.IP(to));    
}

function handleConnect(request, callback) {
    if(request.message.x != "CONNECT") return;
    if(active_peers[request.message.ipp] || active_peers[request.message.localipp]) return;
    console.error("Got A CONNECT request from: " + request.from + " via:" + request.source);

    var randID = Math.round(Math.random()*65534);    
    
    if(request.message.snat || iputil.IP(request.message.ipp)==self.me.ip ){        
        if(!self.nat){                        
            if(request.message.snat){
                if (!peers[request.message.ipp]) {
                    peers[request.message.ipp] = {
                        cb:callback,
                        id:randID,
                        snat:true,
                        ip:iputil.IP(request.message.ipp)
                    };
                }
            }else{
                if (!peers[request.message.ipp]) {
                    peers[request.message.ipp] = {
                        cb:callback,
                        id:randID
                    };
                }
            }
            
            request.reply({status:'OK', ipp:self.me.ipp, id:peers[request.message.ipp].id});
            
            return;
        }
    }else{
        if(!self.snat){
            popf(request.message.ipp);//pop our firewall
            if (!peers[request.message.ipp]) {
                peers[request.message.ipp] = {
                    cb:callback,
                    id:randID
                };                
            }
            request.reply({status:'OK', ipp:self.me.ipp, id:peers[request.message.ipp].id}); 
            return;
        }else{
            //reverse..we will do an enet host.connect
            if(peers[request.message.ipp]){
               request.reply({status:'REVERSE', ipp:self.me.ipp, id:peers[request.message.ipp].reverse_id});
            }else{
               request.reply({status:'REVERSE', ipp:self.me.ipp, id:randID});
            }
            //console.error("Reversing Direction");
            //short delay..
            setTimeout(function(){
                if (!peers[request.message.ipp]) {
                    peers[request.message.ipp] = {
                        cb:callback,
                        reverse_id:randID
                    };
                    if(!self.server.host.peers[request.message.ipp]){
                        self.server.host.peers[request.message.ipp] = self.server.host.connect(new enet.Address(request.message.ipp), 2, parseInt(peers[request.message.ipp].reverse_id)); 
                    }
                }                
            },1000);
            return;
        }
    }
    
    if( iputil.IP(request.message.ipp)==self.me.ip && request.message.localipp) {
        var addr = self.server.address();
        addr = addr.address+":"+addr.port;        
        if (!peers[request.message.localipp]) {
                peers[request.message.localipp] = {
                    cb:callback,
                    id:randID
                };                               
        }
        console.error("Sending our LOCAL IP",addr);
        request.reply({status:"LOCAL", ipp:addr, id:peers[request.message.localipp].id});
    }else{
        request.reply({status:"FAILED"});
    }
}

function handleResponse(response, callback) {
    var message = response.message;

    if( message.status == "FAILED"){
        //todo: we will need to proxy our connections through a 3rd party!
        return;
    }
    if( message.status == "LOCAL"){        
        //we are behind same NAT.. nice if we are on the same LAN but
        //if we are both behind a 3G/mobile network chances are low that we are going to see each other
        if (!peers[message.ipp]) {            
            peers[message.ipp] = {
                cb:callback
            };
            
            //check if we are aready connecting...to same peer?
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
        //console.error("Reversing Direction");
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
