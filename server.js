const http = require('http')
const WebSocketServer = require('ws').Server
const dgram = require('dgram')
const EventEmitter = require('events')
const net = require('net')
const ConnPool = require('./lib/conn-pool').ConnPool
const TcpConnMgr = require('./lib/tcp-conn-mgr').TcpConnMgr
const util = require('./lib/util')
const winston = require('winston');

// Incoming messages.
const IN_MSG_UDP_CREATE_SOCKET = 0x01
const IN_MSG_TCP_CREATE_SOCKET = 0x02
const IN_MSG_TCP_CREATE_SERVER = 0x03
const IN_MSG_TCP_SERVER_LISTEN = 0x04
const IN_MSG_DATA = 0x05

// Outgoing messages.
const OUT_MSG_DATA = 0x06
const OUT_MSG_CONNECTION_TIMEOUT = 0x07
const OUT_MSG_CONNECTION_RECEIVED = 0x08
const OUT_MSG_CONNECTION_SUCCEEDED = 0x09
const OUT_MSG_CONNECTION_CLOSED = 0x10
const OUT_MSG_TCP_SERVER_LISTENING = 0x11
const OUT_MSG_HANDSHAKE_SUCCESS = 0x12
const OUT_MSG_ERROR = 0x13

// Types.
const TYPE_UDP_SOCKET = 0x01
const TYPE_TCP_SOCKET = 0x02
const TYPE_TCP_SERVER = 0x03

let logger

class Server extends EventEmitter {
	constructor (opts = {}) {
		super()

		// Initialize logger.
		logger = winston.createLogger({
		  format: winston.format.json(),
		  transports: [
			new winston.transports.File({ filename: 'error.log', level: 'error' }),
			new winston.transports.File({ filename: 'info.log', level: 'info' })
		  ],
		});

		if (process.env.NODE_ENV !== 'production') {
		  logger.add(new winston.transports.Console({
			format: winston.format.simple(),
		  }));
		}

		this.http = null
		this.ws = null
		this._listenCalled = false
		this.listening = false
		this.destroyed = false
		this.sockets = {}
		this.tcpServers = {}
		this.connPool = new ConnPool(opts.connectionPool)
		
		this._logInfo('Number of free TCP server ports: ' + this.connPool.numAvailPorts)
		
		this.http = http.createServer()
        this.http.on('error', err => { this._onError(err) })
        this.http.on('listening', onListening)
		
		var self = this
		process.nextTick(() => {
			try {
			  this.http.on('request', (req, res) => {
				if (res.headersSent) return
				// For websocket trackers, we only need to handle the UPGRADE http method.
				// Return 404 for all other request types.
				res.statusCode = 404
				res.end('404 Not Found')
			  })
			}
			catch (err) {
			   self._logError(err)
			}
        })
		
		this.ws = new WebSocketServer({
			server: this.http,
			perMessageDeflate: false,
			clientTracking: false
		})
		
		this.ws.address = () => {
			return this.http.address()
		}
		
		this.ws.on('error', err => { this._onError(err) })
		this.ws.on('connection', (socket, req) => {
		// Note: socket.upgradeReq was removed in ws@3.0.0, so re-add it.
		// https://github.com/websockets/ws/pull/1099
			socket.upgradeReq = req
			this.onWebSocketConnection(socket)
		})

		function onListening () {
			self.listening = true
			self.emit('listening')
	   }	
	}
	
	_logError (err) {
		logger.log({
		  level: 'error',
		  message: util.FormatError(err)
		});
	}
	
	_logInfo (message) {
		logger.log({
		  level: 'info',
		  message: message
		});
	}
	
	_onError (err) {
		this._logError(err)
		this.emit('error', err)
	}

