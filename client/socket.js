
let browser_buffer = require('buffer')
let Buffer = browser_buffer.Buffer
const EventEmitter = require('events').EventEmitter
const stream = require('readable-stream')

class Socket extends stream.Duplex {
	constructor (options) {
		super()
		var self = this
		self.handshakeCompleted = false;
		self.messageQueue = [];
		self.protocol = '';
		
		if (!options)
		throw new Error('Options not specified')
	
		if (!options.RelayUrl || options.RelayUrl === '')
			throw new Error('Relay URL not specified')
		
		if (!options.Type || options.Type === '')
			throw new Error('Socket type not specified')
		
		let relayUrl = options.RelayUrl;
		// Remove trailing backslash.
		if (relayUrl.endsWith('/'))
			relayUrl = relayUrl.indexOf(0, relayUrl.length - 1);
		
		if (options.Type === 'udp') {
			relayUrl += '/udp';
			self.protocol = 'udp';
		}
		else if (options.Type === 'tcp') {
			relayUrl += '/tcp';
			self.protocol = 'tcp';
		}
		else
			throw new Error('Invalid protocol: ' + options.Type);
		
		
		let hostname = options.Host;
		let port = options.Port;
		
		self.socket = new WebSocket(relayUrl);
		self.socket.addEventListener('open', function (event) {
			// TODO: add credentials
			let obj = {
				Host: hostname,
				Port: port
			}
		
			self.socket.send(JSON.stringify(obj));
		});
		
		// Listen for messages
		self.socket.addEventListener('message', function (event) {
			
			// If handshake not yet completed, expect a JSON response that should contain the handshake status and any potential errors.
			if (self.handshakeCompleted === false) {
				let obj = JSON.parse(event.data);
				console.log('Handshake result:');
				console.log(obj);
				
				if (obj.Success !== true) {
					self.emit('error', obj.Error)
					return;
				}
				
				if (self.protocol === 'tcp')
					self.emit('connect')
				
				self.handshakeCompleted = true;
				 
				if (self.messageQueue.length > 0) {
					
					for (let i in self.messageQueue) {
						let msg = self.messageQueue[i];
						self.socket.send(msg);
					}
				}
			}
			else {
				var bufferPromise = event.data.arrayBuffer();
				bufferPromise.then(buffer => {
				
					var buf = Buffer.from(new Uint8Array(buffer))
						var rinfo = {
						address: hostname,
						family: 'IPv4',
						port: port,
						size: buf.length
					}
					
					self.emit('message', buf, rinfo)
				});
			}
		});
	}

	close() {
		this.socket.close();
		this.emit('close')
	}
	
	send(buffer, offset, length, port, address, callback) {
		if (this.handshakeCompleted === false)
			this.messageQueue.push(buffer);
		else
			this.socket.send(buffer);
	}
	
	write(data, encoding, cb) {
		if (cb)
			cb(null) // Signal that we're ready for more data
	}
	
	destroy(error) {
		
	}
	
	_read() {

	}
	
	_write() {

	}
}	
	
exports.Socket = Socket	
