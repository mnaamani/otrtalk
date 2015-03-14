### Getting Started with otrtalk

Firstly make sure you have installed [nodejs](https://nodejs.org/) for your system.
It should also work with [io.js](https://iojs.org/).

### Install otrtalk with `npm`
Using npm, the node package manager, you can install otrtalk from your command console or shell:

	npm -g install otrtalk

use sudo if necessary:

	sudo npm -g install otrtalk

Verify installed version

	otrtalk --version

View help for a list of commands and options

	otrtalk --help

### Chatting using Pidgin and Adium Identities

If you use piding or adium instant messengers with the OTR plugin, and your buddy is also using otrtalk,
you can chat with them if you have already verified OTR fingerprints by using the `chat-im` command:

	otrtalk chat-im pidgin

You will be presented with a list of accounts to choose from and the buddy to chat with.

If you don't wish to use pidgin or adium OTR keys then you can create a new identity for otrtalk.

### Identities in otrtalk

When using otrtalk you are free to choose any name as your public identifier, your `otrtalk-id`.
For ease of sharing it can be your email address or twitter handle for example.
In otrtalk there is no central naming authority. So identifiers are not unique.
Your unique identity is the combination of your otrtalk-id and the fingerprint of your OTR public key.

### Creating your identity

Your identity in otrtalk is stored in a profile. (You can have multiple profiles if needed)
Profiles are managed using the `profiles` command, followed by one sub-command (`list`, `info`, `add`, `remove`).

Lets pretend you are Bruce Wayne and you want to chat privately with your buddy Robin.
Begin by creating a profile called `Bruce` and associate it with otrtalk-id `@batman`

To create a new profile, we will use the `add` sub-command:

	otrtalk profiles add

You will be prompted for a profile name, otrtalk-id and a password to encrypt your key. **choose a long passphrase**:

	  profile name: Bruce
	Enter an otrtalk id for this profile.
	This is a public name that you give out to your buddies.
	  otrtalk id: @batman
	creating profile and generating your OTR key...

	Your keys are stored in an encrypted key-store, protected with a password.
	Pick a long password to protect your keys in case the key-store is stolen
	new key-store password: ******
	confirm password:  ******

This will setup the necessary files in your home directory (in this example /home/bruce), and generate a new OTR key.
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

`AB2ABCEA E4C54F1C 471AC586 1C2124C7 97671ED7` is your OTR key fingerprint which you can share with
your buddies.

The `list` sub-command will show all profiles:

	otrtalk profiles list

	┌──────────┐
	│ Profiles │
	├──────────┤
	│ Bruce    │
	└──────────┘

To see detailed information about the profile use the `info` sub-command, you will be presented with a list of profiles to select from:

	otrtalk profiles info

Profiles can be removed with he `remove` sub-command, you will be presented with a list of profiles to select from:

	otrtalk profiles remove

*this will permanently delete the profile*

### Chatting

The first time you want to chat with a new buddy, securely exchange your otrtalk-id and key fingerprint with them
(in person, or using another authenticated channel such as TextSecure, secure email, secure voice call).
You must also agree on a shared secret. This is a one-time secret which will be used to to perform an automated
Socialist Millionair's Protocol (SMP) authentication as part of the network discovery protocol to find your buddy
in the p2p network.

You can now issue the chat command and pass it your buddy's fingerprint:

	otrtalk chat Robin --fingerprint "90D8EA21 4324B1DB 8CD1152D 410514ED 95425C3A"

`Robin` is the `alias` you will refer to your buddy by. You will be prompted to enter Robin's `otrtalk-id`.
You will also be prompted for the `SMP authentication secret`.
The `--fingerprint` parameter *is* optional but *highly recommended* because it reduces
the number of sessions and authentication attempts made with peers during the discovery process.

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
	contacting Robin (@robin) ...

	Authenticated Connection Established.
	Your public Key fingerprint:

		AB2ABCEA E4C54F1C 471AC586 1C2124C7 97671ED7

	Remote public key fingerprint:

		42AAF3BB AA4F180C 6442AF88 80384C41 19A82EAA

	Do you want to accept this connection [y/n]?

Assuming Robin is online, network discovery will occur and a connection will be established,
each of you will be presented with the other's key fingerprint to verify and accept:

At this point you **must** verify that the remote public key fingerprint matches your buddy's fingerprint.

After successful verification on both sides, the fingerprint is saved and a secure chat session is started.

	--------------------------------------------------------------
		connected to: Robin
		address: 148.125.74.14:51981
		fingerprint: 42AAF3BB AA4F180C 6442AF88 80384C41 19A82EAA
	--------------------------------------------------------------
	otrtalk:

At the chat prompt you can type a message and press enter to send it.

	otrtalk: hello

Commands may also be issued preceded by a forward slash:

	 otrtalk: /help

the /help will display a list available commands:

	/info   - display session information
	/auth   - start or respond to SMP authentication request
	/clear  - clear the messages on the screen

To terminate the chat press 'Ctrl-D'

The next time you chat with the same buddy, you will not need to enter an SMP secret or fingerprint.

### Managing your buddy list

Listing buddies:

	otrtalk buddies list

Removing a buddy:

	otrtalk buddies remove


### Selecting a Network interface to use

otrtalk by default will bind to all network interfaces for communication on the p2p network.
If you want to be more selective use the `--interface` option:

	otrtalk chat bob --interface eth2

This could be useful if you are using a vpn and wish to force connection through it.

### NAT problems?

If you are having issues successfully connecting you may be behind a restrictive NAT router.
If your router supports uPNP you can use the --upnp option and otrtalk will try
to perform port-mapping:

	otrtalk chat bob --upnp

### Alternative discovery methods
By default otrtalk will use telehash DHT to discover and find your buddy. Some other methods are available:

If you know your buddy is on the same LAN/subnet, both of you must use the `--broadcast` option

	otrtalk chat bob --broadcast

For some interfaces you might need to provide the broadcast address

	otrtalk chat bob --broadcast 29.255.255.255

Discovery is also possible through BitTorrent DHT, both of you must use the `--torrent` option:

	otrtalk chat bob --torrent

### Getting latest version of otrtalk

To check and install latest version if available:

	otrtalk update

You can also manually install latest update with npm: (you way need to use sudo)

	npm -g update otrtalk


### A note on OTR

otrtalk uses the default otr4-em OTR module. If you are on a GNU/Linux or Mac OS X system you can configure new
profiles to use the native libotr on your system by installing the otr4 module
(Currently this only works if you are using node version pre v0.11)

	npm -g install otr4

use sudo if necessary

	sudo npm -g install otr4
