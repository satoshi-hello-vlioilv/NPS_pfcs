#!/usr/bin/env node
'use strict';
/**
 * 動作確認用の簡易HTTPサーバ。`npm start` で起動する。
 *
 * このアプリは静的ファイルだけで動くが、file:// で開くと保存機能
 * （IndexedDB）やフォント読み込みがブラウザの制限に掛かることがあるため、
 * ローカルサーバ経由で開くこと。
 */
const http = require('http');
const fs   = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT) || 8931;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',   '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',             '.woff2': 'font/woff2',
  '.png': 'image/png',                 '.ico': 'image/x-icon',
};

http.createServer((req, res) => {
  const rel  = decodeURIComponent(req.url.split('?')[0]);
  const file = path.join(ROOT, rel === '/' ? 'index.html' : rel);
  if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }   // ルート外参照を防ぐ
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404).end('Not Found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(buf);
  });
}).listen(PORT, () => console.log(`http://localhost:${PORT}/ で起動しました（Ctrl+C で終了）`));
