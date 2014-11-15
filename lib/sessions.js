var async = require("async");
var events = require("events");
var util = require("util");
var assert = require("assert");
var verbose = false;
module.exports.TalkSession = Session;

util.inherits(Session, events.EventEmitter);

var ConnState = {
    INIT:0,
    SECURE:2,
    AUTH:4,
    TRUSTED:6,
    CHAT:8,
    ENDED:10
};

function debug(){
    if(verbose) console.log.apply(null,arguments);
}

function Session(App,otr,peer){
    var user = App.user;
    var context = user.ConnContext( App.accountname, App.protocol, App.buddyID );
    var otrsession = new otr.Session(user, context, {policy:otr.POLICY("ALWAYS"), secret:App.secret});
    verbose = App.verbose;

    var state = {
        initAT:Date.now(),
        initiator:false,
        //state of buddy's fingerprint in this session
        trust:{
         NewFingerprint:false, //fingerprint not previously on file
         Authenticated:false,  //successfully smp authenticated at least once in this session.
         Trusted:false       //when connection goes encrypted, will be set to true if previously SMP authenticated
        },
        conn: ConnState.INIT,
        flags: {
            rcvd_go_chat:false,
            sent_go_chat:false,
            rcvd_start_otr:false,
            rcvd_start_smp:false
        },
        toss:parseInt(Math.random()*1000000)//coin toss to decide who will be initiator
    };

    events.EventEmitter.call(this);

    var talk = this;

    talk.otrsession = otrsession;
    talk.user = user;
    talk.peer = peer;
    talk.context = context;

    peer.queue = async.queue(inject_worker,1);

    function inject_worker(buffer,callback){
    	if(peer) peer.send(1, buffer);//keep otr conversation on channel 1
    	callback();
    }

    otrsession.on("inject_message",function(msg){
    	if(peer && peer.queue){
            peer.queue.push(new Buffer(msg));
        }
    });

    otrsession.on("message",function(msg,encrypted){
        //reject plaintext and insecure messages
        if(!encrypted) return;
        if(!this.isAuthenticated()) return;
        if(state.conn==ConnState.CHAT) talk.emit('message',msg);
    });

    //new_fingerprint event raised before gone_secure
    otrsession.on("new_fingerprint",function(fp){
        state.trust.NewFingerprint = true;
        debug("[new fingerprint]:",fp);
    });

    otrsession.on("gone_secure", function(){
        //debug("[connection encrypted]");
        state.trust.Trusted = this.isAuthenticated();
        state.conn = ConnState.SECURE;
        onEncrypted();
    });

    otrsession.on("still_secure", function(){
        //debug("[connection re-encrypted]");
        onEncrypted();
    });

    function onEncrypted(){
        switch(App.mode()){
          case 'chat':
            if(state.trust.Trusted){
                state.conn = ConnState.TRUSTED;
                talk.emit("auth", state.trust);
                return;
            }else{
                debug("[only accepting authenticated fingerprints]");
                state.conn = ConnState.ENDED;
                return talk.end();//note: causing seg-fault in otr3 ??
            }
            break;

          case 'connect':
            if(state.trust.Trusted){
                //we already trust the fingerprint but we chose connect mode no need to do smp
                state.conn = ConnState.TRUSTED;
                talk.emit("auth",state.trust);
            }else{
                if(App.buddyFP){
                    //user specified fingerprint of buddy, if this connection doesn't match
                    //reject it and dont waste time with SMP
                    if(talk.fingerprint() != App.buddyFP) {
                        talk.end();break;
                    }else{
                        debug("[connection fingerprint match]");
                    }
                }
                if(App.trustedFP){
                    var known = App.trustedFP.match(talk.fingerprint());
                    if(known){
                        debug("found IM trusted buddy:",known.username);
                    }else{
                        talk.end();break;
                    }
                }
                //lets try to do SMP authentication with provided secret App.secret
                if(App.secret){
                  //starting smp on both sides at the same time problematic.
                  peer.send(0,new Buffer(JSON.stringify({cmd:"START_SMP"})));
                }else talk.end(); //cannot continue.. no secret for SMP in connect mode
          }
          break;
        }
    }

    otrsession.on("remote_disconnected",function(){
        debug("[remote closed session]");
        talk.end();
    });

    otrsession.on("smp_request",function(question){
       if(state.conn == ConnState.SECURE || state.conn == ConnState.CHAT){
        if(App.mode()=="connect"){
            //auto SMP authentication, ignoring question... and will respond with App.secret
            debug("[responding to authentication request]");
            this.respond_smp();
        }else{
           //in chat mode we can do interactive SMP.
           talk.emit("smp",question);
        }
       }
    });

    otrsession.on("smp_complete",function(){
       console.log("[authentication success]");
       state.trust.Authenticated = true;
       if(App.mode()=='connect'){
        talk.emit("auth",state.trust);
        state.conn = ConnState.TRUSTED;
       }else{
        if(state.conn == ConnState.CHAT) talk.emit("auth-success");//event will be consumed by chat ui
       }
    });

    otrsession.on("smp_failed",function(){
        console.log("[authentication failed]");
        if(App.mode()=='connect'){
            //auto SMP in connect mode, only get one chance.. per session!
             talk.end();
        }else talk.emit("auth-failed");//for the chat ui
    });

    otrsession.on("smp_aborted",function(){
        console.log("[authentication aborted]");
        if(App.mode()=='connect'){
            //auto SMP in connect mode, only get one chance.. per session!
            talk.end();
        }else talk.emit("auth-failed");//for the chat ui
    });

    peer.on("message",function (packet, chan) {
        var buff = packet.data();
        //todo:30 sec timeout - if not state.conn == ConnState.TUSTED
        if(chan == 0) {
            //todo:dont process messages on channel 0 after Date.now() > state.initAT + 10000
            try{
              var control = JSON.parse(buff.toString());
              switch(control.cmd){
                case "START_OTR":
                    if(state.conn !== ConnState.INIT) break;
                    if(state.flags.rcvd_start_otr) break;
                    state.flags.rcvd_start_otr = true;
                    if(state.toss > parseInt(control.toss)){
                        state.initiator = true;
                        debug("[initiating otr]");
                        otrsession.connect();
                    }else{
                        if(state.toss == control.toss){
                            //todo - do coin toss again...
                            talk.end();
                        }else debug("[waiting for otr init]");
                    }
                    break;
                case "START_SMP":
                    if(App.mode() === 'chat'){
                        //remote is excpecting to do SMP (most likely they dont trust our fingerprint and are in connect mode)
                        //let them know we already trust their fingerprint. (They will have already been sent the GO_CHAT msg)
                        //todo: add option to do re-authenticate
                        if(state.trust.Trusted) console.log("remote buddy requestig re-authentication");
                        peer.send(0,new Buffer(JSON.stringify({cmd:"ABORTING",reason:'NOT_EXCPECTING_SMP'})));
                        talk.end();
                        break;
                    }else{
                        if(state.flags.rcvd_start_smp) break;
                        state.flags.rcvd_start_smp = true;
                        if(!state.trust.Trusted){
                            state.conn = ConnState.AUTH;
                            debug("[starting authentication]");
                            if(state.initiator) otrsession.start_smp();
                        }
                    }
                    break;
                case "ABORTING":
                    debug("[remote is aborting connection] reason:",control.reason);
                    talk.end();
                    break;
                case "GO_CHAT":
                    //remote is ready to enter secure chat..
                    if(state.flags.rcvd_go_chat) break;
                    state.flags.rcvd_go_chat = true;
                    if(state.flags.sent_go_chat){
                         talk.emit("start_chat");
                    }else{
                        //if(App.mode()=='connect') console.log("\n<remote party trusts our fingerprint>");
                    }
                    break;
              }
            }catch(E){
                debug("otrtalk connection setup protocol error.",E);
                talk.end();
            }
        }

        if(chan == 1) {
            otrsession.recv(buff);
        }
    });

    peer.on("disconnect",function(){
        debug("[peer disconnected]");
        if(peer.queue) delete peer.queue;
        peer = undefined;
        talk.end();
    });

    this.goEncrypted = function(){
        otrsession.connect();
    }
    this.abort_smp =function(){
        otrsession.abort_smp();
    };
    this.respond_smp =function(secret){
        otrsession.respond_smp(secret);
    }

    this.smp = function(secret){
        otrsession.start_smp(secret);
    }
    this.smpq =function(Q,secret){
        otrsession.start_smp_question(Q,secret);
    };

    this.secure = function(){
        return (otrsession.isEncrypted()&&otrsession.isAuthenticated());
    };

    this.encrypted = function(){
        return otrsession.isEncrypted();
    }

    this.authenticated = function(){
        return otrsession.isAuthenticated();
    };

    this.send = function(msg){
        if(state.conn != ConnState.CHAT) return;
        if(otrsession.isAuthenticated() && otrsession.isEncrypted()) otrsession.send(msg);
    };

    this.fingerprint = function(){
        if(typeof context.fingerprint == 'function'){
            return context.fingerprint();//otr3-em, otr4-em
        }
        return context.fingerprint;//otr3
    };

    this.remote = function(){
        return(talk.peer.address().address()+":"+talk.peer.address().port());
    };

    this.writeAuthenticatedFingerprints = function(){
        user.writeTrustedFingerprints();
        App.files.save();
    };

    this.end = function (){
       if(talk.ending) return;
       talk.ending = true;
       state.conn = ConnState.ENDED;
       if(peer) otrsession.close();
       setTimeout(function(){
         user.state.free();
         if(peer){
           peer.disconnectLater();
           if(peer.queue) delete peer.queue;
           delete peer;
         }
         talk.emit("closed");
       },150);
    }

    //a chat UI attached to this session
    this.attached = function(){
        if(state.conn != ConnState.TRUSTED) return;
        state.conn = ConnState.CHAT;
    };
    this.go_chat = function(){
        if(state.conn == ConnState.ENDED) return;
        //we are ready to enter secure chat
        if(otrsession.isAuthenticated()){
            peer.send(0, new Buffer(JSON.stringify({cmd:"GO_CHAT"})));
            state.flags.sent_go_chat = true;
            state.conn = ConnState.TRUSTED;
            if(state.flags.rcvd_go_chat) talk.emit("start_chat");
        }else talk.end();
    };
    this.start = function(){
        //if both ends initiate otr at the same time... protocol hangs.. :(
        peer.send(0,new Buffer(JSON.stringify({cmd:"START_OTR",toss:state.toss})));
    }

    return talk;
}
