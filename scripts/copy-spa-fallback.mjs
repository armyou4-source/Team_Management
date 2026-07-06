import { mkdir, copyFile } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = join(__dirname, '..', 'dist');
const reportDir = join(distDir, 'report');

await mkdir(reportDir, { recursive: true });
await copyFile(join(distDir, 'index.html'), join(reportDir, 'index.html'));

console.log('SPA fallback ready: dist/report/index.html');