	listen (...args) /* port, hostname, onlistening */{
		if (this._listenCalled || this.listening) throw new Error('server already listening')
		this._listenCalled = true

		const lastArg = args[args.length - 1]
		if (typeof lastArg === 'function') this.once('listening', lastArg)

		const port = util.ToNumber(args[0]) || args[0] || 0
		const hostname = typeof args[1] !== 'function' ? args[1] : undefined

		//debug('listen (port: %o hostname: %o)', port, hostname)
	
		function isObject (obj) {
		  return typeof obj === 'object' && obj !== null
		}

		const httpPort = isObject(port) ? (port.http || 0) : port

		// binding to :: only receives IPv4 connections if the bindv6only sysctl is set 0,
		// which is the default on many operating systems
		const httpHostname = isObject(hostname) ? hostname.http : hostname

		if (this.http) this.http.listen(httpPort, httpHostname)
	}

	close (cb = noop) {
		this.listening = false
		this.destroyed = true

		if (this.ws) {
		  try {
			this.ws.close()
		  } catch (err) {}
		}

		try {
			if (this.http) this.http.close(cb)
			else cb(null)
		}
		catch (err) {}
	}
	
	onWebSocketConnection (socket, opts = {}) {
		socket.onSend = err => {
		  this._onWebSocketSend(socket, err)
		}
		
		socket.onMessageBound = params => {
		  this._onWebSocketRequest(socket, opts, params)
		}
		socket.on('message', socket.onMessageBound)
		
		socket.onErrorBound = err => {
			this._onWebSocketError(socket, err)
		}
		socket.on('error', socket.onErrorBound)
		
		socket.onCloseBound = () => {
			this._onWebSocketClose(socket)
		}
		socket.on('close', socket.onCloseBound)
	}
	
	_validateCreateSocketParams (socket, params, protocol) {
		// Make sure host is specified.
		if (!params.host || params.host === '') {
			this._reportError(new Error(protocol + ' host not specified'), socket)
			return false;
		}
		// Make sure port is specified.
		if (!params.port || params.port === '') {
			this._reportError(new Error(protocol + ' port not specified'), socket)
			return false;
		}
		
		return true;
	}

	_onWebSocketRequest (socket, opts, params) {
		let self = this;
		let message;
		try {
			message = util.ParseMessage(params)
		}
		catch (err) {
			self._reportError(err, socket)
		}
		
		// Handle message.
		switch (message.type) {
			case IN_MSG_UDP_CREATE_SOCKET: { 
				let json;
				try {
					json = JSON.parse(message.data);
				}
				catch (err) {
					self._reportError(new Error('ERROR parsing JSON. ' + util.FormatError(err)), socket)
				}
	
				if (self._validateCreateSocketParams(socket, json, 'UDP') === false)
					return;
				
				// Create new socket.
				try {
					socket.proxy = self._createProxyObject(socket, json, TYPE_UDP_SOCKET)
					self._sendSuccessMessage(socket)
				}
				catch (err) {
					self._reportError(err, socket)
				}
				
				break
			}
			case IN_MSG_TCP_CREATE_SOCKET: {
				let json;
				try {
					json = JSON.parse(message.data);
				}
				catch (err) {
					self._reportError(err, socket)
				}
	
				if (self._validateCreateSocketParams(socket, json, 'TCP') === false)
					return;
					
				try {	
					// If client ID has been specified, find the client TCP socket. Otherwise, creat a new one.
					if (json.clientId && json.clientId > 0) {
						// First, find the TCP server by port number.
						let tcpServer = self.tcpServers[json.port]
						if (!tcpServer) {
							this._sendErrorMessage(socket, 'Invalid request')
							return
						}
			
						// Now find the client TCP socket by ID.
						let clientSocket = tcpServer.connMgr.find(json.clientId)
						if (clientSocket) {
							socket.proxy = { type: TYPE_TCP_SOCKET, data: json, object: clientSocket }
							self._tcpSocketAddEvents(clientSocket, socket, (eventName) => {
								switch (eventName) {
									case 'close': { // If connection is closed, remove the client TCP socket from the collection
										tcpServer.connMgr.remove(json.clientId)
										break
									}
								}
							})
							self._sendSuccessMessage(socket)
						}
						else {
							self._reportError(new Error('Unable to find client socket'), socket, false)
							return
						}
					}	
					else {
						socket.proxy = self._createProxyObject(socket, json, TYPE_TCP_SOCKET)
						self._sendSuccessMessage(socket)
					}
				}
				catch (err) {
					self._reportError(err, socket)
				}
				
				break
			}
			case IN_MSG_TCP_CREATE_SERVER: {
				try {
					socket.proxy = self._createProxyObject(socket, {}, TYPE_TCP_SERVER)
					self._sendSuccessMessage(socket, JSON.stringify({
						'address': {
							'port': socket.proxy.data.port,
							'family': 'IPv4'
						}
					}))
				}
				catch (err) {
					self._reportError(err, socket)
				}

				break
			}
			case IN_MSG_TCP_SERVER_LISTEN: {
				try {
					if (!socket.proxy || !socket.proxy.object) { // Should never happen
						self._sendErrorMessage(socket, 'TCP server has not been created')
						return
					}
					 
					socket.proxy.object.listen(socket.proxy.data.port, () => {
						self._sendMessage(socket, OUT_MSG_TCP_SERVER_LISTENING)
					})
				}
				catch (err) {
					self._reportError(err, socket)
				}
		
				break
			}
			case IN_MSG_DATA: {
				try {
					if (socket.proxy && socket.proxy.object) {
						switch (socket.proxy.type) {
							case TYPE_UDP_SOCKET: {
								socket.proxy.object.send(message.data, 0, message.length, socket.proxy.data.port, socket.proxy.data.host);
								break
							}
							case TYPE_TCP_SOCKET: {
								socket.proxy.object.write(message.data)
								break
							}
							default: {
								self._sendErrorMessage(socket, 'Unknown socket type')
							}
						}
					}
				}
				catch (err) {
					self._reportError(err, socket)
				}
		
				break
			}
			default: { // Unknown message type
				self._sendErrorMessage(socket, 'Unknown message type: ' + mesage.type)
			}
		}
	}
		
