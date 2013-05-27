var telehash = require("get-telehash").v1.telehash;
var iputil = require("get-telehash").iputil;
var enet = require("get-telehash").udplib.enet;


var callbacks = {};
var activePeers = {};
var connectingPeers = {};
var self;
var localAddr;

exports.init = init;
exports.setCallbacks = function(cb){
    callbacks.onConnect = cb.onConnect;
};
exports.connect = doConnector;
exports.listen = doListener;
exports.shutdown = telehash.shutdown;

var MsgType = {
    /* requests */
    CONNECT:100,

    /* responses */
    ACK:201,
    ACK_LOCAL:202,
    ACK_SNAT:204
};

function init(arg) {
    if (self) return self;

    arg.mode = arg.mode || 2;
    if(arg.mode < 2) arg.mode = 2; //minimum required is mode 2
    
    self = telehash.init({
        p2p_instance:true,     //make sure we initialsed telehash module
        mode:arg.mode,
        seeds: arg.seeds,
        port: arg.port,
        ip: arg.ip,
        udplib: "enet"
    });

    if( !self.p2p_instance ){
        console.log("Warning: p2p module needs to be initialise before telehash module!");
        process.exit();
    }
    
    self.server.host.on("connect",function(peer,data,outgoing){
        enet_peer_connected(peer);
    });

    self.server.host.on("ready",function(){
       localAddr = self.server.address();
       localAddr = localAddr.address+":"+localAddr.port;
       telehash.seed(function (err) {
               if (err) {
                   return;
               }
               //inform app we are seeded and ready to connect/listen
               if (arg.ready) arg.ready(); 
       });
    });
    return self;
}

function enet_peer_connected(enet_peer){
    var ip = enet_peer.address().address();
    var port = enet_peer.address().port();    
    var ipp = ip+":"+port;
    if(activePeers[ipp]){
        enet_peer.disconnect();
        return;
    }
    activePeers[ipp] = enet_peer;
    enet_peer.on("disconnect",function(){
        purgePeer(enet_peer);
    });
    callbacks.onConnect(enet_peer);
}

function purgePeer(enet_peer){
    var ip = enet_peer.address().address();
    var port = enet_peer.address().port();    
    var ipp = ip+":"+port;
    if(activePeers[ipp]) delete activePeers[ipp];
    if(connectingPeers[ipp]) delete connectingPeers[ipp];
}

function doConnector() {
    return (function(name,retry){
        var active = true;
        var connector = telehash.connect(name);

        function connect(){
          if(!active) return;
          connector.send({type:MsgType.CONNECT,snat:self.snat, ipp:self.me.ipp, localipp:localAddr}, function(response){
              if( response ){
                 handleResponse(response);
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
                //connector.stop(); - todo  (stop dialing)
            },
            resume:function(){
                if(active) return;
                active = true;
                connect();
            }
        });

    }).apply(this,arguments);
}

function doListener(name) {
    var active=true;
    var listener = telehash.listen(name, function ( request ) {
        if(active) handleConnect(request);
    });
    return ({
        pause:function(){
            active=false;
            //listener.stop(); - todo (stop .tap)
        },
        resume:function(){active=true;}
    });
}

function popf(to){
    var buf = new Buffer(JSON.stringify({}));
    self.server.send(buf, 0, buf.length, iputil.PORT(to), iputil.IP(to));    
}

function handleConnect(request) {
    if(parseInt(request.message.type) !== MsgType.CONNECT) return;
    if(activePeers[request.message.ipp]) return;

        /* we are not behind NAT */
        if(!self.nat){
            request.reply({
                type:MsgType.ACK,
                ipp:self.me.ipp
            });
            return;
        }else{
            /* We are behind the same NAT exchange local addresses */
            if(iputil.IP(request.message.ipp)==self.me.ip && request.message.localipp) {
                request.reply({
                    type:MsgType.ACK_LOCAL,
                    ipp:localAddr,
                    id:0
                });
                return;
            }

            /* one side behind sNAT other behind NAT - FAIL */
            if(request.message.snat){
                request.reply({
                    type:MsgType.ACK_SNAT
                });
                return;
            }

            /* both sides behind non-symmetric NATs */
            if(!self.snat && !request.message.snat){
                popf(request.message.ipp);
                request.reply({
                    type:MsgType.ACK,
                    ipp:self.me.ipp,
                    id:0
                });
                return;
            }
        }
}

function handleResponse(response){
    var message = response.message;
    switch(parseInt(message.type)){
        case MsgType.ACK_SNAT:
            //todo: we will need to proxy our connections through a 3rd party!
            break;
        case MsgType.ACK:
            popf(message.ipp);
            doOutgoingConnection(message.ipp,message.id);
            break;
        case MsgType.ACK_LOCAL:
            doOutgoingConnection(message.ipp,message.id);
            break;
    }
}

function doOutgoingConnection(ipp,id){
    if(activePeers[ipp]) return;
    if(connectingPeers[ipp]) return;
    connectingPeers[ipp] = self.server.host.connect(new enet.Address(ipp), 2, id?id:0,function(err,peer){
            if(err){
                purgePeer(peer);
            }
   }); 
}
