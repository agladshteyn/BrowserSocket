let autoNumber = 1

function randomNumber() {
	let num = autoNumber;
	autoNumber++;
	if (num === Number.MAX_SAFE_INTEGER)
		autoNumber = 1;
	
	return num;
}

function numberToBytes(num) {
	let y = Math.floor(num/2**32);
	return [y,(y<<8),(y<<16),(y<<24), num,(num<<8),(num<<16),(num<<24)].map(z=> z>>>24)
}

function bytesToNumber(byteArr) {
    return byteArr.reduce((a,c,i)=> a+c*2**(56-i*8),0)
}

function parseUrl(url) {
	let cleanUrl = url
	let idx = cleanUrl.indexOf('://')
	if (idx !== -1)
		cleanUrl = cleanUrl.substr(idx+3)
	
	let ary = cleanUrl.split(':')
	let obj = {}
	try {
	if (ary.length === 2)
		obj.host = ary[0]
		obj.port = parseInt(ary[1])
	}
	catch (err) {}
	return obj
}

function parseMessage (data) {
	let payload = data.slice(1, data.length)
	return {
		type: data[0],
		data: payload,
		length: data.length - 1
	}
}

function toNumber (x) {
	x = Number(x)
	return x >= 0 ? x : false
}

function formatError(error) {
	let formatted = ''
	if (!error)
		return formatted
	
	if (error instanceof Error)
		formatted = error.name + ' ' + error.message
	else
		formatted = error

	return formatted
}

exports.RandomNumber = randomNumber
exports.NumberToBytes = numberToBytes
exports.BytesToNumber = bytesToNumber
exports.ParseUrl = parseUrl
exports.ParseMessage = parseMessage
exports.ToNumber = toNumber
exports.FormatError = formatError

