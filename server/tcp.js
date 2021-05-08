
const Relay = require('../client/relay').Relay
const EventEmitter = require('events').EventEmitter

class TcpServer extends EventEmitter {
	constructor (options) {
		super()
		
		var self = this
		
		let eventCallback = function(eventName, data) {
			switch (eventName) {
				case 'created': {
					self._address = data
					self.emit('created', self._address)
					break
				}
				case 'error': {
					self.emit('error', data)
					break
				}
				case 'connection': {
					self.emit('connection', data)
					break
				}
				case 'data': {
					self.emit('message', data)
					break
				}
				case 'listening': {
					if (self.listeningCallback)
						self.listeningCallback(data)
					
					break
				}
			}
		}
		
		this.relay = new Relay(options, 'tcp-server', eventCallback)
	}
	
	listen (callback) {
		this.listeningCallback = callback
		this.relay.listenTcp()
	}
	
	address () {
		return this._address
	}
}

exports.TcpServer = TcpServer