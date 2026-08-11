#!/usr/bin/env node
'use strict';
/**
 * tests/*.test.js を順に実行し、結果をまとめて表示する。
 * ブラウザを同時に何個も立ち上げると不安定になるため、意図的に直列実行する。
 *
 *   npm test              全テスト
 *   npm test layout undo  名前で絞り込み
 */
const { spawnSync } = require('child_process');
const fs   = require('fs');
const path = require('path');

const DIR    = __dirname;
const filter = process.argv.slice(2);

const files = fs.readdirSync(DIR)
  .filter(f => f.endsWith('.test.js'))
  .filter(f => !filter.length || filter.some(k => f.includes(k)))
  .sort();

if (!files.length) {
  console.error(filter.length ? `該当するテストがありません: ${filter.join(', ')}` : 'テストがありません');
  process.exit(1);
}

const failedFiles = [];
for (const f of files) {
  const r = spawnSync(process.execPath, [path.join(DIR, f)], { stdio: 'inherit' });
  if (r.status !== 0) failedFiles.push(f);
}

console.log('\n════════ まとめ ════════');
console.log(`実行: ${files.length} ファイル / 失敗: ${failedFiles.length} ファイル`);
if (failedFiles.length) {
  failedFiles.forEach(f => console.log(`  ✘ ${f}`));
  process.exit(1);
}
console.log('  すべて成功しました');
