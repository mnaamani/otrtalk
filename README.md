##OTRTALK
**p2p off-the-record chat tool, built using TEO network stack**
- [T|eleHash](http://telehash.org): a real-time and fully distributed p2p application/services discovery protocol.
- [E|Net](http://enet.bespin.org/Features.html): robust network communication layer on top of UDP.
- [O|TR](http://www.cypherpunks.ca/otr/): off-the-record messaging (encryption, authentication, deniability,forward secrecy)

**otrtalk is considered experimental, alpha, proof of concept -- for testing purposes only!**

### How it works

* Using the TeleHash protocol we locate a peer which is also actively trying to connect to us.
* TeleHash attempts to traverse NATs, opening a path to our peer. A reliable UDP connection is then established using the ENet protocol.
* An OTR conversation is then started to securely exchanged messages.
* During the OTR session, either party may request to transfer a file. The transfer will be encrypted using the extra symmetric key established as part of the OTR protocol. (todo)

otrtalk currently only supports synchronous two-party messaging, (both parties must be online at the same time to exchange messages).

### Privacy & Security
* otrtalk does *NOT* anonymise your connection with the remote party in any way.
* otrtalk uses the OTR protocol to offer encryption/authentication and forward secrecy.

### Decentralised
otrtalk doesn't depend on servers or datacenters. However some nodes/servers acting as udp proxies would be necessary in the cases where NAT's cannot be traversed successfully. (todo)

### Installing

    npm install otrtalk
