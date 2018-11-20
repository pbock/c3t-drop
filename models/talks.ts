'use strict';

import chokidar = require('chokidar');
import bunyan = require('bunyan');
import path = require('path');
import fs = require('fs-promise');
import _ = require('lodash');
import { Stats } from 'fs-promise';
import { isDeepStrictEqual } from 'util';

import streamHash from '../lib/stream-hash';

const COMMENT_EXTENSION = '.comment.txt';

interface LocaleDependentSlugParts {
  equals: string;
  ampersand: string;
  plus: string;
}

const localeDependentSlugParts: { [locale: string]: LocaleDependentSlugParts } = {
  en: { equals: 'equals', ampersand: 'and', plus: 'plus' },
  de: { equals: 'gleich', ampersand: 'und', plus: 'plus' },
};

function slugify(string: string, lang = 'en'): string {
  const s = localeDependentSlugParts[lang] || localeDependentSlugParts.en;

  return string
    .toLowerCase()
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
    .replace(/\s+/g, '-');
}

function sortTitle(title: string): string {
  return title.toLowerCase().replace(/^(a|an|the|der|die|das) /, '');
}

function redactFilename(filename: string): string {
  const extension = path.extname(filename);
  const base = path.basename(filename, extension);
  if (base.length < 4) return base + extension;
  return `${base.substr(0, 2)}[…]${base.substr(-2)}${extension}`;
}

export class TalkFile {
  name: string;
  redactedName: string;
  path: string;
  meta: any;

  constructor(filePath: string, meta: any) {
    this.name = path.basename(filePath);
    this.redactedName = redactFilename(this.name);
    this.path = filePath;
    this.meta = meta;
  }

  read() {
    return fs.createReadStream(this.path);
  }
}

function wait(timeout: number) {
  return function(...args: any) {
    return new Promise(resolve => setTimeout(() => resolve(...args), timeout));
  };
}

interface FileInfo {
  stats?: Stats;
  isDir: boolean;
  isComment?: boolean;
  hash?: string | null;
}

