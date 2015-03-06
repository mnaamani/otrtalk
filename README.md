##OTRTALK
**p2p off-the-record chat** for [nodejs](http://nodejs.org/)

OTRTALK is a command line based chat application.
Unlike most instant messenger applications it doesn't rely on centralised servers.
Instead it utilises a DHT (Distributed Hash Table) similar to BitTorrent, called telehash.

The most recent version now has experimental support for discovery of buddies over BitTorrent network. Other discovery
protocols will be added in future, with more focus towards privacy preserving protocols.

### Install otrtalk with NPM

	npm -g install otrtalk

Use sudo if necessary:

	sudo -g install otrtalk

Read the [Tutorial](https://github.com/mnaamani/node-otr-talk/blob/master/Tutorial.md) to get started.

### How it works

otrtalk is built using three main components:

* [TeleHash](https://github.com/mnaamani/node-telehash): DHT a real-time and fully distributed p2p application/services discovery protocol.
* [ENet](https://github.com/mnaamani/enet-npm): a robust network communication layer on top of UDP.
* [OTR](https://github.com/mnaamani/otr4-em): off-the-record messaging (encryption, authentication, forward secrecy)


Using the TeleHash protocol we locate a peer which is also actively trying to connect to us.
TeleHash attempts to traverse NATs, opening a path to our peer. A reliable UDP connection is then established using the ENet protocol.
An OTR conversation is then started to securely exchanged messages.

otrtalk currently only supports synchronous two-party messaging, (both parties must be online at the same time to exchange messages).

### Privacy & Security
* otrtalk does **NOT** anonymise your connection with the remote party in any way.
* otrtalk uses the **OTR** protocol to offer encryption/authentication and forward secrecy.
* chat messages are end-to-end encrypted and are exchanged directly between the peers.
* chat messages are not relayed through or stored on any servers.

### Getting around NAT/routers and firewalls
otrtalk has a builtin mechanism to traverse NATs without the use of STUN servers, and can optionally use
upnp port mapping help get around more restrictive NATs.

Another way to get around firewalls would be to use otrtalk from a hosted/virtual server.

otrtalk should also work over a VPN. You can use the *--interface* option to select a vpn interface.

In the works is a feature to support a NAT traversal mechanism, similar in concept to using a TURN server, which tunnels UDP traffic over a websocket to a udp-proxy server which will act as relay.
Making it possible to work through a SOCKS proxy (using tsocks) or an HTTP proxy.

### A note on OTR

otrtalk uses the default otr4-em OTR module. If you are on a GNU/Linux or Mac OS X system you can configure new
profiles to use the native libotr on your system by installing the otr4 module:

	npm -g install otr4

use sudo if necessary

	sudo npm -g install otr4
