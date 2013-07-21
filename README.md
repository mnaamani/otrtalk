##OTRTALK
**p2p off-the-record chat tool, built using TEO network stack**
- [T|eleHash](https://github.com/mnaamani/node-telehash): a real-time and fully distributed p2p application/services discovery protocol.
- [E|Net](https://github.com/mnaamani/enet-npm): robust network communication layer on top of UDP.
- [O|TR](https://github.com/mnaamani/otr4-em): off-the-record messaging (encryption, authentication, deniability,forward secrecy)

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
    
### Getting Started

Lets say Alice wishes to chat with Bob.

On her system Alice will create a new profile named "Alice" and assign it an otrtalk-id "@alice":

    alice:~$ otrtalk profiles add Alice @alice

A new OTR key will be generated for her profile.

Bob similary creates a profile "Bob" with otrtalk-id "@bob" and generates a new OTR key on his system:

    bob:~$ otrtalk profiles add Bob @bob

Alice can now attempt to connect with Bob giving him a buddy alias BOB.

    alice:~$ otrtalk connect BOB --profile Alice

She will be prompted to enter his otrtalk-id. She will also be prompted for an SMP authentication secret.
This is a one-time secret agreed between Alice and Bob for the purpose of establishing a new trust. Bob issues a similar command:

    bob:~$ otrtalk connect ALICE --profile Bob

Where ALICE is Bob's buddy alias for Alice. He will also be prompted to enter her otrtalk-id and the SMP authentication secret.
Network discovery will occur and a connection will be established between Alice and Bob, each will be presented with the other's
key fingerprint to accept. When both parties accept the fingerprint a chat prompt is presented to enter messages:

    [ connect mode ] contacting: BOB ..
    [authentication success]
    You have connected to someone who claims to be BOB
    They know the authentication secret.
    Their public key fingerprint:

        90D8EA21 4324B1DB 8CD1152D 410514ED 95425C39

    Do you want to trust this fingerprint [y/n]? y
    accepted fingerprint.
    -----------------------------------------------
    connected to: 178.79.135.146:34467
    buddy fingerprint: 90D8EA21 4324B1DB 8CD1152D 410514ED 95425C39
    -----------------------------------------------
    otrtalk: 


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

There are several options to use when connecting and establishing trust.
If you and your buddy use OTR with pidgin and have imported your keys to an otrtalk profile this is the best way to connect:

    otrtalk connect bob --fingerprint "517720E5 BE9A020E 0F8F551A A5D0C18D 09F19E09" --pidgin

Where "517720E5 BE9A020E 0F8F551A A5D0C18D 09F19E09" is bob's fingerprint.
The --pidgin or --adium option will display the accountname from pidgin or adium on a fingerprint match.

To list all your buddies fingerprints from adium/pidgin:

    otrtalk im-buddies

For connecting to a new buddy with whom we have exchanged fingerprints:

    otrtalk connect bob --fingerprint "517720E5 BE9A020E 0F8F551A A5D0C18D 09F19E09"

Finally the simplest way although not the recommended way:

    otrtalk connect bob

Including the --fingerprint option is recommended (make sure to include the quotes) because it reduces
the number of sessions and authentication attemps made with peers during the discovery process.

Once a session successfully completes SMP authentication, the fingerprint of the public
key is presented. At this point we **must** verify that it matches the one we exchanged securely with our buddy.
After successfull verification on both sides, the fingerprint is saved and a secure chat session is started.


**Chat Mode**

Use chat mode to connect to a buddy with which a trust has already been established.

    otrtalk chat bob

In this mode otrtalk will only establish an secure chat session with a peer who's public key fingperprint matches the one we have
on file in the fingerprints store.

When a connection is established typing messages at the prompt followed by enter will send he message.
Commands are issued with a forward slash:

     otrtalk: /help
    
available commands:

    /info   - session information
    /auth   - start or respond to in session SMP authentication
    /clear  - clear the messages on the screen
    
To end the chat press ctrl-D 
