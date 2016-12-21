'use strict';

const path = require('path');
const express = require('express');
const multer = require('multer');

const schedulePath = path.resolve(__dirname, 'schedule.json');
const filesBase = path.resolve(__dirname, 'files/');

const Talk = require('./models/talks')(schedulePath, filesBase);

const upload = multer({
	dest: path.resolve(__dirname, '.temp/'),
})

const app = express();
app.set('views', path.resolve(__dirname, 'views/'));
app.set('view engine', 'pug');

app.use('/vendor/bootstrap', express.static(path.resolve(__dirname, 'node_modules/bootstrap/dist/')));
app.use('/static', express.static(path.resolve(__dirname, 'static/')));

app.get('/', (req, res) => {
	return Talk.allSorted()
		.then(talks => res.render('index', { talks }));
})

app.get('/:slug', (req, res) => {
	const uploadCount = req.query.uploadCount;
	return Talk.findBySlug(req.params.slug)
		.then(talk => res.render('talk', { talk, uploadCount }))
		.catch(e => { console.error(e.stack) })
})

app.post('/:slug/files/', upload.any(), (req, res) => {
	const { files, body } = req;
	return Talk.findBySlug(req.params.slug)
		.then(talk => {
			const tasks = [];
			if (files.length) tasks.push(talk.addFiles(files));
			if (body.comment) tasks.push(talk.addComment(body.comment));
			return Promise.all(tasks).then(() => talk);
		})
		.then(talk => { res.redirect(`/${talk.slug}/?uploadCount=${files.length}`) })
		.catch(e => { console.error(e.stack) })
})

app.get('/:slug/files/:file', (req, res) => {
	return Talk.findBySlug(req.params.slug)
		.then(talk => { talk.readFile(req.params.file).pipe(res) })
		.catch(e => { console.error(e.stack) })
})

app.listen(9000, () => {
	console.log('App listening on :9000');
})
