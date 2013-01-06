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
    
### Quick Setup

Jump right in and connect to a new buddy 'new_buddy'.
Otrtalk will guide you to setup a new identity, and contact new_buddy if they are online.

    otrtalk connect new_buddy

### Otrtalk Profiles

Multiple profiles/identities can be managed and are referred to by a simple profile-name.
A default profile named *default* will be used when a profile is not specified.

An otrtalk profile stores

* otrtalk-id
* private key store
* buddy list
* fingerprints store

**Otrtalk-ID**
When using otrtalk you are free to choose any name as your public identifier.
For ease of sharing it can be your email address or twitter handle for example. In otrtalk there is
no central naming authority. So identifiers are not unique. A profile stores a single otrtalk-id. 

**Private Key Store**
To create a unique identity in otrtalk to share with your peers (buddies) whom you wish to communicate with,
public key cryptography is used. A DSA key pair will be automatically generated and stored in your profile's
private key store. So your public identity is a combination of the otrtalk id and fingerprint of the public DSA key.
The keystore is encrypted with a passphrase.

**Buddy List**
Each profile maintains a unique buddy list. A buddy is given a name (alias) unique to the profile to store and associated
with their otrtalk id. When you connect and authenticate with a new buddy their public key fingerprint will be stored in
the profile's fingerprints store.

**Fingerprints Store**
Each buddy has a unique fingerprints store, so you can have two buddies with the same otrtalk id, you just assign them different aliases.
The fingerprint store is also encrypted with the same passphrase as the keystore.

To see a list of profiles on the system...

    otrtalk profiles list

To get details on a profile..

    otrtalk profiles info default

### Otrtalk Modes

*Otrtalk has two modes of operation Connect and Chat mode*

**Connect Mode**

    otrtalk connect bob
    
Otrtalk employs trust on first use *(TOFU)* authentication to establish a trust/connection with a new buddy. 
Prior to starting a connect session, exchange your otrtalk id and public key fingerprint with your buddy. Securely,
(in person,or using another trusted authenticated channel [text secure]). You must also agree on a shared secret.
This is a onetime secret which will be used to to perform a automated Socialist Millionair's Protocol (SMP) authentication
as part of the network discovery protocol to find our buddy in the p2p network.

Once a session successfully completes SMP authentication, the fingerprint of the public
key is presented. At this point we **must** verify that it matches the one we exchanged securely with our buddy.
After successfull verification the fingerprint is saved and a secure chat session is started.


**Chat Mode**

Use chat mode to connect to a buddy with which a trust has already been established.(Either by having completed a connect session,
or if we have manually imported thier fingerprint to the fingerprints store)

    otrtalk chat bob

In this mode otrtalk will only establish an secure chat session with a peer who's public key fingperprint matches the one we have
on file in the fingerprints store.


**Secure Chat Session**
Type a message at the otrtalk: prompt

    otrtalk: type a message here and press enter to send it.

You can also issues commands..

    otrtalk: /help
    
available commands:

    /info   - session information
    /auth   - start or respond to in session SMP authentication
    /clear  - clear the messages on the screen
    /exit   - exit the chat
