'use strict';
/**
 * Undo/Redo の一貫性テスト。
 *
 * 自動配置パターン(S.layoutMode)は記号座標と一体で巻き戻す必要がある。
 * 片方だけ戻すと「ボタンには『上配置』と出ているのに上配置されていない」状態になるため。
 */
const { run } = require('./_harness');

run('undo', async (t) => {
  await t.load();

  console.log('[1] 配置パターン切替 → undo で座標とパターンが同時に戻る');
  const r1 = await t.page.evaluate(() => {
    setLayoutMode('bottomOnly');                 // 起点を下配置にする
    const startY = N('sn7').y, startMode = S.layoutMode;
    setLayoutMode('topOnly');
    const newY = N('sn7').y;
    undo();
    return { startY, startMode, newY, afterY: N('sn7').y, afterMode: S.layoutMode,
             afterLabel: document.getElementById('layout-mode-label')?.textContent };
  });
  t.log(JSON.stringify(r1));
  t.check('切替で座標が実際に変わる（テストの前提）', r1.startY !== r1.newY, r1);
  t.check('undoで座標が戻る', r1.afterY === r1.startY, r1);
  t.check('undoでパターンも戻る', r1.afterMode === r1.startMode, r1);
  t.check('ボタン表示も戻る', r1.afterLabel === '下配置', r1);

  console.log('[2] redo で再びパターンと座標が進む');
  const r2 = await t.page.evaluate(() => {
    redo();
    return { y: N('sn7').y, mode: S.layoutMode };
  });
  t.check('redoでパターンがtopOnlyに進む', r2.mode === 'topOnly', r2);
  t.check('redoで座標も上側に進む', r2.y < 0, r2);

  console.log('[3] 1回の切替で積まれるundoは1件だけ');
  await t.load();
  const r3 = await t.page.evaluate(() => {
    setLayoutMode('bottomOnly');
    const before = S._undo.length;
    setLayoutMode('topOnly');
    const added = S._undo.length - before;
    undo();
    return { added, mode: S.layoutMode };
  });
  t.log(JSON.stringify(r3));
  t.check('積まれるundoは1件', r3.added === 1, r3);
  t.check('1回のundoで前のパターンに戻る', r3.mode === 'bottomOnly', r3);

  console.log('[4] 整列ボタン単体はパターンを変えない');
  const r4 = await t.page.evaluate(() => {
    setLayoutMode('topOnly');
    alignLayout();               // 引数なし = パターン変更なし
    return { mode: S.layoutMode };
  });
  t.check('引数なしalignLayoutはパターンを維持', r4.mode === 'topOnly', r4);

  console.log('[5] グループ削除→undo で追加先グループが不整合にならない');
  await t.load('list');
  const r5 = await t.page.evaluate(() => {
    window.confirm = () => true;
    const gid = addGroup('一時グループ', '#f43f5e');
    S.sel = null; S.activeGroupId = gid; redraw();
    deleteGroup(gid);
    undo();
    return { groupBack: !!G(gid), active: S.activeGroupId, resolved: resolveActiveGroupId() };
  });
  t.log(JSON.stringify(r5));
  t.check('undoでグループが復活する', r5.groupBack, r5);
  t.check('復活したグループが追加先として解決できる', r5.resolved === r5.active || !!G(r5.resolved), r5);
});
