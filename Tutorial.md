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
This will setup the necessary files in your home directory (in this example /home/bruce), and generate a new OTR key.
You will be prompted for a profile name, otr-talk id and a password to encrypt your key. **choose a long passphrase**.

    otrtalk profiles add
      profile name: Bruce
    Enter an otrtalk id for this profile.
    This is a public name that you give out to your buddies.
      otrtalk id: @batman
    creating profile and generating your OTR key...

    Your keys are stored in an encrypted key-store, protected with a password.
    Pick a long password to protect your keys in case the key-store is stolen
    new key-store password: ******
    confirm password:  ******

when the key is generated the profile details will be shown:

    ┌─────────────┬──────────────────────────────────────────────┐
    │ Profile     │ Bruce                                        │
    ├─────────────┼──────────────────────────────────────────────┤
    │ otrtalk-id  │ @batman                                      │
    ├─────────────┼──────────────────────────────────────────────┤
    │ keystore    │ /home/bruce/.otrtalk/Bruce/priv.keys         │
    ├─────────────┼──────────────────────────────────────────────┤
    │ otr-module  │ otr4-em                                      │
    ├─────────────┼──────────────────────────────────────────────┤
    │ fingerprint │ AB2ABCEA E4C54F1C 471AC586 1C2124C7 97671ED7 │
    └─────────────┴──────────────────────────────────────────────┘
    created new profile: Bruce

The string `AB2ABCEA E4C54F1C 471AC586 1C2124C7 97671ED7` is your OTR key fingerprint which you can share with
your buddies, along with your otrtalk-id when [establishing trust](#establish-trust-with-a-buddy).

The `list` sub-command will show all profiles:

    ┌──────────┐
    │ Profiles │
    ├──────────┤
    │ Bruce    │
    └──────────┘

To see detailed information about the profile use the `info` sub-command

    otrtalk profiles info

Profiles can be removed with he `remove` sub-command:

    otrtalk profiles remove

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
each of you will be presented with the other's key fingerprint to verify and accept:

    Select a profile:
    1) Bruce
    : 1
    enter key-store password:
    Buddy not found.
    add [Robin] to your buddy list now [y/n]? y
    Robin's otrtalk id: @robin
    When establishing a new trust with a buddy you must provide a shared secret.
    This will be used by SMP authentication during connection establishment.
    Enter SMP secret:
    [ connect mode ] contacting: Robin ..

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

    otrtalk chat

you will be prompted to select the profile to use and buddy to chat with.

### Chat Prompt
After successfully contacting your buddy you enter the chat mode:

    otrtalk:

At the chat prompt you can type a message and press enter to send it.

    otrtalk: hello

Commands may also be issued preceeded by a forward slash:

     otrtalk: /help

the /help will display a list available commands:

    /info   - display session information
    /auth   - start or respond to SMP authentication request
    /clear  - clear the messages on the screen

To terminate the chat press 'Ctrl-D'

### Managing your buddy list

Listing buddies:

    otrtalk buddies list

Removing a buddy:

    otrtalk buddies remove


### Importing OTR keys from Pidgin and Adium

Import a key from pidgin, to a new profile Bruce with otrtalk-id @batman.

    otrtalk import-key pidgin Bruce @batman

You will be presented with a list of accounts from pidgin to select from.


### Advanced connect options

If you use piding or adium instant messengers with the OTR plugin you can see a list of your buddies fingerprints:

    otrtalk im-buddies

If your buddy has chosen to import his OTR key into otrtalk then you can take advantage of this fact when trying to
establish a new connection use the --piding or --adium option

    otrtalk connect mybuddy --pidgin

For each peer that connects their fingerprint will be cross checked against your authenticated IM buddies and if a match
is found SMP will be performed otherwise the connection will be rejected. This assists in verifying the correct fingerprint.

### Chatting with someone on the same LAN/subnet

If you know your buddy is on the same LAN subnet you can discover them on the network
using the `--broadcast` option (your buddy must also use the option)

    otrtalk chat bob --broadcast

### Selecting a Network interface to use

otrtalk will select the first external network interface for communication on the p2p network.
If you have multiple connections you can specify the one to be used with the `-i` or `--interface` option:

    otrtalk chat bob --interface eth2

### Firewall/NAT problems?

If you are having issues successfully connecting you may be behind a restrictive NAT/firewall.
If your NAT/firewall router supports uPNP you can use the --upnp option and otrtalk will try
to perform port-mapping:

    otrtalk chat bob --upnp
### Keeping otrtalk uptodate

To check if a new version is available:

    otrtalk update

If a new update is available, use npm to update to the latest version:

    npm -g update otrtalk
