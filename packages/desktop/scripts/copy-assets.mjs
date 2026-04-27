import { copyFile, mkdir } from 'fs/promises';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = resolve(root, 'dist');

await mkdir(dist, { recursive: true });
await copyFile(resolve(root, 'src/index.html'), resolve(dist, 'index.html'));
await copyFile(resolve(root, 'src/styles.css'), resolve(dist, 'styles.css'));
