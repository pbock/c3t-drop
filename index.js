'use strict';

const path = require('path');
const bunyan = require('bunyan');
const express = require('express');
const multer = require('multer');
const i18n = require('i18n');
const URL = require('url');
const moment = require('moment')
const _ = require('lodash');

// Middleware
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const basicAuth = require('basic-auth');

// Lib
const push = require('./lib/pushover');

// Set up logger
const log = bunyan.createLogger({ name: 'c3t-drop-server' });

const MONTH = 30 * 24 * 60 * 60 * 1000;

// Load config
let config = {};
try {
	config = require('./config');
} catch (e) {
	log.warn('No config file found');
}

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

// Set up basic auth
function forceAuth(req, res, next) {
	function unauthorized(res) {
		res.set('WWW-Authenticate', 'Basic realm=Authorization Required');
		return res.status(401).send('<h1>Unauthorized</h1>');
	}
	if (req.isAuthorized === undefined) checkAuth(req);
	if (req.isAuthorized) return next();
	return unauthorized(res);
}
function checkAuth(req, res, next) {
	const user = basicAuth(req);
	const cookieAuth = req.cookies.auth;

	let authorized = false;
	if (!config.readCredentials) authorized = false;
	else if (user && user.name in config.readCredentials && user.pass === config.readCredentials[user.name]) {
		authorized = true;
		res.cookie('auth', `${user.name}:${user.pass}`, { maxAge: MONTH, httpOnly: true });
	} else if (cookieAuth) {
		try {
			const [ cookieUser, cookiePass ] = cookieAuth.split(':');
			authorized = cookieUser in config.readCredentials && cookiePass === config.readCredentials[cookieUser];
		} catch (e) {
			log.warn(e);
		}
	}

	req.isAuthorized = authorized;
	next();
	return authorized;
}

app.use(cookieParser());
app.use(checkAuth);

app.use((req, res, next) => {
	log.info('%s %s', req.method, req.url);

	if (req.query.lang) {
		log.info('Setting language to %s', req.query.lang);
		res.cookie('lang', req.query.lang, { maxAge: MONTH, httpOnly: true });
		const { pathname } = URL.parse(req.url);
		res.redirect(pathname);
	} else {
		next();
	}
})
app.use(i18n.init);

app.set('views', path.resolve(__dirname, 'views/'));
app.set('view engine', 'pug');

app.use('/vendor/bootstrap', express.static(path.resolve(__dirname, 'node_modules/bootstrap/dist/')));
app.use('/static', express.static(path.resolve(__dirname, 'static/')));

app.locals.moment = moment;

app.get('/', (req, res) => {
	const { isAuthorized } = req;
	return Talk.allSorted()
		.then(talks => res.render('index', { talks, isAuthorized }));
})

app.get('/impressum', (req, res) => {
	const { isAuthorized } = req;
	res.render('impressum', { isAuthorized });
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
	const { uploadCount, commentCount, nothingReceived } = req.query;
	const { isAuthorized } = req;
	return Talk.findBySlug(req.params.slug)
		.then(ensureExistence)
		.then(talk => {
			// FIXME: Refactor
			if (req.isAuthorized) {
				return talk.getComments()
					.then(comments => { talk.comments = comments; return talk; })
			}
			return talk;
		})
		.then(talk => res.render('talk', { talk, uploadCount, commentCount, nothingReceived, isAuthorized }))
		// If that failed, try looking the talk up by ID instead
		.catch(() => Talk.findById(req.params.slug)
			.then(ensureExistence)
			.then(talk => res.redirect(`/talks/${talk.slug}/`))
		)
		.catch(next)
})

app.get('/sign-in', forceAuth, (req, res) => {
	res.redirect('/');
})

app.post('/talks/:slug/files/', upload.any(), (req, res, next) => {
	let requestTalk;
	const { files, body } = req;
	if (!files.length && !body.comment) {
		log.info('Form submitted, but no files and no comment received');
		res.redirect(`/talks/${req.params.slug}/?nothingReceived=true`);
		return;
	}
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
			res.redirect(`/talks/${talk.slug}/?uploadCount=${files.length}&commentCount=${body.comment ? '1' : '0'}`);
			push({ title: `Added files for talk ${talk.title}`, message: files.map(f => f.originalname).join('\n') });
		})
		.catch((err) => {
			log.error(err, 'Failed to add files');
			push({ title: `Failed to add files to talk ${requestTalk.title}`, message: err.stack });
			next(err);
		})
})

app.get('/talks/:slug/files/:filename', forceAuth, (req, res, next) => {
	return Talk.findBySlug(req.params.slug)
		.then(ensureExistence)
		.then(talk => {
			const file = _.find(talk.files, { name: req.params.filename });
			if (!file) {
				const error = new Error('File not found');
				error.status = 404;
				throw(error);
			}
			res.sendFile(file.path);
		})
		.catch(next)
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
