##OTRTALK
**p2p off-the-record chat** for [nodejs](http://nodejs.org/)

### Install otrtalk with NPM

    npm -g install otrtalk

[Read the Tutorial](https://github.com/mnaamani/node-otr-talk/blob/master/Tutorial.md) to get started.

### How it works

otrtalk is built the using *TEO* network stack

* [T|eleHash](https://github.com/mnaamani/node-telehash): a real-time and fully distributed p2p application/services discovery protocol.
* [E|Net](https://github.com/mnaamani/enet-npm): robust network communication layer on top of UDP.
* [O|TR](https://github.com/mnaamani/otr4-em): off-the-record messaging (encryption, authentication, deniability,forward secrecy)


Using the TeleHash protocol we locate a peer which is also actively trying to connect to us.
TeleHash attempts to traverse NATs, opening a path to our peer. A reliable UDP connection is then established using the ENet protocol.
An OTR conversation is then started to securely exchanged messages.

otrtalk currently only supports synchronous two-party messaging, (both parties must be online at the same time to exchange messages).

### Privacy & Security
* otrtalk does *NOT* anonymise your connection with the remote party in any way.
* otrtalk uses the OTR protocol to offer encryption/authentication and forward secrecy.
* messages are exchanged directly between the peers and are not relayed through any servers. (end to end encryption)

### NAT/firewalls
otrtalk has a builtin mechanism to traverse NATs without the use of STUN servers.
No support is yet available for TURN servers which would be required if at least one user is behind a restrictive NAT (symmetric NAT)
