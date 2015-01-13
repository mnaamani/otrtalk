var program = require('../commander.js');
var telehash = require("get-telehash").v1.telehash;
var iputil = require("get-telehash").iputil;
var upnp = require("../upnp/nat-upnp.js").createClient(program.interface);
var didMapping = false;

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
        if (err) console.log(err);
        process.exit();
    });
}
Command.prototype.exec = function (action) {
    //allow multiple seeds.. comma separated
    var seeds = program.seed ? [program.seed] : undefined;

    if (program.interface === 'zt0' && !seeds) {
        seeds = ["28.192.75.206:42424"]; //default zerotier seed on earth network
    }
    telehash.init({
        mode: 3,
        seeds: seeds,
        port: PORT,
        udplib: "node",
        broadcastMode: false,
        respondToBroadcasts: false,
        interface: program.interface,
        onSocketBound: function (addr) {
            console.log("Network Socket bound:", addr);
            if (iputil.isPrivateIP(addr.address)) {
                didMapping = true;
                upnp.portMapping({
                    public: PORT,
                    private: PORT,
                    ttl: 0,
                    protocol: 'udp'
                }, function (err) {
                    if (err) console.log(err);
                    telehash.seed();
                });
            } else {
                telehash.seed();
            }
        }
    });
};
