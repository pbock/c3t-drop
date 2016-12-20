'use strict';

const _ = require('lodash');

const Talk = require('./models/talks')('schedule.json', 'files/');
const log = console.log.bind(console);

// Talk.all()
// 	.then(log)
// 	.catch(e => console.error(e))

Talk.all()
	.then(talks => {
		const chars = _(talks)
			.map('title')
			.map(t => [...t])
			.flatten()
			.sortBy()
			.sortedUniq()
			.join('');
		console.log(chars);
		console.log(talks.map(t => [ t.title, t.slug ]));
	})
