var telehash = require("get-telehash").v1.telehash;
var iputil = require("get-telehash").iputil;
var enet = require("get-telehash").udplib.enet;

exports.init = init;
exports.connect = doConnector;
exports.listen = doListener;
exports.shutdown = telehash.shutdown;

var MsgType = {
    /* requests */
    CONNECT:100,
    REVERSE_READY:101,

    /* responses */
    ACK:201,
    ACK_LOCAL:202,
    ACK_REVERSE:203,
    ACK_SNAT:204
};

//during peer discovery stores info on who is responding to our telehash connect messages or
//sending us a telehash connect message.
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
function doConnector() {
    return (function(name,onConnect,retry){
        var active = true;
        var connector = telehash.connect(name);
        var localipp = self.server.address();
        localipp = localipp.address+":"+localipp.port;

        function connect(){
          if(!active) return;
          connector.send({type:MsgType.CONNECT,snat:self.snat, x:"CONNECT", ipp:self.me.ipp, localipp:localipp}, function(response){
              if( response ){
                 handleResponse(response,connector,onConnect);
              }else{        
                 //timeout..loop again
                 setTimeout( connect, retry? retry*1000:5000 ); //try again after 'retry' seconds, or 5 seconds default
              }    
          },8);//8 second timeout for responses
        }

        //5 second delay before we start using connector to allow time for underlying dialer and tapping to occur
        setTimeout(connect,5000);

        return({
            pause:function(){
                active=false;
                //connector.stop(); - todo
            },
            resume:function(){
                if(active) return;
                active = true;
                connect();
            }
        });

    }).apply(this,arguments);
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
  if(request.message.x == "CONNECT") request.message.type = MsgType.CONNECT;//backward compatibility

  switch( parseInt(request.message.type)){
    case MsgType.CONNECT:
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
            
            request.reply({
                type:MsgType.ACK,
                status:'OK',//backward compat.
                ipp:self.me.ipp,
                id:peers[request.message.ipp].id
            });
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
            request.reply({
                type:MsgType.ACK,
                status:'OK',//backward compat.
                ipp:self.me.ipp,
                id:peers[request.message.ipp].id
            });
            return;
          }else{
            //reverse..we will do an enet host.connect
            if(peers[request.message.ipp]){
               request.reply({
                   type:MsgType.ACK_REVERSE,
                   status:'REVERSE',
                   ipp:self.me.ipp,
                   id:peers[request.message.ipp].reverse_id
               });
            }else{
                peers[request.message.ipp]={
                  cb:callback,
                  reverse_id:randID
                };
               request.reply({
                   type:MsgType.ACK_REVERSE,
                   status:'REVERSE',
                   ipp:self.me.ipp,
                   id:randID
               });
            }
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
        request.reply({
            type:MsgType.ACK_LOCAL,
            status:"LOCAL",
            ipp:addr,
            id:peers[request.message.localipp].id
        });
      }else{
        request.reply({
            type:MsgType.ACK_SNAT,
            status:"FAILED"
        });
      }
      break;

    case MsgType.REVERSE_READY:
       if(peers[request.message.ipp] && peers[request.message.ipp].reverse_id == request.message.id){
           if(!self.server.host.peers[request.message.ipp]){
               self.server.host.peers[request.message.ipp] = self.server.host.connect(new enet.Address(request.message.ipp), 2, parseInt(peers[request.message.ipp].reverse_id)); 
           }
       }
       break;
    default:

    }
}
function handleResponse(response, connector, callback) {
    var message = response.message;

    if( message.status == "FAILED" || parseInt(message.type) == MsgType.ACK_SNAT){
        //todo: we will need to proxy our connections through a 3rd party!
        return;
    }
    if( message.status == "LOCAL" || parseInt(message.type) == MsgType.ACK_LOCAL){        
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
    
    if( message.status == "REVERSE" || parseInt(message.type) == MsgType.ACK_REVERSE){
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
        connector.send({type:MsgType.REVERSE_READY,ipp:self.me.ipp,id:message.id});
        return;    
    }
    
    if (message.status == "OK" || parseInt(message.type) == MsgType.ACK){
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
