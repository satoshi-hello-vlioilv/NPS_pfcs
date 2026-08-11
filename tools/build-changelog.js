#!/usr/bin/env node
'use strict';
/**
 * CHANGELOG.md から画面表示用の改訂履歴データ js/changelog.js を生成する。
 *
 *   npm run build:changelog
 *
 * アプリはサーバー無しでも動く必要があり、file:// では fetch で
 * CHANGELOG.md を読めないため、JSファイルとして埋め込んでいる。
 * CHANGELOG.md を編集したら必ずこのスクリプトを実行すること
 * （実行し忘れは tests/changelog.test.js が検出する）。
 */
const fs   = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

/**
 * CHANGELOG.md を { version, items } の配列に変換する。
 * items の各要素は { text, level }（level 0 = 通常の項目、1 = ぶら下がりの詳細）。
 */
function parseChangelog(md) {
  const versions = [];
  let cur = null;

  for (const rawLine of md.split(/\r?\n/)) {
    const head = rawLine.match(/^##\s+v?(\d+\.\d+\.\d+)\s*$/);
    if (head) {
      cur = { version: head[1], items: [] };
      versions.push(cur);
      continue;
    }
    if (!cur) continue;                       // 先頭の説明文は読み飛ばす

    const bullet = rawLine.match(/^(\s*)-\s+(.*)$/);
    if (bullet) {
      // インデント2つごとに1段深いネストとして扱う
      cur.items.push({ level: Math.min(Math.floor(bullet[1].length / 2), 1), text: bullet[2].trim() });
    } else if (rawLine.trim() && cur.items.length) {
      // 箇条書きの折り返し行は直前の項目に連結する
      cur.items[cur.items.length - 1].text += rawLine.trim();
    }
  }
  return versions;
}

function build() {
  const md       = fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8');
  const versions = parseChangelog(md);

  if (!versions.length) {
    console.error('CHANGELOG.md からバージョンを1件も読み取れませんでした。');
    process.exit(1);
  }

  const out = `'use strict';
// このファイルは tools/build-changelog.js が CHANGELOG.md から自動生成します。
// 直接編集せず、CHANGELOG.md を修正してから npm run build:changelog を実行してください。
// （サーバー無し・file:// でも改訂履歴を表示できるようJSとして埋め込んでいます）
const CHANGELOG = ${JSON.stringify(versions, null, 2)};
`;

  fs.writeFileSync(path.join(ROOT, 'js/changelog.js'), out, 'utf8');
  console.log(`js/changelog.js を生成しました（${versions.length} バージョン / ${(Buffer.byteLength(out) / 1024).toFixed(1)} KB）`);
}

// 直接実行されたときだけ生成する。
// テストからは parseChangelog だけを読み込みたいので、require では生成しない
// （生成してしまうと「生成し忘れ」を検出できなくなる）。
if (require.main === module) build();

module.exports = { parseChangelog };
