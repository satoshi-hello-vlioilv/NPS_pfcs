'use strict';
/**
 * テスト共通ヘルパー。
 *
 * 各テストは次の形で書く:
 *
 *   const { run } = require('./_harness');
 *   run('テスト名', async (t) => {
 *     await t.load();                 // サンプルデータを読み込んだ初期状態にする
 *     t.check('条件の説明', 条件, 失敗時に出す値);
 *   });
 *
 * 実行は `npm test`（tests/run-all.js が全ファイルを順に実行する）。
 * 個別に走らせたい場合は `node tests/layout.test.js`。
 */
const http = require('http');
const fs   = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

const ROOT = path.resolve(__dirname, '..');

/** Chromium 実行ファイルを探す。PLAYWRIGHT_CHROMIUM 環境変数で明示指定も可能。 */
function findChromium() {
  if (process.env.PLAYWRIGHT_CHROMIUM) return process.env.PLAYWRIGHT_CHROMIUM;
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  const candidates = [];
  try {
    for (const d of fs.readdirSync(base)) {
      if (!d.startsWith('chromium-')) continue;
      candidates.push(path.join(base, d, 'chrome-linux', 'chrome'));
    }
  } catch { /* base が無い場合は下のエラーで案内する */ }
  const hit = candidates.find(p => fs.existsSync(p));
  if (hit) return hit;
  throw new Error(
    'Chromium が見つかりません。PLAYWRIGHT_CHROMIUM に実行ファイルのパスを指定するか、\n' +
    '`npx playwright install chromium` を実行してください。'
  );
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',   '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',             '.woff2': 'font/woff2',
  '.png': 'image/png',                 '.ico': 'image/x-icon',
};

/** リポジトリ直下を配信する使い捨てHTTPサーバを立てる（ポートは自動割り当て）。 */
function startServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const rel = decodeURIComponent(req.url.split('?')[0]);
      const file = path.join(ROOT, rel === '/' ? 'index.html' : rel);
      // ルート外への参照を防ぐ
      if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
      fs.readFile(file, (err, buf) => {
        if (err) { res.writeHead(404).end(); return; }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
        res.end(buf);
      });
    });
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

/**
 * テスト本体を実行する。
 * @param {string} name テスト名（見出しに出る）
 * @param {(t:object)=>Promise<void>} body
 */
async function run(name, body) {
  const { server, port } = await startServer();
  const browser = await chromium.launch({ executablePath: findChromium() });
  const page    = await browser.newPage({ viewport: { width: 1600, height: 1000 } });

  let pass = 0, fail = 0;
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));

  const t = {
    page, port, errors,
    baseURL: `http://127.0.0.1:${port}`,
    /** 条件を検証する。失敗時は detail を表示する。 */
    check(label, cond, detail) {
      if (cond) { pass++; console.log(`  ✔ ${label}`); }
      else {
        fail++;
        const d = detail === undefined ? '' : (typeof detail === 'string' ? detail : JSON.stringify(detail));
        console.log(`  ✘ ${label} ${d}`);
      }
    },
    log: (...a) => console.log(' ', ...a),
    /** 保存済みデータ（IndexedDB + localStorage）を空にする */
    async resetStorage() {
      await page.evaluate(async () => {
        localStorage.clear();
        // 保存先は IndexedDB なので、こちらも消さないと前のテストの結果が残る
        await new Promise(res => {
          const req = indexedDB.open('nps_pfcs');
          req.onsuccess = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains('kv')) { db.close(); res(); return; }
            const tx = db.transaction('kv', 'readwrite');
            tx.objectStore('kv').clear();
            tx.oncomplete = () => { db.close(); res(); };
            tx.onerror    = () => { db.close(); res(); };
          };
          req.onerror = () => res();
        });
      });
    },
    /** サンプルデータを読み込んだ状態にリセットする。view を渡すとそのビューに切り替える。 */
    async load(view) {
      await page.goto(`http://127.0.0.1:${port}/`);
      await t.resetStorage();
      await page.reload();
      await page.waitForTimeout(150);   // init() が非同期になったため読み込み完了を待つ
      await page.evaluate(() => { loadSampleData(); resetView(); });
      if (view) await page.evaluate(v => switchView(v), view);
      await page.waitForTimeout(200);
    },
  };

  console.log(`\n━━━ ${name} ━━━`);
  let crashed = null;
  try {
    await body(t);
    t.check('JSエラーなし', errors.length === 0, errors.join(' / '));
  } catch (e) {
    crashed = e;
    fail++;
    console.log(`  ✘ テストが例外で停止: ${e.message}`);
  }

  await browser.close();
  server.close();

  console.log(`──── ${name}: ${pass} passed, ${fail} failed ────`);
  if (crashed && process.env.TEST_VERBOSE) console.error(crashed);
  process.exitCode = fail ? 1 : 0;
  return { pass, fail };
}

module.exports = { run, startServer, findChromium, ROOT };
