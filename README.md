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

*some ideas which could be implemented - buddy can offer 'services' such as socks-proxy,http-proxy, port forwarding etc.. to connected buddy (ala ssh)

### Privacy & Security
* otrtalk does *NOT* anonymise your connection with the remote party in any way. (It might be possible however to access the p2p network via a TURN server by TLS over TOR?) (todo)  
* otrtalk uses the OTR protocol to offer encryption/authentication and forward secrecy.

### Decentralised
otrtalk doesn't depend on servers or datacenters. The p2p network at the moment only consists of two seed nodes. Alot of work will need to go into growing the network size for it to be dependable. TURN servers will need to be used when NAT's cannot be successfully traversed. (todo)

### Installing

    npm -g install otrtalk
    
### Getting started

Setup your OTR public key. You can choose to import an existing DSA key from pidgin or adium accounts, or generate a new one.
To generate a new key, create a new profile *Profile_Name* and assign it an otrtalk-id *me@otr-talk*:

    otrtalk profiles add Profile_Name me@otr-talk

To import a key from pidgin, into a new profile:

    otrtalk import-key pidgin Profile_Name me@otr-talk

To connect to a buddy you should know their otrtalk-id and public key fingerprint:

    otrtalk connect buddy_alias --fingerprint "517720E5 BE9A020E 0F8F551A A5D0C18D 09F19E09"

You will be prompted to add buddy_alias to your profile buddylist and enter their corresponding otrtalk-id.
You will also be prompted for an SMP authentication secret which you and your buddy must agree to for the new trust connection to be established.

Your buddy should follow the same procedure. When you are both online a p2p connection will be established, followed by a prompt to accept each other's
fingerprints and a secure chat begins.

In future you only need to use the chat command to chat with your buddy:

    otrtalk chat buddy_alias


### Otrtalk Profiles

Multiple profiles/identities can be managed and are referred to by a simple profile-name.

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

    otrtalk profiles info [profile]

### Otrtalk Modes

*Otrtalk has two modes of operation Connect and Chat mode*

**Connect Mode** - for establishing new trust

To be able to add a buddy to your buddy list and have chats you must use connect mode to establish trust.
Prior to starting a connect session, exchange your otrtalk-id and public key fingerprint with your buddy securely (in person,or using another authenticated channel [text secure/secure email]). You must also agree on a shared secret.
This is a one-time secret which will be used to to perform a automated Socialist Millionair's Protocol (SMP) authentication
as part of the network discovery protocol to find our buddy in the p2p network.

Most reliable - specify a known buddy's fingerprint (from existing instant messaging app pidgin or adium)

    otrtalk connect bob --fingerprint "517720E5 BE9A020E 0F8F551A A5D0C18D 09F19E09" --pidgin

For connecting to a new buddy not in our pidgin or adium buddy lists:

    otrtalk connect bob --fingerprint "517720E5 BE9A020E 0F8F551A A5D0C18D 09F19E09"

Works but not recommended, would have to do SMP authentication with every connection and manually verify each fingerprint:

    otrtalk connect bob

Once a session successfully completes SMP authentication, the fingerprint of the public
key is presented. At this point we **must** verify that it matches the one we exchanged securely with our buddy.
After successfull verification the fingerprint is saved and a secure chat session is started.


**Chat Mode**

Use chat mode to connect to a buddy with which a trust has already been established.

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
