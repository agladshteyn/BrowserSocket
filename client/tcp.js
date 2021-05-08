
const Relay = require('./relay').Relay
const stream = require('readable-stream')

class TcpSocket extends stream.Duplex {
	constructor (options) {
		super()
		
		this.address = options.host
		this.port = parseInt(options.port)
		
		var self = this;
		let eventCallback = function(eventName, data) {
			switch (eventName) {
				case 'data': {
					self.emit('data', data)
					break
				}
				case 'error': {
					self.emit('error', data)
					break
				}
				case 'connect': {
					self.emit('connect')
					break
				}
				case 'timeout': {
					self.emit('timeout')
					break
				}
				case 'close': {
					self.emit('close')
					break
				}
			}
		}
		
		this.relay = new Relay(options, 'tcp-socket', eventCallback)
	}
	
	write (data, encoding, callback) {
	
		this.relay.send(data)
	}
	
	_write () {
		
	}
	
	_read () {
		
	}
	
	destroy () {
		this.relay.close()
	}
	
	get remoteAddress () {
		
		return this.address  
	}
	
	get remotePort () {
		
		return this.port  
	}
}

exports.TcpSocket = TcpSocket	