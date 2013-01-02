OTRTALK

    ======== experimental, alpha, proof of concept -- for testing purposes only! ======

OTRTALK: p2p off-the-record chat tool, built using (TEO):

    [T|eleHash]: a real-time and fully distributed p2p application/services discovery protocol.
    [E|Net](http://enet.bespin.org/Features.html): robust network communication layer on top of UDP. 
    [O|TR](http://www.cypherpunks.ca/otr/): off-the-record messaging (encryption, authentication, deniability,forward secrecy)

== How it works

    o  Using the TeleHash protocol we locate a peer which is also actively
       trying to connect to us.

    o  TeleHash attempts to traverse NATs, opening a path to our peer. A reliable
       UDP connection is then established using the ENet protocol.

    o  An OTR conversation is then started to securely exchanged messages.

    o  During the OTR session, either party may request to transfer a file. The transfer will
       be encrypted using the extra symmetric key established as part of the OTR protocol. (todo)

    [otrtalk currently only supports synchronous two-party messaging, that is both parties must be online
     at the same time to connect to each other]

== Privacy & Security ==

    otrtalk does *NOT* anonymise your connection with the remote party in any way.
    otrtalk uses the OTR protocol to offer encryption/authentication and forward secrecy.

== Decentralised ==

    otrtalk doesn't depend on servers or datacenters. However some nodes/servers acting as udp proxies
    would be necessary in the cases where NAT's cannot be traversed successfully. (todo)

== Installing

    npm install otrtalk

== Usage

  Usage: otrtalk [options] [command]

  Commands:

    connect [buddy]        establish new trust with buddy
    chat [buddy]           chat with trusted buddy
    profiles [list|info|add|remove] [profile] [accountname] [protocol] [keys] [instags] [fingerprints] manage profiles

  Options:

    -h, --help               output usage information
    -V, --version            output the version number
    -p, --profile [profile]  profile to use
    -s, --secret [secret]    secret to use in connect mode for smp authentication
    -o, --otr [module]       specify otr module to use
