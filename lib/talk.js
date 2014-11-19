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

function Talk(settings,newOtrSession){
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

            var session = newOtrSession();
            var sessionHandler = new SessionHandler(settings,session,peer);

            sessionHandler.on("auth",function(trust){
               if(found_buddy) {
                 sessionHandler.end();
                 return;
               }
               auth_queue.push(sessionHandler);
            });

            sessionHandler.on("closed",function(){
                if(sessionHandler.auth_complete) {
                  sessionHandler.auth_complete();
                  delete sessionHandler.auth_complete;
                }
            });

            sessionHandler.on("start_chat",function(){
                found_buddy = true;
                link.pause();

                if(sessionHandler.auth_complete){
                  sessionHandler.auth_complete();
                  delete sessionHandler.auth_complete;
                }

                Chat.attach(settings.buddy,sessionHandler,function(){
                  network.shutdown();
                  shutdown();
                });
            });

            sessionHandler.start();

        });
    },settings.host?42424:undefined);

    function handleAuth(session, callback){

        if(found_buddy){
            session.end();
            callback();
            return;
        }

        debug("[authenticated connection]");

        session.auth_complete = callback;

        switch(session.mode()){
            case 'chat':
                assert(session.isTrusted() && !session.isNewFingerprint());
                session.go_chat();
                break;

            case 'connect':
               if(session.isNewFingerprint()){
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
              }else if(session.Trusted()){
                //we used connect mode and found an already trusted fingerprint...
                session.go_chat();
              }
              break;
         }
    }

}
