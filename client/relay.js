
let browser_buffer = require('buffer')
let Buffer = browser_buffer.Buffer
const EventEmitter = require('events').EventEmitter
const stream = require('readable-stream')
const util = require('../lib/util')
const tcp = require('./tcp')

const OUT_MSG_UDP_CREATE_SOCKET = 0x01
const OUT_MSG_TCP_CREATE_SOCKET = 0x02
const OUT_MSG_TCP_CREATE_SERVER = 0x03
const OUT_MSG_TCP_SERVER_LISTEN = 0x04
const OUT_MSG_DATA = 0x05

const IN_MSG_DATA = 0x06
const IN_MSG_CONNECTION_TIMEOUT = 0x07
const IN_MSG_CONNECTION_RECEIVED = 0x08
const IN_MSG_CONNECTION_SUCCEEDED = 0x09
const IN_MSG_CONNECTION_CLOSED = 0x10
const IN_MSG_TCP_SERVER_LISTENING = 0x11
const IN_MSG_HANDSHAKE_SUCCESS = 0x12
const IN_MSG_ERROR = 0x13


class Relay extends EventEmitter {
	constructor (options, type, eventCallback) {
		super()
		var self = this
		self.handshakeCompleted = false;
		self.messageQueue = [];
		self.protocol = '';
		self.eventCallback = eventCallback;

		if (!self.eventCallback)
			throw new Error('Event callback function not supplied')
	
		if (!options)
			throw new Error('Options not specified')
	
		if (!options.relayUrl || options.relayUrl === '')
			throw new Error('Relay URL not specified')
		
		if (!type || type === '')
			throw new Error('Socket type not specified')
		
		let msgType;
		if (type === 'udp-socket') {
			msgType = OUT_MSG_UDP_CREATE_SOCKET;
			
			if (!options.host || options.host === '')
				throw new Error('Host not specified');
			
			if (!options.port || options.port <= 0)
				throw new Error('Port not specified');
		}
		else if (type === 'tcp-socket') {
			msgType = OUT_MSG_TCP_CREATE_SOCKET;
			
			if (!options.host || options.host === '')
				throw new Error('Host not specified');
			
			if (!options.port || options.port <= 0)
				throw new Error('Port not specified');
		}
		else if (type === 'tcp-server')
			msgType = OUT_MSG_TCP_CREATE_SERVER;
		else
			throw new Error('Invalid protocol: ' + type);
		
		let payload
		if (msgType === OUT_MSG_UDP_CREATE_SOCKET || msgType === OUT_MSG_TCP_CREATE_SOCKET) {
			payload = {}
			payload.host = options.host
			payload.port = options.port
			
			if (options.clientId)
				payload.clientId = options.clientId
		}
		
		self.socket = new WebSocket(options.relayUrl);
		self.socket.addEventListener('open', function (event) {
			let obj
			if (payload)
				obj = Buffer.from(JSON.stringify(payload))
	
			self._send(obj, msgType)
		});
		
		// Listen for messages from the relay server.
		self.socket.addEventListener('message', function (event) {
			var bufferPromise = event.data.arrayBuffer();
			bufferPromise.then(buffer => {
				var buf = Buffer.from(new Uint8Array(buffer))
				var rinfo = {
					address: options.host,
					family: 'IPv4',
					port: options.port,
					size: buf.length
				}
				
				let msgType = buf[0] // First byte is the message type indicator
				switch (msgType) {
					case IN_MSG_HANDSHAKE_SUCCESS: {
						let data = buf.slice(1, buf.length)
						if (self.handshakeCompleted !== true) {
							if (type === 'tcp-server') {
								let obj = JSON.parse(data);
								self.eventCallback('created', obj.address)
							}
							
							self.handshakeCompleted = true;
							self._drainQueue()
						}
		
						break
					}
					case IN_MSG_DATA: {
						let data = buf.slice(1, buf.length)
						self.eventCallback('data', data)
						break
					}
					case IN_MSG_ERROR: {
						self.eventCallback('error') // TODO: attach actual error
						break
					}
					case IN_MSG_CONNECTION_CLOSED: {
						self.eventCallback('close')
						break
					}
					case IN_MSG_CONNECTION_TIMEOUT: {
						self.eventCallback('timeout')
						break
					}
					case IN_MSG_CONNECTION_SUCCEEDED: {
						self.eventCallback('connect')
						break
					}
					case IN_MSG_TCP_SERVER_LISTENING: {
						self.eventCallback('listening')
						break
					}
					case IN_MSG_CONNECTION_RECEIVED: { // Connection from a remote peer
						let data = buf.slice(1, buf.length)
						let str = Buffer.from(data).toString()
						let remoteConn = JSON.parse(str);
						let relayUrlParsed = util.ParseUrl(options.relayUrl)
						let relayUrlHost = relayUrlParsed.host
						let relayUrlPort = relayUrlParsed.port	
						let opts = {
							host: relayUrlHost,
							port: remoteConn.port,
							clientId: remoteConn.id,
							relayUrl: options.relayUrl,
						}
						// Object representing the remote client.
						let client = new tcp.TcpSocket(opts, 'tcp-socket', () => {})
						self.eventCallback('connection', client)
						break
					}
					default: {
						throw new Error('Uknown message type')
					}
				}
			});
		});
	}
	
	_drainQueue () {
		if (this.messageQueue.length > 0) {	
			for (let i in this.messageQueue) {
				let msg = this.messageQueue[i];
				this._send(msg, OUT_MSG_DATA);
			}
		}
	}

	close () {
		this.socket.close();
		this.emit('close')
	}
	
	_send (buffer, msgType) {
		let newBuf
		if (buffer) {
			let len = Buffer.byteLength(buffer)
			newBuf = Buffer.alloc(len+1)
			buffer.copy(newBuf, 1, 0)
			newBuf[0] = msgType
		}
		else {
			newBuf = Buffer.alloc(1)
			newBuf[0] = msgType
		}

		this.socket.send(newBuf)
	}
	
	listenTcp () {
		this._send(null, OUT_MSG_TCP_SERVER_LISTEN)
	}
	
	send (buffer) {
		if (this.handshakeCompleted === false)
			this.messageQueue.push(buffer);
		else
			this._send(buffer, OUT_MSG_DATA);
	}
}	
	
exports.Relay = Relay	
