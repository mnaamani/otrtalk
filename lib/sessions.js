var async = require("async");
var events = require("events");
var util = require("util");
var assert = require("assert");

module.exports.TalkSession = Session;

util.inherits(Session, events.EventEmitter);

function Session(App,otr,enet_peer,initiator,smp_callback){
    //App = app options  (Talk object created in otrtalk() --> ../otrtalk.js
    var user = new otr.User(App.files);
    var context = user.ConnContext( App.accountname, App.protocol, App.buddyID );
    var peer = enet_peer;
    var otrsession = new otr.Session(user, context, {policy:otr.POLICY("ALWAYS"), secret:App.secret});

    //state of buddy's fingerprint in this session 
    var state = {
        NewFingerprint:false, //fingerprint not previously on file
        Authenticated:false,  //successfully smp authenticated in at least once in this session.
        Trusted:false       //when connection goes encrypted, will be set to true if previously SMP authenticated                            
    };

    events.EventEmitter.call(this);

    var talk = this;//talk session

    talk.otrsession = otrsession;
    talk.user = user;
    talk.peer = enet_peer;
    talk.context = context;

    peer.queue = async.queue(inject_worker,1);
    
    function inject_worker(buffer,callback){
    	if(peer) peer.send( buffer, 0);//keep otr conversation on channel 0
    	callback();
    }

    otrsession.on("inject_message",function(msg){
    	if(peer) peer.queue.push(new Buffer(msg));
    });

    otrsession.on("message",function(msg,encrypted){
        if(!encrypted) return;
        if(!this.isAuthenticated()) return;
        //reject plaintext and insecure messages
        talk.emit('message',msg);
    });

    //new_fingerprint event raised before gone_secure
    otrsession.on("new_fingerprint",function(fp){
        state.NewFingerprint = true;
        console.log("[new fingerprint]:",fp);
    });

    otrsession.on("gone_secure", function(){
        //console.log("[connection encrypted]");
        state.Trusted = this.isAuthenticated();
        onEncrypted();
    });

    otrsession.on("still_secure", function(){
        //console.log("[connection re-encrypted]");
        onEncrypted();
    });

    function onEncrypted(){
        switch(App.mode()){
          case 'chat':
            if(state.Trusted){
                return talk.emit("auth", talk.fingerprint(),state);
            }else{
                console.log("[only accepting authenticated fingerprints]");
                return talk.end();//note: causing seg-fault in otr3 ??
            }
            break;
        
          case 'connect':
            if(state.Trusted){
                //we already trust the fingerprint but we chose connect mode no need to do smp
                talk.emit("auth",talk.fingerprint(),state);
            }else{
                //lets try to do SMP authentication with provided secret App.secret
                if(App.secret){
                  //starting smp on both sides at the same time problematic.
                  //maybe use enet channel for control messages?
                  if(initiator){
                   setTimeout(function(){
                      console.log("[starting authentication]");
                      otrsession.start_smp();
                   },25);
                  }
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
       if(App.mode()=="connect"){
            //auto SMP authentication, ignoring question... and will responding with App.secret
            console.log("[responding to authentication request]");
            this.respond_smp();
       }else{
           //in chat mode we can do interactive SMP.
           if(smp_callback){
              smp_callback(talk, question);
           }else{
                talk.emit("smp",question);
           }
       }
    });

    otrsession.on("smp_complete",function(){
       console.log("[authentication success]");
       state.Authenticated = true;
       if(App.mode()=='connect'){
        talk.emit("auth",talk.fingerprint(), state);
       }else{
        talk.emit("auth-success");//event will be consumed by chat ui
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

    peer.data = function (buff, channel_number) {
        if(channel_number == 0 ) otrsession.recv(buff);
        //other channels will be used for transfering files..
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
        otrsession.send(msg);
    };

    this.fingerprint = function(){
        if(typeof context.fingerprint == 'function'){
            return context.fingerprint();//otr3-em, otr4-em
        }
        return context.fingerprint;//otr3
    }

    this.writeAuthenticatedFingerprints = function(){
        user.writeTrustedFingerprints();
        App.files.save();
    };

    this.end = function (){
       if(talk.ending) return;
       talk.ending = true;
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

    //if both ends initiate otr at the same time... protocol hangs.. :(
    if(initiator){
        otrsession.connect();
        console.log("[initiating otr conversation]");
    }

    return talk;
}

