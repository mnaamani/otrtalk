var async = require("async");
var events = require("events");
var util = require("util");
var assert = require("assert");

module.exports.TalkSession = Session;

util.inherits(Session, events.EventEmitter);

var SessionState = {
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
    var initiator = false;

    //state of buddy's fingerprint in this session 
    var trust = {
        NewFingerprint:false, //fingerprint not previously on file
        Authenticated:false,  //successfully smp authenticated at least once in this session.
        Trusted:false       //when connection goes encrypted, will be set to true if previously SMP authenticated
    };

    var state = SessionState.INIT;

    var rcvd_go_chat = false;
    var sent_go_chat = false;
    var rcvd_start_otr = false;
    var rcvd_start_smp = false;

    var stats = {
        started_at:Date.now(),
        toss:Math.random(1000000)
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
    	if(peer){
            peer.queue.push(new Buffer(msg));
        }
    });

    otrsession.on("message",function(msg,encrypted){
        //reject plaintext and insecure messages
        if(!encrypted) return;
        if(!this.isAuthenticated()) return;
        if(state==SessionState.CHAT) talk.emit('message',msg);
    });

    //new_fingerprint event raised before gone_secure
    otrsession.on("new_fingerprint",function(fp){
        trust.NewFingerprint = true;
        console.log("[new fingerprint]:",fp);
    });

    otrsession.on("gone_secure", function(){
        //console.log("[connection encrypted]");
        trust.Trusted = this.isAuthenticated();
        state = SessionState.SECURE;
        onEncrypted();
    });

    otrsession.on("still_secure", function(){
        //console.log("[connection re-encrypted]");
        onEncrypted();
    });

    function onEncrypted(){
        switch(App.mode()){
          case 'chat':
            if(trust.Trusted){
                state = SessionState.TRUSTED;
                talk.emit("auth", trust);
                return;
            }else{
                console.log("[only accepting authenticated fingerprints]");
                state = SessionState.ENDED;
                return talk.end();//note: causing seg-fault in otr3 ??
            }
            break;
        
          case 'connect':
            if(trust.Trusted){
                //we already trust the fingerprint but we chose connect mode no need to do smp
                state = SessionState.TRUSTED;
                talk.emit("auth",trust);
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
       if(state == SessionState.SECURE || state == SessionState.CHAT){
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
       trust.Authenticated = true;
       if(App.mode()=='connect'){
        talk.emit("auth",trust);
        state = SessionState.TRUSTED;
       }else{
        if(state == SessionState.CHAT) talk.emit("auth-success");//event will be consumed by chat ui
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
                    if(rcvd_start_otr) break;
                    rcvd_start_otr = true;
                    if(stats.toss > control.toss){
                        initiator = true;
                        console.log("[initiating otr conversation]");
                        otrsession.connect();
                    }else{
                        if(stats.toss == control.toss){
                            //todo - do coin toss again...
                            talk.end();
                        }
                    }
                    break;
                case "START_SMP":
                    if(rcvd_start_smp) break;
                    rcvd_start_smp = true;
                    if(!trust.Trusted){
                        state = SessionState.AUTH;
                        console.log("[starting authentication]");
                        if(initiator) otrsession.start_smp();
                    }else{
                        //remote is excpecting to do SMP (most likely they dont trust our fingerprint and are in connect mode)
                        //let them know we already trust their fingerprint
                        peer.send(new Buffer(JSON.stringify({cmd:"NOT_EXCPECTING_START_SMP"})),0);
                        talk.end();
                    }
                    break;
                case "GO_CHAT":
                    if(rcvd_go_chat) break;
                    rcvd_go_chat = true;
                    if(sent_go_chat){
                         talk.emit("start_chat");
                    }else if(App.mode()=='connect') console.log("buddy accepted our fingerprint.");

                    break;                
              }
            }catch(E){}
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
        if(state != SessionState.CHAT) return;
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
       state = SessionState.ENDED;
       if(peer)  otrsession.close();
       user.state.free();
       setTimeout(function(){
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
        state = SessionState.CHAT;
    };
    this.go_chat = function(){        
        if(otrsession.isAuthenticated()){        
            peer.send( new Buffer(JSON.stringify({cmd:"GO_CHAT"})),0);
            sent_go_chat = true;
            state = SessionState.TRUSTED;
            if(rcvd_go_chat){ talk.emit("start_chat");}
            else{
                if(App.mode()=='connect') console.log("accepting fingerprint, waiting for buddy.");
            }
        }
    };
    //if both ends initiate otr at the same time... protocol hangs.. :(
    peer.send(new Buffer(JSON.stringify({cmd:"START_OTR",toss:stats.toss})),0);

    return talk;
}
