'use strict';

const crypto = require('crypto');
const fs = require('fs');

module.exports = function streamHash(stream, algorithm='sha1', encoding='utf8') {
	if (typeof stream === 'string') stream = fs.createReadStream(stream);
	const hash = crypto.createHash(algorithm);
	return new Promise((resolve, reject) => {
		stream.on('data', (chunk) => hash.update(chunk, encoding));
		stream.on('end', () => resolve(hash.digest('hex')));
		stream.on('error', reject);
	})
}