export default function TalkModel(
  scheduleJsonPath: string,
  fileRootPath: string,
  shouldLog = true
) {
  const log = bunyan.createLogger({ name: 'c3t-drop-model', level: shouldLog ? 'info' : 'fatal' });

  let talks: Talk[] = [];
  let sortedTalks: Talk[] = [];
  let talksBySlug: { [slug: string]: Talk } = {};
  const files: {
    [path: string]: FileInfo;
  } = {};
  let filesLastUpdated = 0;

  let talksReady = updateTalks();

  class Talk {
    id: string;
    date: Date;
    time: string;
    duration: string;
    room: string;
    title: string;
    sortTitle: string;
    subtitle?: string;
    slug: string;
    track: string;
    type: string;
    language: string;
    abstract?: string;
    day?: number;
    filePath: string;

    speakers: string[];

    private filesCache: null | TalkFile[] = null;
    private commentFilesCache: null | TalkFile[] = null;
    private filesCacheLastUpdated = 0;
    private commentFilesCacheLastUpdated = 0;

    // TODO: Properly validate `type` parameter
    constructor(talk: any, day: number | null = null) {
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
      this.day = day === null ? undefined : day;
      const dayString = day === null ? 'day-unknown' : `day-${day}`;
      this.filePath = path.resolve(fileRootPath, dayString, this.slug);

      this.speakers = talk.persons.map((p: any) => p.public_name);

      talks.push(this);
      talksBySlug[this.slug] = this;
    }

    get files(): TalkFile[] {
      if (!this.filesCache || this.filesCacheLastUpdated < filesLastUpdated) {
        this.filesCache = _(files)
          .map((meta, filePath) => ({ meta, path: filePath }))
          .filter(
            file =>
              !file.meta.isDir && !file.meta.isComment && file.path.indexOf(this.filePath) === 0
          )
          .map(file => new TalkFile(file.path, file.meta))
          .value();
        this.filesCacheLastUpdated = Date.now();
      }
      return this.filesCache;
    }

    get commentFiles(): TalkFile[] {
      if (!this.commentFilesCache || this.commentFilesCacheLastUpdated < filesLastUpdated) {
        this.commentFilesCache = _.map(files, (info, filePath) => ({ info, path: filePath }))
          .filter(file => file.info.isComment && file.path.indexOf(this.filePath) === 0)
          .map((file: { info: FileInfo; path: string }) => new TalkFile(file.path, file.info));
        this.commentFilesCacheLastUpdated = Date.now();
      }
      return this.commentFilesCache;
    }

    // This is NOT a getter because it is asynchronous
    getComments(): Promise<{ body: Buffer; info: FileInfo }[]> {
      const commentPromises = _.map(files, (info, filePath) => ({ info, path: filePath }))
        .filter(file => file.info.isComment && file.path.indexOf(this.filePath) === 0)
        .map(file => fs.readFile(file.path).then(body => ({ body, info: file.info })));
      return Promise.all(commentPromises);
    }

    readFile(name: string): fs.ReadStream {
      return fs.createReadStream(path.resolve(this.filePath, name));
    }

    async addComment(comment: string): Promise<this> {
      await fs.writeFile(path.resolve(this.filePath, `${Date.now()}${COMMENT_EXTENSION}`), comment);
      return this;
    }

    addFiles(files: Express.Multer.File[]) {
      return Promise.all(
        files.map(file => fs.rename(file.path, path.resolve(this.filePath, file.originalname)))
      )
        .then(wait(100)) // HACK: prevent Promise from resolving before watcher fired and file list has been rebuilt
        .then(() => this);
    }

    static async all() {
      await Promise.all([talksReady, filesReady]);
      return talks;
    }

    static async allSorted() {
      await Promise.all([talksReady, filesReady]);
      return sortedTalks;
    }

    static async findBySlug(slug: string) {
      await Promise.all([talksReady, filesReady]);
      return talksBySlug[slug];
    }

    static async findById(id: string) {
      await Promise.all([talksReady, filesReady]);
      return _.find(talks, { id });
    }

    static _getAllFiles() {
      return files;
    }
  }

  function updateTalks() {
    return fs
      .readFile(scheduleJsonPath)
      .then(buffer => JSON.parse(buffer.toString()))
      .then(({ schedule }) => {
        talks = [];
        talksBySlug = {};

        _.each(schedule.conference.days, day => {
          _.each(day.rooms, talks => {
            _.each(talks, talk => {
              new Talk(talk, day.index);
            });
          });
        });
      })
      .then(() => (sortedTalks = _.sortBy(talks, 'sortTitle')))
      .then(() => Promise.all(talks.map(t => fs.ensureDir(t.filePath))))
      .then(() => log.info('Done updating talks'));
  }

  let isInitialScan = true;
  const filesReady = new Promise(resolve => {
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
      .on('error', e => {
        log.error(e);
        process.exit(1);
      })
      .on('ready', () => {
        log.info('Initial scan complete. Ready for changes');
        isInitialScan = false;
        resolve();
      });
  });

  const scheduleWatcher = chokidar.watch(scheduleJsonPath);
  scheduleWatcher.on('change', () => {
    log.info('Schedule changed; updating');
    talksReady = Promise.all([talksReady, filesReady]).then(updateTalks);
  });

  function addFile(fp: string, stats: Stats) {
    if (!isInitialScan) log.info('Added file %s', fp);
    const p = path.resolve(fp);
    const isComment = p.substr(-COMMENT_EXTENSION.length) === COMMENT_EXTENSION;
    files[p] = { stats, isComment, isDir: false, hash: null };
    filesLastUpdated = Date.now();
    streamHash(p)
      .then(hash => {
        // In the meantime, the file may have been deleted, in which case
        // attempting to write the hash would throw an error.
        if (!files[p]) return;
        // It may also have been overwritten by a new version, in which case
        // this is the wrong hash we'd be writing.
        if (files[p].stats !== stats) return;
        files[p].hash = hash;
      })
      .catch((err: Error) => log.error(err, 'Error writing hash for file %s', p));
  }
  function removeFile(fp: string) {
    if (!isInitialScan) log.info('Removed file %s', fp);
    const p = path.resolve(fp);
    delete files[p];
    filesLastUpdated = Date.now();
  }
  function addDir(fp: string) {
    if (!isInitialScan) log.info('Added directory %s', fp);
    const p = path.resolve(fp);
    files[p] = { isDir: true };
    filesLastUpdated = Date.now();
  }
  function removeDir(fp: string) {
    if (!isInitialScan) log.info('Removed directory %s', fp);
    const p = path.resolve(fp);
    delete files[p];
    filesLastUpdated = Date.now();
  }

  return Talk;
}
