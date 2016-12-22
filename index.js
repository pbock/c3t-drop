'use strict';

const path = require('path');
const bunyan = require('bunyan');
const express = require('express');
const multer = require('multer');
const i18n = require('i18n');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const URL = require('url');
const moment = require('moment')

// Lib
const push = require('./lib/pushover');

// Set up logger
const log = bunyan.createLogger({ name: 'c3t-drop-server' });

const isProduction = process.env.NODE_ENV === 'production';
if (!isProduction) {
	log.warn('NODE_ENV is not set to production. Actual value: %s', process.env.NODE_ENV);
}

const schedulePath = path.resolve(__dirname, 'schedule.json');
const filesBase = path.resolve(__dirname, 'files/');

const Talk = require('./models/talks')(schedulePath, filesBase);

const upload = multer({
	dest: path.resolve(__dirname, '.temp/'),
	limits: {
		fileSize: 50e6,
	},
})

const app = express();

// Configure internationalization
i18n.configure({
	directory: path.resolve(__dirname, 'locales/'),
	locales: [ 'en', 'de' ],
	cookie: 'lang',
})

if (isProduction) {
	app.use(helmet());
}

app.use((req, res, next) => {
	log.info('%s %s', req.method, req.url);

	if (req.query.lang) {
		res.cookie('lang', req.query.lang, { maxAge: 900000, httpOnly: true });
		const { pathname } = URL.parse(req.url);
		res.redirect(pathname);
	} else {
		next();
	}
})
app.use(cookieParser());
app.use(i18n.init);

app.set('views', path.resolve(__dirname, 'views/'));
app.set('view engine', 'pug');

app.use('/vendor/bootstrap', express.static(path.resolve(__dirname, 'node_modules/bootstrap/dist/')));
app.use('/static', express.static(path.resolve(__dirname, 'static/')));

app.locals.moment = moment;

app.get('/', (req, res) => {
	return Talk.allSorted()
		.then(talks => res.render('index', { talks }));
})

app.get('/impressum', (req, res) => {
	res.render('impressum');
})

function ensureExistence(thing) {
	if (!thing) {
		const err = new Error('Not found');
		err.status = 404;
		throw err;
	}
	return thing;
}

app.get('/talks/:slug', (req, res, next) => {
	const uploadCount = req.query.uploadCount;
	return Talk.findBySlug(req.params.slug)
		.then(ensureExistence)
		.then(talk => res.render('talk', { talk, uploadCount }))
		// If that failed, try looking the talk up by ID instead
		.catch(() => Talk.findById(req.params.slug)
			.then(ensureExistence)
			.then(talk => res.redirect(`/talks/${talk.slug}/`))
		)
		.catch(next)
})

app.post('/talks/:slug/files/', upload.any(), (req, res, next) => {
	let requestTalk;
	const { files, body } = req;
	log.info({ files, body }, 'Files received');
	return Talk.findBySlug(req.params.slug)
		.then(ensureExistence)
		.then(talk => {
			requestTalk = talk;
			const tasks = [];
			if (files.length) tasks.push(talk.addFiles(files));
			if (body.comment) tasks.push(talk.addComment(body.comment));
			return Promise.all(tasks).then(() => talk);
		})
		.then(talk => {
			res.redirect(`/talks/${talk.slug}/?uploadCount=${files.length}`);
			push({ title: `Added files for talk ${talk.title}`, message: files.map(f => f.originalname).join('\n') });
		})
		.catch((err) => {
			log.error(err, 'Failed to add files');
			push({ title: `Failed to add files to talk ${requestTalk.title}`, message: err.stack });
			next(err);
		})
})

app.get('/talks/:slug/files/', (req, res) => {
	res.redirect(`/${req.params.slug}/`);
})

// app.get('/:slug/files/:file', (req, res, next) => {
// 	return Talk.findBySlug(req.params.slug)
// 		.then(talk => { talk.readFile(req.params.file).pipe(res) })
// 		.catch(next)
// })

app.use((req, res, next) => {
	log.info(`%s %s Request didn't match a route`, req.method, req.url);
	res.status(404).render('error', { status: 404 });
})
app.use((err, req, res, next) => {
	log.warn(err, '%s %s Error handler sent', req.method, req.url);
	res.status(err.status || 500).render('error', { status: err.status || 500 });
})

app.listen(9000, () => {
	log.info('App listening on :9000');
})
