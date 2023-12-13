'use strict';

import { createHash, type Encoding } from 'crypto';
import { createReadStream } from 'fs';
import { Stream } from 'stream';

export default function streamHash(
  firstParam: Stream | string,
  algorithm = 'sha1',
  encoding: Encoding = 'utf8'
): Promise<string> {
  const stream = typeof firstParam === 'string' ? createReadStream(firstParam) : firstParam;
  const hash = createHash(algorithm);
  return new Promise((resolve, reject) => {
    stream.on('data', (chunk) => hash.update(chunk, encoding));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}
