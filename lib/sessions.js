var async = require("async");
var events = require("events");
var util = require("util");
var assert = require("assert");

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

function Session(App,otr,peer){
    //App = app options  (Talk object created in otrtalk() --> ../otrtalk.js
    var user = new otr.User(App.files);
    var context = user.ConnContext( App.accountname, App.protocol, App.buddyID );
    var otrsession = new otr.Session(user, context, {policy:otr.POLICY("ALWAYS"), secret:App.secret});
    
    var state = {
        init_at:Date.now(),
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
    	if(peer) peer.send( buffer, 1);//keep otr conversation on channel 1
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
        console.log("[new fingerprint]:",fp);
    });

    otrsession.on("gone_secure", function(){
        //console.log("[connection encrypted]");
        state.trust.Trusted = this.isAuthenticated();
        state.conn = ConnState.SECURE;
        onEncrypted();
    });

    otrsession.on("still_secure", function(){
        //console.log("[connection re-encrypted]");
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
                console.log("[only accepting authenticated fingerprints]");
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
                        console.log("[connection fingerprint match]");
                    }
                }
                if(App.trustedFP){
                    var known = App.trustedFP.match(talk.fingerprint());
                    if(known){
                        console.log("found IM trusted buddy:",known.username);
                    }else{
                        talk.end();break;
                    }
                }
                //lets try to do SMP authentication with provided secret App.secret
                if(App.secret){
                  //starting smp on both sides at the same time problematic.
                  peer.send(new Buffer(JSON.stringify({cmd:"START_SMP"})),0);
                }else talk.end(); //cannot continue.. no secret for SMP in connect mode
          }
          break;
        }
    }

    otrsession.on("remote_disconnected",function(){
        console.log("[remote closed session]");
        talk.end();
    });

    otrsession.on("smp_request",function(question){
       if(state.conn == ConnState.SECURE || state.conn == ConnState.CHAT){
        if(App.mode()=="connect"){
            //auto SMP authentication, ignoring question... and will respond with App.secret
            console.log("[responding to authentication request]");
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

    peer.data = function (buff, chan) {
        if(chan == 0) {
            try{
              var control = JSON.parse(buff.toString());
              switch(control.cmd){
                case "START_OTR":
                    if(state.flags.rcvd_start_otr) break;
                    state.flags.rcvd_start_otr = true;
                    if(state.toss > parseInt(control.toss)){
                        state.initiator = true;
                        console.log("[starting otr]");
                        otrsession.connect();
                    }else{
                        if(state.toss == control.toss){
                            //todo - do coin toss again...
                            talk.end();
                        }else console.log("[waiting for start_otr]");
                    }
                    break;
                case "START_SMP":
                    if(state.flags.rcvd_start_smp) break;
                    state.flags.rcvd_start_smp = true;
                    if(!state.trust.Trusted){
                        state.conn = ConnState.AUTH;
                        console.log("[starting authentication]");
                        if(state.initiator) otrsession.start_smp();
                    }else{
                        //remote is excpecting to do SMP (most likely they dont trust our fingerprint and are in connect mode)
                        //let them know we already trust their fingerprint
                        peer.send(new Buffer(JSON.stringify({cmd:"NOT_EXCPECTING_START_SMP"})),0);
                        talk.end();
                    }
                    break;
                case "GO_CHAT":
                    if(state.flags.rcvd_go_chat) break;
                    state.flags.rcvd_go_chat = true;
                    if(state.flags.sent_go_chat){
                         talk.emit("start_chat");
                    }else if(App.mode()=='connect') console.log("buddy accepted our fingerprint.");

                    break;                
              }
            }catch(E){
                console.log("otrtalk connection setup protocol error.",E);
                talk.end();
            }
        }

        if(chan == 1) {
            otrsession.recv(buff);
        }
    };

    peer.disconnected = function(){
        console.log("[peer disconnected]");
        if(peer.queue) delete peer.queue;
        peer = undefined;
        talk.end();
    };

    this.goEncrypted = function(){
        otrsession.connect();
    }

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
        return(talk.peer.ipp);
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
           peer.close();
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
        if(otrsession.isAuthenticated()){        
            peer.send( new Buffer(JSON.stringify({cmd:"GO_CHAT"})),0);
            state.flags.sent_go_chat = true;
            state.conn = ConnState.TRUSTED;
            if(state.flags.rcvd_go_chat){ talk.emit("start_chat");}
            else{
                if(App.mode()=='connect') console.log("accepting fingerprint, waiting for buddy.");
            }
        }
    };
    //if both ends initiate otr at the same time... protocol hangs.. :(
    peer.send(new Buffer(JSON.stringify({cmd:"START_OTR",toss:state.toss})),0);

    return talk;
}
