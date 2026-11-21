// A tiny static server for game/ (Node 22, standard library only), so an entry can be played
// locally without a build step: `node serve.ts` serves game/ on http://localhost:8080.
// It sends the MIME types a browser game needs, refuses any path outside game/, and otherwise
// does nothing clever: this is a development convenience, not a web server for the internet.
import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const gameRoot = resolve(fileURLToPath(new URL('./game', import.meta.url)));
const argumentsList = process.argv.slice(2);
const portFlagIndex = argumentsList.indexOf('--port');
const requestedPort = portFlagIndex === -1 ? 8080 : Number(argumentsList[portFlagIndex + 1]);
const port = Number.isInteger(requestedPort) && requestedPort > 0 && requestedPort < 65536 ? requestedPort : 8080;

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.bin': 'application/octet-stream',
  '.wasm': 'application/wasm',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.txt': 'text/plain; charset=utf-8',
};

function pathInsideGame(pathname: string) {
  return pathname === gameRoot || pathname.startsWith(gameRoot + sep);
}

const server = createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost');
  let pathname: string;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    response.writeHead(400).end('bad request');
    return;
  }
  if (pathname.endsWith('/')) pathname += 'index.html';
  const filePath = resolve(join(gameRoot, normalize(pathname)));
  if (!pathInsideGame(filePath)) {
    response.writeHead(403).end('forbidden');
    return;
  }

  let fileSize: number;
  try {
    const stats = statSync(filePath);
    if (!stats.isFile()) throw new Error('not a file');
    fileSize = stats.size;
  } catch {
    response.writeHead(404).end('not found');
    return;
  }

  response.writeHead(200, {
    'content-type': MIME_TYPES[extname(filePath).toLowerCase()] ?? 'application/octet-stream',
    'content-length': fileSize,
    'cache-control': 'no-store',
  });
  createReadStream(filePath).pipe(response);
});

server.listen(port, '127.0.0.1', () => {
  console.log(`game/ is on http://localhost:${port}`);
});
