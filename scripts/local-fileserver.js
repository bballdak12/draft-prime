'use strict';
const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT = 8765;
const ROOT = path.resolve(__dirname, '..');

http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  if (req.method === 'POST' && req.url === '/save') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const { name, content } = JSON.parse(body);
        if (!name || !/^[a-z0-9_.-]+\.json$/i.test(name)) throw new Error('bad name');
        const file = path.join(ROOT, 'data', name);
        fs.writeFileSync(file, content);
        console.log('  saved', name, '('+content.length+' chars)');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, file }));
      } catch (e) {
        res.writeHead(400); res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  if (req.method === 'GET') {
    const url = (req.url || '/').split('?')[0];
    const file = path.join(ROOT, decodeURIComponent(url));
    if (!file.startsWith(ROOT)) { res.writeHead(403); res.end('forbidden'); return; }
    if (!fs.existsSync(file)) { res.writeHead(404); res.end('not found'); return; }
    res.setHeader('Content-Type', 'application/json');
    fs.createReadStream(file).pipe(res);
    return;
  }
  res.writeHead(405); res.end();
}).listen(PORT, () => console.log('Server running on http://localhost:' + PORT));
