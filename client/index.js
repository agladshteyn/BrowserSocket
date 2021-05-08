
const TcpSocket = require('./tcp').TcpSocket
const UdpSocket = require('./udp').UdpSocket
const TcpServer = require('../server/tcp').TcpServer

exports.createTcpSocket = function (opts) {
  return new TcpSocket(opts)
}

exports.createTcpServer = function (opts, onSuccess, onFailure) {
  return new TcpServer(opts, onSuccess, onFailure)
}

exports.createUdpSocket = function (opts) {
  return new UdpSocket(opts)
}
