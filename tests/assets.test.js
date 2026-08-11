'use strict';
/**
 * オフライン動作の保証テスト。
 *
 * 以前は Google Fonts と Font Awesome を外部CDNから読み込んでいたため、
 * 外部接続が遮断された社内・工場ネットワークではアイコンが一切表示されず、
 * 日本語書体も適用されなかった。同梱アセットだけで動くことを常に確認する。
 */
const fs   = require('fs');
const path = require('path');
const { run, ROOT } = require('./_harness');

run('assets', async (t) => {
  const external = [], failed = [];
  t.page.on('request', r => {
    const u = r.url();
    if (!u.startsWith(t.baseURL) && !u.startsWith('data:') && !u.startsWith('blob:')) external.push(u);
  });
  t.page.on('requestfailed', r => failed.push(`${r.url()} :: ${r.failure()?.errorText}`));

  await t.load();
  await t.page.waitForTimeout(800);

  console.log('[1] 外部への通信が発生しない');
  t.check('外部ホストへのリクエストが0件', external.length === 0, external.join(' / '));
  t.check('読み込み失敗のリクエストが0件', failed.length === 0, failed.join(' / '));

  console.log('[2] アイコン書体がローカルから読み込まれる');
  const f = await t.page.evaluate(async () => {
    await document.fonts.ready;
    const icon = document.querySelector('.fa-solid');
    return {
      faces: Array.from(document.fonts).map(x => `${x.family}/${x.weight}`),
      iconFamily: icon ? getComputedStyle(icon).fontFamily : null,
      iconWidth:  icon ? icon.getBoundingClientRect().width : 0,
      bodyFamily: getComputedStyle(document.body).fontFamily,
    };
  });
  t.log(JSON.stringify(f.faces));
  t.check('Font Awesome が読み込まれている', f.faces.some(x => x.startsWith('Font Awesome')), f.faces);
  t.check('IBM Plex Mono が読み込まれている', f.faces.some(x => x.startsWith('IBM Plex Mono')), f.faces);
  t.check('アイコン要素にアイコン書体が適用される', /Font Awesome/.test(f.iconFamily || ''), f.iconFamily);
  t.check('アイコンが幅を持って描画される', f.iconWidth > 0, f.iconWidth);
  t.check('本文にOS標準の日本語書体スタックが指定される', /Yu Gothic|Hiragino|Meiryo/.test(f.bodyFamily), f.bodyFamily);

  console.log('[3] 同梱アセットが実在する');
  for (const rel of [
    'vendor/fontawesome-subset.css', 'vendor/ibm-plex-mono.css',
    'vendor/webfonts/fa-solid-900.woff2', 'vendor/webfonts/fa-regular-400.woff2',
    'vendor/webfonts/ibm-plex-mono-400.woff2', 'vendor/webfonts/ibm-plex-mono-700.woff2',
  ]) {
    t.check(`${rel} がある`, fs.existsSync(path.join(ROOT, rel)), rel);
  }

  console.log('[4] HTMLに外部CDNの参照が残っていない');
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  t.check('cdnjsへの参照がない', !html.includes('cdnjs.cloudflare.com'));
  t.check('fonts.googleapisへの参照がない', !html.includes('fonts.googleapis.com'));

  console.log('[5] 使用アイコンがすべてサブセットに含まれている');
  const subset = fs.readFileSync(path.join(ROOT, 'vendor/fontawesome-subset.css'), 'utf8');
  const src = ['index.html', 'js/core.js', 'js/graph.js', 'js/main.js', 'js/render.js', 'js/ui.js']
    .map(p => fs.readFileSync(path.join(ROOT, p), 'utf8')).join('\n');
  const util = new Set(['fa-solid', 'fa-regular', 'fa-brands', 'fa-fw', 'fa-spin']);
  const usedIcons = [...new Set([...src.matchAll(/\bfa-[a-z0-9-]+/g)].map(m => m[0]))]
    .filter(n => !util.has(n) && !n.endsWith('-'));   // 末尾ハイフンはテンプレートリテラルの断片
  const notInSubset = usedIcons.filter(n => !subset.includes(`.${n}:before`));
  t.check('未収録のアイコンがない（あればtools/build-icon-subset.jsを再実行）',
    notInSubset.length === 0, notInSubset.join(', '));
});
