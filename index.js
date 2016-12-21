'use strict';

const path = require('path');
const express = require('express');

const schedulePath = path.resolve(__dirname, 'schedule.json');
const filesBase = path.resolve(__dirname, 'files/');

const Talk = require('./models/talks')(schedulePath, filesBase);

const app = express();
app.set('views', path.resolve(__dirname, 'views/'));
app.set('view engine', 'pug');

app.get('/', (req, res) => {
	return Talk.all()
		.then(talks => res.render('index', { talks }));
})

app.get('/:slug', (req, res) => {
	return Talk.findBySlug(req.params.slug)
		.then(talk => { console.log(talk.files); return talk })
		.then(talk => res.render('talk', { talk }))
		.catch(e => { console.error(e.stack) })
})

app.get('/:slug/:file', (req, res) => {
	return Talk.findBySlug(req.params.slug)
		.then(talk => { talk.readFile(req.params.file).pipe(res) })
		.catch(e => { console.error(e.stack) })
})

app.listen(9000, () => {
	console.log('App listening on :9000');
})
