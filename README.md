# BrowserSocket
There is no native support for TCP client/server or UDP sockets in a web browser when using pure JavaScript.  That functionality is only available in node.js.  This package allows you to use standard TCP and UDP sockets in a web browser using just JavaScript (NOT node.js!)

## Install
npm install browser-socket

## Components
### BrowserSocket client
This is the actual implementation of the native sockets (TCP and UDP) using pure JavaScript.  You would basically create and use the sockets the same way you would do it in node.js.  Add the events are handled the same way as in node.js.  This class exposes the same methods, properties and events as the native <b>net.Socket</b> class in node.js: https://nodejs.org/api/net.html#net_class_net_socket.  

#### TCP client example
Let's say you want to create a TCP socket and connect to a remote endpoint.  That can be achieved using this code:

```
const BrowserSocket = require('browser-socket/client')

let opts = {
    host: '127.0.0.1', // Target TCP host
    port: 12345        // Target TCP port,
    relayUrl: 'ws://your-relay-server:8001'  // Relay server address
}

let socket = BrowserSocket.createTcpSocket(opts)  // Equivalent to net.connect(...) in node.js
socket.once('connect', () => { console.log('connect event') })
socket.once('error', (err) => { console.log('error event') })
socket.once('close', () => { console.log('close event') })

socket.close()
```

#### UDP client example
You can also create a UDP socket to send/receive data.  UDP socket exposes the same events as the node.js <b>dgram.Socket</b>: https://nodejs.org/api/dgram.html#dgram_class_dgram_socket.  To create a UDP socket, following code can be used:

```
let opts = {
    host: '127.0.0.1',  // UDP host
    port: 12345,  // UDP port
    relayUrl: 'ws://your-relay-server:8001'  // Relay server address
}

let socket = BrowserSocket.createUdpSocket(opts)
socket.once('error', (err) => { console.log('error event') })
socket.on('message' (msg) => {
    // Handle UDP messages...
})

socket.close()
```
#### TCP server example
You can even create a TCP server in a browser using pure JavaScript!  BrowserSocket's TCP server class exposes the same events as the <b>net.Server</b> of node.js: https://nodejs.org/api/net.html#net_class_net_server.

To create a TCP server and listen for connections:
```
let opts = {
    relayUrl: 'ws://your-relay-server:8001'  // Relay server address
}

let server = BrowserSocket.createTcpServer(opts)
server.on('connection', (client) => {
    // Handle new TCP connection...
})
server.on('error', (err) => {
    // Handle error...
})
server.on('created', (address) => {  // Fires when a TCP server instance has been created
    // Listen for incoming connections.
    server.listen(() => {
        console.log('Listening...')
    })
})
```

You could then communicate with this TCP server using a BrowserSocket client instance described and shown in the example above.


### BrowserSocket server
All TCP and UDP traffic between the client and the destination endpoint is facilitated and handled by this component.  As shown in the example above, you would point your client instance to it by specifying its address in the 'relayUrl' option.  This is a node.js component.
To create a BrowserSocket server instance:
```
const Server = require('../').Server
const hostname = 'localhost';
const config = {
    listenPort: 8001,
    connectionPool: {
        // Port range to use when assigning a port to each new TCP server listener created by the client (browser).
        portRange: {
            start: 4000,
            end: 5000
        }
    }
}

const server = new Server(config)

server.on('error', function (err) {
    console.error(err)
})

// Serve the clients.
server.listen(config.listenPort, hostname, function () {
    console.log('Listening on ' + hostname + ':' + config.listenPort);
})
```
Communication between the client and the server is done via WebSocket.

## Who is using BrowserSocket today
www.TorrentDaddy.com - web-based streaming torrent client.  You can stream and/or download any torrent in your web browser and you do not need to install ANY software!  Everything just runs in your browser!
