import redactFilename from '../redact-filename';

describe('redactFilename', () => {
  it('only shows the extension and the first and last two characters', () => {
    expect(redactFilename('testfile.txt')).toEqual('te[…]le.txt');
    expect(redactFilename('fun-with-webpack.js')).toEqual('fu[…]ck.js');
    expect(redactFilename('archive.backup.zip')).toEqual('ar[…]up.zip');
    expect(redactFilename('.gitignore')).toEqual('.g[…]re');
  });

  it('does nothing for filenames of up to 4 characters', () => {
    expect(redactFilename('test.txt')).toEqual('test.txt');
    expect(redactFilename('123.jpeg')).toEqual('123.jpeg');
  });
});
