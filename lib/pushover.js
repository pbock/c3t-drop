'use strict';

const Pushover = require('pushover-notifications');
const bunyan = require('bunyan');

let config;
try {
	config = require('../config');
} catch (e) {
	// do nothing
}

const log = bunyan.createLogger({ name: 'c3t-drop-pushover' });

if (!config || !config.pushover) {
	log.warn('Pushover is not configured.');
	module.exports = function mockPush(message) {
		message = makeMessageObject(message);
		log.info(message, 'Did not send push because Pushover is not configured.');
		return Promise.resolve();
	}
} else {
	const push = new Pushover(config.pushover);

	let count = 0;
	module.exports = function p(message) {
		const pushId = count++;
		message = makeMessageObject(message);
		log.info(message, 'Attempting to send push (#%d)', pushId);
		return new Promise((resolve, reject) => {
			push.send(message, (err, result) => {
				if (err) {
					log.warn(err, 'Push #%d failed to send', pushId);
					reject(err);
				} else {
					log.info(result, 'Push #%d sent', pushId);
					resolve(result);
				}
			})
		})
	}
}

function makeMessageObject(input) {
	if (typeof input === 'string') return { message: input };
	return input;
}
