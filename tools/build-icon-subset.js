#!/usr/bin/env node
/**
 * Font Awesome サブセットCSSの生成スクリプト。
 *
 * このプロジェクトは外部CDNに依存せず、使用しているアイコンだけを
 * vendor/ 配下に同梱している（外部接続が遮断された社内・工場ネットワークでも
 * アイコンが表示されるようにするため）。
 * アイコンを追加・変更したら次を実行してサブセットを作り直すこと。
 *
 *   npm pack @fortawesome/fontawesome-free@6.5.1
 *   tar xzf fortawesome-fontawesome-free-6.5.1.tgz
 *   node tools/build-icon-subset.js ./package
 *
 * 第1引数には展開した fontawesome-free パッケージのディレクトリを渡す。
 * webfonts/*.woff2 は手動で vendor/webfonts/ へコピーする。
 */
'use strict';
const fs   = require('fs');
const path = require('path');

const pkgDir = process.argv[2];
if (!pkgDir) {
  console.error('使い方: node tools/build-icon-subset.js <fontawesome-freeパッケージのパス>');
  process.exit(1);
}
const ROOT = path.resolve(__dirname, '..');

// ── 1. ソース中で使われているアイコン名を集める ──────────────
const SRC = ['index.html', 'js/core.js', 'js/graph.js', 'js/main.js', 'js/render.js', 'js/ui.js']
  .map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');

const used = new Set();
for (const m of SRC.matchAll(/\bfa-[a-z0-9-]+/g)) {
  // `fa-chevron-${cond ? ...}` のようなテンプレートリテラルは前半だけが一致するため、
  // 末尾がハイフンの不完全な名前は捨てる（実際の値は DYNAMIC 側で補う）。
  if (!m[0].endsWith('-')) used.add(m[0]);
}

// ユーティリティクラス（グリフを持たない）は除外
for (const u of ['fa-solid', 'fa-regular', 'fa-brands', 'fa-fw', 'fa-spin']) used.delete(u);

/* テンプレートリテラルで動的に組み立てられるアイコン名（`fa-${cond ? 'a' : 'b'}` など）は
   正規表現では拾えないため、実際に取りうる値をここに明示しておく。
   新しく動的アイコンを追加した場合はこのリストにも追記すること。 */
const DYNAMIC = [
  'fa-square', 'fa-palette', 'fa-circle-half-stroke',   // 枠/色トグル
  'fa-bone', 'fa-circle-exclamation',                   // 背骨バッジ
  'fa-triangle-exclamation',                            // showToast(warn)
  'fa-diagram-project', 'fa-code-branch',               // 経路図テーブル見出し
  'fa-scale-balanced', 'fa-arrow-up', 'fa-arrow-down',  // LAYOUT_MODES
  'fa-angles-up', 'fa-angles-down', 'fa-hand',
  'fa-chevron-down', 'fa-chevron-right', 'fa-folder', 'fa-folder-open', 'fa-eye', 'fa-eye-slash',
];
DYNAMIC.forEach(n => used.add(n));

// ── 2. 本家CSSから content(グリフ番号) を取り出す ──────────────
const faCss = fs.readFileSync(path.join(pkgDir, 'css/all.min.css'), 'utf8');
const contentMap = new Map();
for (const m of faCss.matchAll(/((?:\.fa-[a-z0-9-]+:before\s*,?\s*)+)\{content:"(\\[0-9a-f]+)"\}/g)) {
  for (const s of m[1].matchAll(/\.(fa-[a-z0-9-]+):before/g)) contentMap.set(s[1], m[2]);
}

const found   = [...used].filter(n => contentMap.has(n)).sort();
const missing = [...used].filter(n => !contentMap.has(n)).sort();

// Free版に存在しないアイコン（Pro専用など）は指定しても表示されないので警告する
if (missing.length) {
  console.warn('警告: Font Awesome Free に存在しないアイコンが使われています:');
  missing.forEach(n => console.warn('  - ' + n));
  console.warn('  → Free版のアイコンに置き換えてください（このままでは表示されません）。');
}

// ── 3. サブセットCSSを書き出す ────────────────────────────
const rules = found.map(n => `.${n}:before{content:"${contentMap.get(n)}"}`).join('\n');
const out = `/*!
 * Font Awesome Free 6.5.1 (subset) — https://fontawesome.com
 * License: CC BY 4.0 (icons), SIL OFL 1.1 (fonts), MIT (code)
 *
 * このプロジェクトで実際に使用している ${found.length} 個のアイコンだけを抽出したサブセット。
 * 外部CDN(cdnjs)から読み込むと、外部接続が遮断された社内・工場ネットワークでは
 * アイコンが一切表示されなくなるため、ローカルに同梱している。
 * このファイルは tools/build-icon-subset.js が生成する（直接編集しないこと）。
 */
@font-face{
  font-family:'Font Awesome 6 Free';
  font-style:normal;font-weight:900;font-display:block;
  src:url(webfonts/fa-solid-900.woff2) format('woff2');
}
@font-face{
  font-family:'Font Awesome 6 Free';
  font-style:normal;font-weight:400;font-display:block;
  src:url(webfonts/fa-regular-400.woff2) format('woff2');
}
.fa,.fas,.fa-solid,.far,.fa-regular{
  -moz-osx-font-smoothing:grayscale;-webkit-font-smoothing:antialiased;
  display:var(--fa-display,inline-block);font-style:normal;font-variant:normal;
  line-height:1;text-rendering:auto;font-family:'Font Awesome 6 Free';
}
.fa,.fas,.fa-solid{font-weight:900;}
.far,.fa-regular{font-weight:400;}
.fa-fw{text-align:center;width:1.25em;}
.fa-spin{animation:fa-spin 2s linear infinite;}
@keyframes fa-spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}
${rules}
`;
fs.writeFileSync(path.join(ROOT, 'vendor/fontawesome-subset.css'), out, 'utf8');
console.log(`vendor/fontawesome-subset.css を生成しました（${found.length} アイコン / ${(Buffer.byteLength(out) / 1024).toFixed(1)} KB）`);