	_onWebSocketSend (socket, err) {

	}
	
	_onWebSocketClose (socket) {
		// Cleanup.
		if (socket.proxy && socket.proxy.object && socket.proxy.type === TYPE_TCP_SERVER) {
			try {
				socket.proxy.object.close()
			}
			catch (err) {
				this._reportError(err, socket)
			}
		}
	}
		
	_onWebSocketError (socket, err) {
		this._logError(err)
	}
	
	_reportError (err, socket, close = true) {
		this._logError(err)
		if (socket) {
			try {
				this._sendErrorMessage(socket, err)
			}
			catch (err) {}
			
			if (close === true) {
				try {
					socket.close()
				}
				catch (err) {}
			}
		}
	}
	
	_sendErrorMessage (socket, error) {
		let msg = error
		if (!msg)
			msg = 'Unknown error'
		
		this._sendMessage (socket, OUT_MSG_ERROR, msg)
	}
	
	_sendMessage (socket, msgType, data) {
		try {
			let outBuf;
			if (data) {
				let dataLen = 0
				let buf
				if (typeof data === 'string') {
					dataLen = Buffer.byteLength(data)
					buf = Buffer.from(data)
				}
				else if (typeof data === 'number') {
		
					buf = Buffer.from(util.NumberToBytes(data))
					dataLen = buf.length
				}
				else if (data instanceof Error) {
					let msg = data.name + ' ' + data.message
					dataLen = Buffer.byteLength(msg)
					buf = Buffer.from(msg)
				}
				else if (typeof data === 'object')
				{
					if (data.copy)
						buf = data
					else
						buf = Buffer.from(data)
					
					dataLen = buf.length
				}
				else
					throw new Error('Unknown data type')
				
				outBuf = Buffer.alloc(dataLen+1)
				outBuf[0] = msgType
				buf.copy(outBuf, 1, 0)
			}
			else {
				outBuf = Buffer.alloc(1)
				outBuf[0] = msgType
			}

			socket.send(outBuf, socket.onSend);
		}
		catch (err) {
			this._reportError(err, socket)
		}
	}
	
	_sendSuccessMessage (socket, jsonString) {
		this._sendMessage (socket, OUT_MSG_HANDSHAKE_SUCCESS, jsonString)
	}

