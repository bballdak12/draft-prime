'use strict';
// One-shot HTTP receiver: browser POSTs { folder, filename, html } → writes to disk
// Usage: node scripts/pfr-gamelog-receiver.js
// Stops after all expected files are written (or Ctrl-C)

const http = require('http');
const fs   = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../data/pfr-gamelogs');
const PORT     = 3939;

let received = 0;

const server = http.createServer((req, res) => {
  if (req.method !== 'POST') { res.writeHead(405); res.end(); return; }

  const chunks = [];
  req.on('data', c => chunks.push(c));
  req.on('end', () => {
    try {
      const body   = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      const folder = path.join(DATA_DIR, body.folder);
      if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });
      const filePath = path.join(folder, body.filename);
      fs.writeFileSync(filePath, body.html, 'utf8');
      received++;
      console.log(`[${received}] Wrote ${body.folder}/${body.filename}  (${body.html.length} bytes)`);
      res.writeHead(200, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
      res.end('ok');
    } catch (e) {
      console.error('Error:', e.message);
      res.writeHead(400); res.end(e.message);
    }
  });
});

server.on('error', err => { console.error('Server error:', err.message); process.exit(1); });
server.listen(PORT, '127.0.0.1', () => {
  console.log(`PFR receiver listening on http://127.0.0.1:${PORT}`);
  console.log('POST { folder, filename, html } to write game log files.');
  console.log('Ctrl-C to stop.\n');
});
