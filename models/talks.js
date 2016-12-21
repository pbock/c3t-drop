'use strict';

const chokidar = require('chokidar');
const path = require('path');
const fs = require('fs-promise');
const _ = require('lodash');

const COMMENT_EXTENSION = '.comment.txt';

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

function sortTitle(title) {
	return title.toLowerCase()
		.replace(/^(a|an|the|der|die|das) /, '')
}

function redactFilename(filename) {
	const extension = path.extname(filename);
	const base = path.basename(filename, extension);
	if (base.length < 4) return base + extension;
	return base.substr(0, 2) + '[…]' + base.substr(-2) + extension;
}

class File {
	constructor(filePath, meta) {
		this.name = path.basename(filePath);
		this.redactedName = redactFilename(this.name);
		this._path = filePath;
		this.meta = meta;
	}

	read() {
		return fs.createReadStram(this._path);
	}
}

function wait(timeout) {
	return function(...args) {
		return new Promise(resolve => setTimeout(() => resolve(...args), timeout));
	}
}

module.exports = function(scheduleJsonPath, fileRootPath) {
	let talks = [], sortedTalks = [], talksBySlug = {}, files = {}, filesLastUpdated = null;
	updateTalks();

	let talksReady = updateTalks();

	class Talk {
		constructor(talk, day = null) {
			this.id = talk.guid;
			this.date = new Date(talk.date);
			this.time = talk.start;
			this.duration = talk.duration;
			this.room = talk.room;
			this.title = talk.title.trim();
			this.sortTitle = sortTitle(this.title);
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
			if (!this._filesCache || this._filesCacheLastUpdated < filesLastUpdated) {
				this._filesCache = _(files)
					.map((meta, filePath) => ({ meta, path: filePath }))
					.filter((file) => !file.meta.isDir && !file.meta.isComment && file.path.indexOf(this.filePath) === 0)
					.map((file) => new File(file.path, file.meta))
					.value();
				this._filesCacheLastUpdated = Date.now();
			}
			return this._filesCache;
		}

		readFile(name) {
			return fs.createReadStream(path.resolve(this.filePath, name));
		}

		addComment(comment) {
			return fs.writeFile(path.resolve(this.filePath, `${Date.now()}${COMMENT_EXTENSION}`), comment)
				.then(() => this)
		}

		addFiles(files) {
			return Promise.all(files.map(file => fs.rename(file.path, path.resolve(this.filePath, file.originalname))))
				.then(wait(100)) // HACK: prevent Promise from resolving before watcher fired and file list has been rebuilt
				.then(() => this)
		}
	}

	Talk.all = () => {
		return Promise.all([ talksReady, filesReady ]).then(() => talks);
	}

	Talk.allSorted = () => {
		return Promise.all([ talksReady, filesReady ]).then(() => sortedTalks);
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
			.then( () => sortedTalks = _.sortBy(talks, 'sortTitle') )
			.then( () => Promise.all(talks.map(t => fs.ensureDir(t.filePath))) )
	}


	let filesReady = new Promise((resolve) => {
		const fileWatcher = chokidar.watch(fileRootPath, {
			alwaysStat: true,
			ignored: '**/.DS_Store',
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
		const isComment = p.substr(-COMMENT_EXTENSION.length) === COMMENT_EXTENSION;
		files[p] = { stats, isDir: false, isComment };
		filesLastUpdated = Date.now();
	}
	function removeFile(p) {
		p = path.resolve(p);
		delete files[p];
		filesLastUpdated = Date.now();
	}
	function addDir(p) {
		p = path.resolve(p);
		files[p] = { isDir: true };
		filesLastUpdated = Date.now();
	}
	function removeDir(p) {
		p = path.resolve(p);
		delete files[p];
		filesLastUpdated = Date.now();
	}

	return Talk;
}
