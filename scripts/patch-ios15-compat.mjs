import fs from 'node:fs';
import path from 'node:path';

const filePath = path.resolve('src/app/recognize.tsx');
let source = fs.readFileSync(filePath, 'utf8');

const littleEndianSnippet = `const chunkSizeLow = view.getUint32(offset + 4, true);\n    const chunkSizeHigh = view.getUint32(offset + 8, true);`;
const bigEndianSnippet = `const chunkSizeHigh = view.getUint32(offset + 4, false);\n    const chunkSizeLow = view.getUint32(offset + 8, false);`;

if (source.includes(bigEndianSnippet)) {
  console.log('CAF parser already uses CAF big-endian chunk sizes.');
  process.exit(0);
}

if (!source.includes(littleEndianSnippet)) {
  throw new Error('Expected CAF chunk-size parser was not found; refusing to patch blindly.');
}

source = source.replace(littleEndianSnippet, bigEndianSnippet);
fs.writeFileSync(filePath, source);
console.log('Patched CAF chunk-size parsing to big-endian as required by the CAF format.');
