'use strict';

const _ = require('lodash');

const Talk = require('./models/talks')('schedule.json', 'files/');
const log = console.log.bind(console);

Talk.findBySlug('0en-und-1en-auf-dem-acker')
	.then(talk => console.log(talk.files))
	.catch(e => console.error(e.stack))
