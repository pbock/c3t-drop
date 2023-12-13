'use strict';

import { resolve } from 'path';
import TalkModel from './models/talks';

const schedulePath = resolve(__dirname, 'schedule.json');
const filesBase = resolve(__dirname, 'files/');

const Talk = TalkModel(schedulePath, filesBase, false);

Promise.all([Talk.all(), Talk._getAllFiles()])
  .then(([talks, files]) => {
    Object.entries(files).forEach(([filePath, meta]) => {
      if (!meta.isDir) return;
      // Ignore first-level directories
      const nestLevel = filePath.split('/').length - schedulePath.split('/').length;
      if (nestLevel < 2) return;

      const matchingTalk = talks.find((t) => t.filePath === filePath);
      if (!matchingTalk) {
        console.warn(filePath);
      }
    });
  })
  .then(() => process.exit());
