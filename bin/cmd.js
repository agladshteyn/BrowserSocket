
const Server = require('../').Server
const hostname = '::';
const config = {
	listenPort: 8001,
	connectionPool: {
		portRange: {
			start: 4000,
			end: 4100
		}
	}
}

const server = new Server(config)

server.on('error', function (err) {
  console.error('ERROR: ' + err.message)
})
server.on('warning', function (err) {
  console.log('WARNING: ' + err.message)
})
server.on('update', function (addr) {
  console.log('update: ' + addr)
})
server.on('complete', function (addr) {
  console.log('complete: ' + addr)
})
server.on('start', function (addr) {
  console.log('start: ' + addr)
})
server.on('stop', function (addr) {
  console.log('stop: ' + addr)
})

server.listen(config.listenPort, hostname, function () {
	console.log('Listening on ' + hostname + ':' + config.listenPort);
})
