import {readdir, readFile, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {brotliCompressSync, gzipSync, constants} from 'node:zlib';
async function compress(directory) {
  for (const entry of await readdir(directory, {withFileTypes:true})) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await compress(path);
    else if (/\.(js|css|svg|html)$/.test(entry.name)) {
      const bytes = await readFile(path);
      await writeFile(path + '.br', brotliCompressSync(bytes, {params:{[constants.BROTLI_PARAM_QUALITY]:5}}));
      await writeFile(path + '.gz', gzipSync(bytes, {level:6}));
    }
  }
}
await compress(new URL('../dist/render/client/', import.meta.url).pathname);
console.log('Render assets compressed.');
