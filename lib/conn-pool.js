
class ConnPool {
	constructor (options) {
		if (!options)
			throw new Error('Options not specified')
		
		if (!options.portRange)
			throw new Error('Port range not specified')
		
		if (!options.portRange.start || options.portRange.start <= 0)
			throw new Error('Start port not specified')
		
		if (!options.portRange.end || options.portRange.end <= 0)
			throw new Error('End port not specified')
		
		this.ports = {}
		for (let i = options.portRange.start; i <= options.portRange.end; i++) {
			this.ports[i] = true
		}
	}
	
	get availablePort() {
		for (let port in this.ports) {
			if (this.ports.hasOwnProperty(port)) {
				if (this.ports[port] === true) {
					this.ports[port] = false
					return port
				}
			}
		}
		
		return -1
	}
	
	freePort(port) {
		this.ports[port] = true
	}
}

exports.ConnPool = ConnPool	