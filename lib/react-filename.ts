import path = require('path');

export default function redactFilename(filename: string): string {
  const extension = path.extname(filename);
  const base = path.basename(filename, extension);
  if (base.length < 5) return base + extension;
  return `${base.substr(0, 2)}[…]${base.substr(-2)}${extension}`;
}
