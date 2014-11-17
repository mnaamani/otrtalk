var async = require("async");
var assert = require("assert");
var SessionHandler = require("./sessions");
var Chat = require("./chat.js");
var program = require("./commander.js");

module.exports.launch = Talk;


function debug(){
    if(program.verbose) console.log.apply(console,arguments);
}

function shutdown(){
    setTimeout(function(){
       process.exit();
    },300);
}

function Talk(settings,keystore){
    var network = require("./discovery/"+settings.network);
    var found_buddy = false;
    var auth_queue = async.queue(handleAuth,1);

    var link = new network.Link(settings.id, settings.buddyID);

    debug("initiating network...");

    network.init(settings.interface, function(){
        console.log("[",settings.mode,"mode ] contacting:",settings.buddy,"..");
        link.connect(function(peer){
            if(found_buddy){
              peer.disconnectLater();
              return;
            }

            var session = keystore.newOtrSession(settings.secret);
            var sessionHandler = new SessionHandler(settings,session,peer);

            sessionHandler.on("auth",function(trust){
               if(found_buddy) {
                 return;
               }
               auth_queue.push({session:sessionHandler,trust:trust});
            });

            sessionHandler.on("closed",function(){
                if(Chat.ActiveSession() == sessionHandler) {
                  debug("shutting down gracefully.")
                  network.shutdown();
                  shutdown();
                  return;
                }
                if(sessionHandler.auth_complete) {
                  sessionHandler.auth_complete();
                  delete sessionHandler.auth_complete();
                }
            });

            sessionHandler.on("start_chat",function(){
                if(settings.mode=='connect') sessionHandler.writeAuthenticatedFingerprints();
                found_buddy = true;
                settings.mode = "chat";
                link.pause();
                if(sessionHandler.auth_complete){
                  sessionHandler.auth_complete();
                  delete sessionHandler.auth_complete;
                }

                Chat.attach(settings,sessionHandler);
            });

            sessionHandler.start();

        });
    },settings.host?42424:undefined);

    function handleAuth(_,callback){
        var session = _.session,
            trust = _.trust;

        if(found_buddy){
            session.end();
            callback();
            return;
        }

        debug("[authenticated connection]");

        session.auth_complete = callback;

        switch(settings.mode){
            case 'chat':
                assert(trust.Trusted && !trust.NewFingerprint);
                session.go_chat();
                break;

            case 'connect':
               if(trust.NewFingerprint){
                console.log("You have connected to someone who claims to be",settings.buddyID);
                console.log("They know the authentication secret.");
                console.log("Their public key fingerprint:\n");
                console.log("\t"+session.fingerprint());
                program.confirm("\nDo you want to trust this fingerprint [y/n]? ",function(ok){
                    if(!ok){
                        console.log("rejecting fingerprint.");
                        session.end();
                    }else{
                        if(session.ending){
                            //remote rejected, and closed the session
                            console.log("session closed, fingerprint not saved.");
                            return;
                        }
                        console.log("accepted fingerprint.");
                        session.go_chat();
                    }
                });
              }else if(trust.Trusted){
                //we used connect mode and found an already trusted fingerprint...
                session.go_chat();
              }
              break;
         }
    }

}
