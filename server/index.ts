import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { api } from './api.ts';
import { config } from './config.ts';
import { startWorkers } from './jobs.ts';
import { maintenance } from './watches.ts';

const dev = process.argv.includes('--dev');
const vite = dev
  ? await (await import('vite')).createServer({ server: { middlewareMode: true }, appType: 'spa' })
  : null;
const root = resolve('dist');
const types: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
};
const server = createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  if (req.url?.startsWith('/api/')) {
    await api(req, res);
    return;
  }
  if (vite) {
    vite.middlewares(req, res);
    return;
  }
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  );
  try {
    const pathname = decodeURIComponent(
      new URL(req.url || '/', `http://${req.headers.host}`).pathname,
    );
    let file = resolve(root, '.' + pathname);
    if (file !== root && !file.startsWith(root + sep)) {
      res.writeHead(403);
      res.end();
      return;
    }
    if (!(await stat(file).catch(() => null))?.isFile()) {
      if (extname(pathname)) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      file = resolve(root, 'index.html');
    }
    const content = await readFile(file);
    res.writeHead(200, {
      'Content-Type': types[extname(file)] || 'application/octet-stream',
      'Cache-Control': pathname.startsWith('/assets/')
        ? 'public, max-age=31536000, immutable'
        : 'no-cache',
    });
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end('Build the frontend with npm run build first.');
  }
});
let stopWorkers = () => {};
let maintenanceBusy = false;
const maintain = async () => {
  if (maintenanceBusy) return;
  maintenanceBusy = true;
  try {
    await maintenance();
  } catch {
    console.error('Watch maintenance failed; it will retry.');
  } finally {
    maintenanceBusy = false;
  }
};
const timer = setInterval(maintain, 30000);
timer.unref();
server.listen(config.port, config.host, () => {
  stopWorkers = startWorkers();
  void maintain();
  console.log(
    `TravelLikeaSole: http://${config.host}:${config.port}\nTinyFish: ${config.apiKey ? 'configured' : 'set TINYFISH_API_KEY in .env'}\nMode: ${dev ? 'development' : 'production'}`,
  );
});
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => {
    stopWorkers();
    clearInterval(timer);
    server.close();
    void vite?.close();
    setTimeout(() => process.exit(0), 1500).unref();
  });
