
class TcpConnMgr {
	constructor (options) {
		this.clientIdAutoNumber = 1
		this.connections = {}
	}
	
	add (conn) {
		let clientId = this.clientIdAutoNumber
		this.clientIdAutoNumber++
		if (this.clientIdAutoNumber === Number.MAX_SAFE_INTEGER)
			this.clientIdAutoNumber = 1;
		
		this.connections[clientId] = conn
		return clientId
	}
	
	find (clientId) {
		return this.connections[clientId]
	}
	
	remove (clientId) {
		if (this.connections[clientId])
			delete this.connections[clientId]
	}
	
	count () {
		let connCount = 0
		for (let i in this.connections) {
			if (this.connections.hasOwnProperty(i))
				connCount++
		}
		
		return connCount
	}
}

exports.TcpConnMgr = TcpConnMgr	