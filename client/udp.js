
const EventEmitter = require('events').EventEmitter
const Relay = require('./relay').Relay

class UdpSocket extends EventEmitter {
	constructor (options) {
		super()

		var self = this;
		let eventCallback = function(eventName, data) {
			switch (eventName) {
				case 'data': {
					self.emit('message', data)
					break
				}
				case 'error': {
					self.emit('error', data)
					break
				}
			}
		}
		
		this.relay = new Relay(options, 'udp-socket', eventCallback)
	}
	
	send (data, offset, length, port, hostname) {
		this.relay.send(data)
	}
}

exports.UdpSocket = UdpSocket	