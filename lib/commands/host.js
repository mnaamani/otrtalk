var program = require('../commander.js');
var telehash = require("get-telehash").v1.telehash;
var iputil = require("get-telehash").iputil;
var upnp = require("../upnp/nat-upnp.js").createClient(program.interface);
var didMapping = false;
var debug = require("../debug");

var PORT = program.port ? parseInt(program.port) : 42424;

module.exports = Command;

function Command(ui) {
    this.UI = ui;
}
Command.prototype.exit = function () {
    if (!didMapping) {
        process.exit();
        return;
    }
    upnp.portUnmapping({
        public: PORT,
        protocol: 'udp'
    }, function (err) {
        if (err) debug(err);
        process.exit();
    });
}
Command.prototype.exec = function (action) {
    //allow multiple seeds.. comma separated
    var seeds = program.seed ? [program.seed] : undefined;

    if (program.interface === 'zt0' && !seeds) {
        seeds = ["28.192.75.206:42424"]; //default zerotier seed on earth network
    }
    debug("starting telehash node");
    if(program.interface) debug("on interface:",program.interface);
    if(seeds) debug("using telehash seed(s):",seeds);
    var th = telehash.init({
        log:debug,
        mode: 3,
        seeds: seeds,
        port: PORT,
        udplib: "node",
        broadcastMode: false,
        respondToBroadcasts: false,
        interface: program.interface,
        onSocketBound: function (addr) {
            console.log("listening on:", addr);
            if (iputil.isPrivateIP(addr.address) && program.upnp) {
                debug("trying upnp port mapping..");
                upnp.portMapping({
                    public: PORT,
                    private: PORT,
                    ttl: 0,
                    protocol: 'udp'
                }, function (err) {
                    if (err) {
                       console.log("upnp:",err);
                    }else didMapping = true;
                    telehash.seed();
                });
            } else {
                telehash.seed(function(err){
			if(err) {
                           return;
			} 
                        if(th.snat){
			   telehash.shutdown();
                           console.log("You are behind a restrictive NAT/firewall. A telehash seed node can not operate effectively.");
                           console.log("Try again and use the --upnp option to try to get around the firewall.");
                           process.exit();
                        }
		});
            }
        }
    });
};
