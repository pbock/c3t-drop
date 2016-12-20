'use strict';

const chokidar = require('chokidar');
const path = require('path');
const fs = require('fs-promise');
const _ = require('lodash');

function slugify(string, lang='en') {
	let s = ({
		en: { equals: 'equals', ampersand: 'and', plus: 'plus' },
		de: { equals: 'gleich', ampersand: 'und', plus: 'plus' },
	})[lang];
	if (!s) s = s.en;

	return string.toLowerCase()
		.replace(/ä/g, 'ae')
		.replace(/ö/g, 'oe')
		.replace(/ü/g, 'ue')
		.replace(/ß/g, 'ss')
		.replace(/é/g, 'e')
		.replace(/&/g, s.ampersand)
		.replace(/\+/g, s.plus)
		.replace(/=/g, s.equals)
		.replace(/['"‘’“”«»]/g, '')
		.replace(/[^a-z0-9]+/g, ' ')
		.trim()
		.replace(/\s+/g, '-')
}

class File {
	constructor(filePath, meta) {
		this.name = path.basename(filePath);
		this._path = filePath;
		this.meta = meta;
	}

	read() {
		return fs.createReadStram(this._path);
	}
}

module.exports = function(scheduleJsonPath, fileRootPath) {
	let talks = [], talksBySlug = {}, files = {};
	updateTalks();

	let talksReady = updateTalks();

	class Talk {
		constructor(talk, day = null) {
			this.id = talk.guid;
			this.date = new Date(talk.date);
			this.time = talk.start;
			this.duration = talk.duration;
			this.room = talk.room;
			this.title = talk.title;
			this.subtitle = talk.subtitle || undefined;
			this.slug = slugify(talk.title, talk.language);
			this.track = talk.track;
			this.type = talk.type;
			this.language = talk.language;
			this.abstract = talk.abstract || undefined;
			this.day = (day === null) ? undefined : day;
			const dayString = (day === null) ? 'day-unknown' : `day-${day}`;
			this.filePath = path.resolve(fileRootPath, dayString, this.slug);

			this.speakers = talk.persons.map(p => p.public_name);

			talks.push(this);
			talksBySlug[this.slug] = this;

			this._filesCache = null;
		}

		get files() {
			if (!this._filesCache) this._filesCache = _(files)
				.map((meta, filePath) => ({ meta, path: filePath }))
				.filter((file) => !file.meta.isDir && file.path.indexOf(this.filePath) === 0)
				.map((file) => new File(file.path, file.meta))
				.value();
			return this._filesCache;
		}

		addFile(name) {
			const filePath = path.resolve(this.filePath, name);
			return fs.createWriteStream(filePath);
		}
	}

	Talk.all = () => {
		return Promise.all([ talksReady, filesReady ]).then(() => talks);
	}

	Talk.findBySlug = (slug) => {
		return Promise.all([ talksReady, filesReady ]).then(() => talksBySlug[slug]);
	}

	function updateTalks() {
		return fs.readFile(scheduleJsonPath)
			.then(JSON.parse)
			.then(({ schedule }) => {
				talks = [];
				talksBySlug = {};

				_.each(schedule.conference.days, (day) => {
					_.each(day.rooms, (talks) => {
						_.each(talks, (talk) => {
							new Talk(talk, day.index + 1)
						})
					})
				})
			})
			.then( () => Promise.all(talks.map(t => fs.ensureDir(t.filePath))) )
	}


	let filesReady = new Promise((resolve) => {
		const fileWatcher = chokidar.watch(fileRootPath, {
			alwaysStat: true,
		});
		fileWatcher
			.on('add', addFile)
			.on('change', addFile)
			.on('unlink', removeFile)
			.on('addDir', addDir)
			.on('unlinkDir', removeDir)
			.on('error', (e) => { console.error(e.stack); process.exit(1) })
			.on('ready', () => {
				console.log('Initial scan complete. Ready for changes');
				resolve();
			})
	})

	const scheduleWatcher = chokidar.watch(scheduleJsonPath);
	scheduleWatcher.on('change', () => {
		console.log('Schedule changed; updating');
		talksReady = Promise.all([ talksReady, filesReady ]).then(updateTalks);
	})

	function addFile(p, stats) {
		p = path.resolve(p);
		files[p] = { stats, isDir: false };
	}
	function removeFile(p) {
		p = path.resolve(p);
		files[p] = null;
	}
	function addDir(p) {
		p = path.resolve(p);
		files[p] = { isDir: true };
	}
	function removeDir(p) {
		p = path.resolve(p);
		files[p] = null;
	}

	return Talk;
}
