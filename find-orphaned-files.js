'use strict';

const path = require('path');
const _ = require('lodash');

const schedulePath = path.resolve(__dirname, 'schedule.json');
const filesBase = path.resolve(__dirname, 'files/');

const Talk = require('./models/talks')(schedulePath, filesBase, false);

Promise.all([ Talk.all(), Talk._getAllFiles() ])
	.then(([ talks, files ]) => {
		_(files)
			.each((meta, filePath) => {
				if (!meta.isDir) return;
				// Ignore first-level directories
				const nestLevel = filePath.split('/').length - schedulePath.split('/').length;
				if (nestLevel < 2) return;

				const matchingTalk = _(talks).find(t => t.filePath === filePath);
				if (!matchingTalk) {
					console.warn(filePath);
				}
			})
	})
	.then(() => process.exit())
