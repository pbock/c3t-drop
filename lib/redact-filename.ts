import { extname, basename } from 'path';

export default function redactFilename(filename: string): string {
  const extension = extname(filename);
  const base = basename(filename, extension);
  if (base.length < 5) return base + extension;
  return `${base.substr(0, 2)}[…]${base.substr(-2)}${extension}`;
}
