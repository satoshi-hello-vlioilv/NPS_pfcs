'use strict';
/**
 * バージョン表示と改訂履歴のテスト。
 *
 * 履歴データ js/changelog.js は CHANGELOG.md から自動生成しているため、
 * 生成し忘れて両者がずれていないかもここで検出する。
 */
const fs   = require('fs');
const path = require('path');
const { run, ROOT } = require('./_harness');
const { parseChangelog } = require('../tools/build-changelog');

/** js/changelog.js から CHANGELOG 配列を取り出す */
function loadGeneratedChangelog() {
  const js = fs.readFileSync(path.join(ROOT, 'js/changelog.js'), 'utf8');
  const m  = js.match(/const CHANGELOG = ([\s\S]*);\s*$/);
  if (!m) throw new Error('js/changelog.js から CHANGELOG を読み取れませんでした');
  return JSON.parse(m[1]);
}

run('changelog', async (t) => {
  console.log('[1] CHANGELOG.md と js/changelog.js が同期している');
  const md        = fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8');
  const expected  = parseChangelog(md);
  const generated = loadGeneratedChangelog();
  t.check('CHANGELOG.md から1件以上読み取れる', expected.length > 0, expected.length);
  t.check('生成物の内容が CHANGELOG.md と一致する（ずれていれば npm run build:changelog）',
    JSON.stringify(generated) === JSON.stringify(expected),
    `md=${expected.length}件 / js=${generated.length}件`);

  console.log('[2] APP_VERSION が CHANGELOG の最新版と一致する');
  const core   = fs.readFileSync(path.join(ROOT, 'js/core.js'), 'utf8');
  const appVer = core.match(/const APP_VERSION = '([^']+)'/)[1];
  const pkgVer = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
  t.check('APP_VERSION が CHANGELOG 先頭のバージョンと一致', appVer === expected[0].version,
    { appVer, changelog: expected[0].version });
  t.check('package.json のバージョンとも一致', pkgVer === appVer, { pkgVer, appVer });

  console.log('[3] バージョンバッジの表示');
  await t.load();
  const badge = await t.page.evaluate(() => {
    const el = document.getElementById('app-version');
    return { text: el?.textContent, tag: el?.tagName, cursor: getComputedStyle(el).cursor };
  });
  t.log(JSON.stringify(badge));
  t.check('バッジに ver 付きで表示される', badge.text === 'ver' + appVer, badge);
  t.check('バッジはクリックできる要素である', badge.tag === 'BUTTON', badge);
  t.check('クリックできることが見た目でわかる', badge.cursor === 'pointer', badge);

  console.log('[4] バッジのクリックで改訂履歴が開く');
  await t.page.click('#app-version');
  await t.page.waitForTimeout(300);
  const open = await t.page.evaluate(() => ({
    shown:    document.getElementById('changelog-modal').classList.contains('show'),
    versions: document.querySelectorAll('.chg-ver').length,
    current:  document.querySelectorAll('.chg-ver-current').length,
    firstVer: document.querySelector('.chg-ver-num')?.textContent,
    curLabel: document.getElementById('chg-current-ver')?.textContent,
  }));
  t.log(JSON.stringify(open));
  t.check('モーダルが開く', open.shown, open);
  t.check('全バージョンが一覧表示される', open.versions === expected.length, open);
  t.check('使用中バージョンが1件だけ強調される', open.current === 1, open);
  t.check('先頭に最新バージョンが出る', open.firstVer === 'ver' + appVer, open);
  t.check('見出しに現在のバージョンが出る', open.curLabel === 'ver' + appVer, open);

  console.log('[5] 変更の大きさ（メジャー/マイナー/パッチ）が判定される');
  const kinds = await t.page.evaluate(() => {
    const secs = [...document.querySelectorAll('.chg-ver')];
    const kindOf = v => secs.find(s => s.querySelector('.chg-ver-num').textContent === 'ver' + v)
      ?.querySelector('.chg-ver-kind')?.textContent;
    return { v1_19_1: kindOf('1.19.1'), v1_18_1: kindOf('1.18.1'), v1_0_0: kindOf('1.0.0') };
  });
  t.log(JSON.stringify(kinds));
  t.check('1.19.0→1.19.1 はパッチ', kinds.v1_19_1 === 'パッチ', kinds);
  t.check('1.18.0→1.18.1 はパッチ', kinds.v1_18_1 === 'パッチ', kinds);
  t.check('最初のバージョンはメジャー', kinds.v1_0_0 === 'メジャー', kinds);

  console.log('[6] マークダウンがエスケープされたうえで整形される');
  const md6 = await t.page.evaluate(() => ({
    strong: document.querySelectorAll('.chg-item strong').length,
    code:   document.querySelectorAll('.chg-item code, .chg-sub code').length,
    // 履歴本文が生のHTMLとして実行されていないこと
    injected: document.querySelectorAll('.chg-body script').length,
  }));
  t.log(JSON.stringify(md6));
  t.check('**強調** が太字になる', md6.strong > 0, md6);
  t.check('`コード` が整形される', md6.code > 0, md6);
  t.check('本文からscriptが生成されない', md6.injected === 0, md6);

  console.log('[7] Esc と閉じるボタンで閉じられる');
  await t.page.keyboard.press('Escape');
  await t.page.waitForTimeout(200);
  t.check('Escで閉じる',
    !(await t.page.evaluate(() => document.getElementById('changelog-modal').classList.contains('show'))));

  await t.page.click('#app-version');
  await t.page.waitForTimeout(200);
  await t.page.click('#changelog-modal .m-close-btn');
  await t.page.waitForTimeout(200);
  t.check('閉じるボタンで閉じる',
    !(await t.page.evaluate(() => document.getElementById('changelog-modal').classList.contains('show'))));

  console.log('[8] 改訂履歴を開いてもEscで配置モードが解除されない（他機能への干渉なし）');
  const noInterfere = await t.page.evaluate(() => {
    setPlaceMode('kako');
    const before = placeType;
    openChangelogModal();
    return { before, afterOpen: placeType };
  });
  await t.page.keyboard.press('Escape');
  await t.page.waitForTimeout(200);
  const after = await t.page.evaluate(() => ({
    shown: document.getElementById('changelog-modal').classList.contains('show'),
    placeType,
  }));
  t.log(JSON.stringify({ ...noInterfere, ...after }));
  t.check('履歴が開いている間のEscは履歴だけを閉じる', !after.shown && after.placeType === 'kako',
    { ...noInterfere, ...after });
});
