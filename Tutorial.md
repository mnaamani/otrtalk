### Getting Started with otrtalk

Firstly make sure you have installed [nodejs](http://nodejs.org/) for your system.

### Install otrtalk with `npm`
Using npm, the node package manager, you can install otrtalk from your command console or shell.

    npm -g install otrtalk

Verify installed version

    otrtalk --version
    
View help for a list of commands and options

    otrtalk --help
    
### Identities in otrtalk - `otrtalk-id`

When using otrtalk you are free to choose any name as your public identifier. Your `otrtalk-id`
For ease of sharing it can be your email address or twitter handle for example.
In otrtalk there is no central naming authority. So identifiers are not unique. 
To create a unique identity in otrtalk to share with your buddies,
public key cryptography is used. So your public identity is a combination of
the otrtalk-id and the fingerprint of your OTR key.

### Create your identity

Lets pretend you are Bruce Wayne and you want to chat privately with your buddy Robin.
Begin by creating a profile called `Bruce` and associate it with otrtalk-id `@batman`

Your identity in otrtalk is stored in a profile. You can have multiple profiles if required.
Profiles are managed using the `profiles` command, followed by one sub-command (`list`, `info`, `add`, `remove`).

Using the `add` sub-command, create the profile:

    otrtalk profiles add Bruce @batman

This will setup the necessary files in your home directory (in this example /home/bruce), and generate a new OTR key.
You will be prompted for a password to encrypt your key. **choose a long passphrase**.

when the key is generated the profile details will be shown:
    
     == Profile: Bruce
    ┌──────────────┬────────────────────────────────────────────┐
    │ otrtalk-id   │ @batman                                    │
    ├──────────────┼────────────────────────────────────────────┤
    │ accountname  │ @batman                                    │
    ├──────────────┼────────────────────────────────────────────┤
    │ protocol     │ otrtalk                                    │
    ├──────────────┼────────────────────────────────────────────┤
    │ keystore     │ /home/bruce/.otrtalk/Bruce/priv.keys       │
    ├──────────────┼────────────────────────────────────────────┤
    │ instags      │ /home/bruce/.otrtalk/Bruce/instance.tags   │
    ├──────────────┼────────────────────────────────────────────┤
    │ fingerprints │ /home/bruce/.otrtalk/Bruce/fingerprints/   │
    ├──────────────┼────────────────────────────────────────────┤
    │ otr-module   │ otr4-em                                    │
    └──────────────┴────────────────────────────────────────────┘
     == Generated Key
    ┌─────────────┬──────────┬──────────────────────────────────────────────┐
    │ accountname │ protocol │ fingerprint                                  │
    ├─────────────┼──────────┼──────────────────────────────────────────────┤
    │ @batman     │ otrtalk  │ AB2ABCEA E4C54F1C 471AC586 1C2124C7 97671ED7 │
    └─────────────┴──────────┴──────────────────────────────────────────────┘

The string `AB2ABCEA E4C54F1C 471AC586 1C2124C7 97671ED7` is your OTR key fingerprint which you can share with
your buddies, along with your otrtalk-id when [establishing trust](#establish-trust-with-a-buddy).

The `list` sub-command will show all profiles:

    otrtalk profiles list
    ┌──────────┐
    │ Profiles │
    ├──────────┤
    │ Bruce    │
    └──────────┘

To see detailed information about the profile use the `info` sub-command

    otrtalk profiles info Bruce

The profile can also be specified using the `-p` or `--profile` option:

    otrtalk profiles info -p Bruce

Profiles can be removed with he `remove` sub-command:

    otrtalk profiles remove --profile Bruce

*this will permanently delete the profile*

### Establish trust with a buddy

Prior to connecting with a new buddy, exchange otrtalk-ids and key fingerprints with your buddy securely
(in person, over the phone, or using another authenticated channel such as TextSecure or secure email).
You must also agree on a shared secret. This is a one-time secret which will be used to to perform an automated
Socialist Millionair's Protocol (SMP) authentication as part of the network discovery protocol to find your buddy
in the p2p network.

You can now issue the connect command and pass it your buddy's fingerprint:

    otrtalk connect Robin --fingerprint "90D8EA21 4324B1DB 8CD1152D 410514ED 95425C3A"

`Robin` is the `alias` you will refer to your buddy by. You will be prompted to enter Robin's `otrtalk-id`.
You will also be prompted for the `SMP authentication secret`.
The `--fingerprint` parameter *is* optional but *highly recommended* because it reduces
the number of sessions and authentication attemps made with peers during the discovery process.

Assuming Robin is online, network discovery will occur and a connection will be established, 
each of you will be presented with the other's key fingerprint to verify and accept.

    [ connect mode ] contacting: Robin ..
    [authentication success]
    You have connected to someone who claims to be Robin
    They know the authentication secret.
    Their public key fingerprint:

        90D8EA21 4324B1DB 8CD1152D 410514ED 95425C3A

    Do you want to trust this fingerprint [y/n]?
    
At this point you **must** verify that it matches your buddy's fingerprint.

After successfull verification on both sides, the fingerprint is saved and a secure chat session is started.

    accepted fingerprint.
    -----------------------------------------------
    connected to: 173.79.125.116:34467
    buddy fingerprint: 90D8EA21 4324B1DB 8CD1152D 410514ED 95425C3A
    -----------------------------------------------
    otrtalk: 

You can now chat securely. See the next section on [chatting](#chat-prompt).


### Chatting - using chat command

otrtalk's chat command allows you to connect to a buddy with whom a trust has already been established in a previous session.

    otrtalk chat Robin

### Chat Prompt

    otrtalk:
    
At the chat prompt you can type a message and press enter to send it.

    otrtalk: hello
    
Commands may also be issued preceeded by a forward slash:

     otrtalk: /help
    
will display the available commands:

    /info   - display session information
    /auth   - start or respond to SMP authentication request
    /clear  - clear the messages on the screen
    
To terminate the chat press Ctrl-D

### Managing your buddy list

Listing buddies:

    otrtalk buddies list --profile Bruce
    
Removing a buddy:

    otrtalk buddies remove Robin --profile Bruce


### Importing OTR keys from Pidgin and Adium

Import a key from pidgin, to a new profile Bruce with otrtalk-id @batman. 

    otrtalk import-key pidgin Bruce @batman
    
You will be presented with a list of accounts from pidgin to select from.


### Advanced connect options

If you use piding or adium instant messengers with the OTR plugin you can see a list of your buddies fingerprints:

    otrtalk im-buddies

If you buddy has chosen to import his OTR key into otrtalk then you can take advantage of this fact when trying to
establish a new connection use the --piding or --adium option

    otrtalk connect mybuddy --pidgin
    
On successful SMP authentication the fingerprint of the peer will be cross checked against your IM buddies and if a match
is found their account name will be shown. This assists in verifying the correct fingerprint.
 
### Additional network options

The underlyig p2p protocol used by otrtalk is telehash. By default it will join the global network. Alternatively you can
join a local telehash network on the LAN.

One user should user at least needs to use the `--host` option when connecting or chatting:

    otrtalk chat alice --host

Another user on the network only needs to use `--lan` option:

    otrtalk chat bob --lan

Its possible to bypass telehash completely by with the `--broadcast` option

    otrtalk chat bob --broadcast

otrtalk will select the first (non internal/loopback) network interface for communication on the p2p network.
If you have multiple connection you can specify the one to be used with the `-i` or `--interface` option:
    
    otrtalk chat bob --interface eth2
    
### Keeping otrtalk uptodate

To check if a new version is available:

    otrtalk update

If a new update is available, use npm to update to the latest version:

    npm -g update otrtalk
    