	_createProxyObject (socket, params, type) {
		let self = this;
		let proxy = { type: type, data: params }
		switch (type) {
			case TYPE_UDP_SOCKET: {
				self._logInfo('Creating UDP socket. Host: ' + params.host + ', port: ' + params.port + '.')
				proxy.object = self._createUdpSocket(socket, params.host, params.port)
				break
			}
			case TYPE_TCP_SOCKET: {
				self._logInfo('Creating TCP socket. Host: ' + params.host + ', port: ' + params.port + '.')
				proxy.object = self._createTcpSocket(params.host, params.port, socket)
				self._tcpSocketAddEvents(proxy.object, socket, () => {})
				break
			}
			case TYPE_TCP_SERVER: {
				let port = self.connPool.availablePort
				if (port === -1)
					throw new Error('No available ports')
			
				proxy.data.port = port
				proxy.connMgr = new TcpConnMgr()
		
				let eventCallback = function(eventName, data) {
					switch (eventName) {
						case 'connection': {
							let conn = data
							let connId = proxy.connMgr.add(conn)
							let remoteConn = {
								id: connId,
								port: port
							}
							
							self._logInfo('Received TCP connection. Remote address: ' + conn.remoteAddress + '. Listening port: ' + port + '. Total connections: ' + proxy.connMgr.count() + '.')
							self._sendMessage(socket, OUT_MSG_CONNECTION_RECEIVED, JSON.stringify(remoteConn))	
							break
						}
						case 'close': {
							 
							self._logInfo('TCP server on port ' + port + ' was closed')
							 
							// Cleanup.
							try {
								if (self.tcpServers[port])
									delete self.tcpServers[port]
							}
							catch (err) {}
					
							try {
								socket.close()
								self.connPool.freePort(port)
							}
							catch (err) {
								self._reportError(err, socket)
							}
							
							self._logInfo('Free ports remaining: ' + self.connPool.numAvailPorts)
							
							break
						}
						case 'error': {
							self._sendMessage(socket, OUT_MSG_ERROR, data)
							break
						}
					}
				}
				
				self._logInfo('Creating TCP server on port ' + port + '. Free ports remaining: ' + self.connPool.numAvailPorts)
	
				proxy.object = self._createTcpServer(socket, eventCallback)
				self.tcpServers[port] = proxy
				break
			}
		}
		
		return proxy
	}
	
	_createTcpServer(socket, eventCallback) {
		let server = net.createServer()
		server.on('connection', (conn) => {
			if (eventCallback)
				eventCallback('connection', conn)
		})
		server.on('close', (conn) => {
			if (eventCallback)
				eventCallback('close', conn)
		})
		server.on('error', (err) => {
			if (eventCallback)
				eventCallback('error', err)
		})

		return server
	}
	
	_tcpSocketAddEvents(tcpSocket, socket, eventCallback) {
		tcpSocket.on('connect', () => {
			this._sendMessage(socket, OUT_MSG_CONNECTION_SUCCEEDED)
		});
		tcpSocket.on('close', () => {
			if (eventCallback)
				eventCallback('close')
			
			this._sendMessage(socket, OUT_MSG_CONNECTION_CLOSED)
			
		});
		tcpSocket.on('data', (data) => {
			this._sendMessage(socket, OUT_MSG_DATA, data)
		});
		
		tcpSocket.on('error', (error) => {
			this._sendMessage(socket, OUT_MSG_ERROR, error)
		});
		
		tcpSocket.on('timeout', () => {
			if (eventCallback)
				eventCallback('timeout')
			
			this._sendMessage(socket, OUT_MSG_CONNECTION_TIMEOUT)
		});
	}
	
	_createTcpSocket(host, port) {
		let tcpSocket = net.connect({ host: host, port: port })
		return tcpSocket
	}
		
	_createUdpSocket(socket, host, port) {
		let udpSocket = dgram.createSocket('udp4')
		udpSocket.on('message', (msg, rInfo) => {
			this._sendMessage(socket, OUT_MSG_DATA, msg)
		});
		udpSocket.on('error', (error) => {
			this._sendMessage(socket, OUT_MSG_ERROR, error)
		});
		udpSocket.on('close', (error) => {

		});
	
		return udpSocket;
	}
}

function noop () {}

module.exports = Server