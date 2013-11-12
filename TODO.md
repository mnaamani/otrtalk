* Add option to use custom 'network' profiles - JSON config file which stores
    interface
    network mode
    ip:port to bind to
    list of seeds

* Add 'zerotier' network profile to connect over zt0 interface to zerotier seed

* file transfer: the transfer will be encrypted using the extra symmetric key established as part of the OTR protocol.
  like [otr-tls](https://github.com/mnaamani/otr-tls)

* buddy can offer 'services' such as socks-proxy, http-proxy, port forwarding etc.. to connected buddy, ala ssh

* add TURN server support, TLS for access from behind a symmetric NAT or to go over TOR network.

* Web UI - launch a browser and communicate to local otrtalk process with websockets?
