#!/usr/bin/env node
// Serwer plików statycznych na czas gry w przeglądarce. Bez zależności.
//
// Jest w ogóle potrzebny wyłącznie dlatego, że moduły ES nie ładują się
// z `file://` - przeglądarka blokuje je regułą tego samego pochodzenia.
// Serwuje KATALOG PROJEKTU, bo `web/` importuje silnik wprost z `src/`.

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, normalize, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const PORT = Number(process.env.PORT || 8080);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const server = createServer(async (req, res) => {
  let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (path === '/') { res.writeHead(302, { Location: '/web/' }); return res.end(); }
  if (path.endsWith('/')) path += 'index.html';

  // Bez tego `GET /../../etc/passwd` wychodziłoby poza katalog projektu.
  const full = normalize(join(ROOT, path));
  if (!full.startsWith(ROOT)) { res.writeHead(403); return res.end('403'); }

  try {
    const s = await stat(full);
    if (s.isDirectory()) { res.writeHead(302, { Location: `${path}/` }); return res.end(); }
    const body = await readFile(full);
    res.writeHead(200, {
      'Content-Type': TYPES[extname(full)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 - nie ma takiego pliku');
  }
});

server.listen(PORT, () => {
  console.log(`Loch czeka na  http://localhost:${PORT}/web/`);
  console.log('Zatrzymanie: Ctrl+C');
});
