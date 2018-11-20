'use strict';

import crypto = require('crypto');
import fs = require('fs');
import { Stream } from 'stream';
import { Utf8AsciiLatin1Encoding } from 'crypto';

export default function streamHash(
  firstParam: Stream | string,
  algorithm = 'sha1',
  encoding: Utf8AsciiLatin1Encoding = 'utf8'
): Promise<string> {
  const stream = typeof firstParam === 'string' ? fs.createReadStream(firstParam) : firstParam;
  const hash = crypto.createHash(algorithm);
  return new Promise((resolve, reject) => {
    stream.on('data', chunk => hash.update(chunk, encoding));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}
