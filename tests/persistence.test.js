'use strict';
/**
 * 保存・復元まわりのテスト。
 * 保存先（IndexedDB）への往復、JSONの往復、旧形式データの後方互換を確認する。
 */
const { run } = require('./_harness');

run('persistence', async (t) => {
  await t.load('list');

  console.log('[1] 保存 → リロードで状態が復元される');
  const gid = await t.page.evaluate(async () => {
    const g = addGroup('永続テスト', '#f43f5e');
    S.sel = null; S.activeGroupId = g;
    alignLayout('bottomOnly');
    await saveNow();          // 保存完了を待ってからリロードする
    return g;
  });
  await t.page.reload();
  await t.page.waitForTimeout(600);
  const r1 = await t.page.evaluate(() => ({
    layoutMode: S.layoutMode, activeGroupId: S.activeGroupId,
    label: document.getElementById('layout-mode-label')?.textContent,
    groupExists: !!G(S.activeGroupId),
  }));
  t.log(JSON.stringify(r1));
  t.check('配置パターンが復元される', r1.layoutMode === 'bottomOnly', r1);
  t.check('追加先グループが復元される', r1.activeGroupId === gid, r1);
  t.check('復元したグループが実在する', r1.groupExists, r1);
  t.check('ボタン表示も復元される', r1.label === '下配置', r1);

  console.log('[2] JSON保存の往復');
  const r2 = await t.page.evaluate(() => {
    syncActiveChart();
    const parsed = JSON.parse(JSON.stringify({ charts: W.charts, activeId: W.activeId }));
    const c = parsed.charts.find(x => x.id === parsed.activeId);
    const v = c.impVariants ? c.impVariants[improvementMode] : c;
    return { layoutMode: v.layoutMode, activeGroupId: v.activeGroupId, merges: Array.isArray(v.merges) };
  });
  t.log(JSON.stringify(r2));
  t.check('JSONに配置パターンが含まれる', r2.layoutMode === 'bottomOnly', r2);
  t.check('JSONに追加先グループが含まれる', !!r2.activeGroupId, r2);

  console.log('[3] 新フィールドを持たない旧形式JSONでも壊れない');
  const r3 = await t.page.evaluate(() => {
    syncActiveChart();
    const parsed = JSON.parse(JSON.stringify({ charts: W.charts, activeId: W.activeId }));
    parsed.charts.forEach(c => {
      delete c.layoutMode; delete c.activeGroupId;
      if (c.impVariants) Object.values(c.impVariants).forEach(v => { delete v.layoutMode; delete v.activeGroupId; });
    });
    W.charts = parsed.charts; W.activeId = parsed.activeId;
    loadChartIntoS(W.charts.find(c => c.id === W.activeId));
    redraw();
    return { layoutMode: S.layoutMode, activeGroupId: S.activeGroupId, nodes: S.nodes.length };
  });
  t.log(JSON.stringify(r3));
  t.check('配置パターンは既定値balanceになる', r3.layoutMode === 'balance', r3);
  t.check('追加先グループはnullで安全', r3.activeGroupId === null, r3);
  t.check('ノードは問題なく読み込める', r3.nodes > 0, r3);

  console.log('[4] 全消去で残留データが消える');
  await t.load();
  const r4 = await t.page.evaluate(() => {
    window.confirm = () => true;
    const before = (S.merges || []).length;
    clearAll();
    syncActiveChart();
    return { before, merges: (S.merges || []).length, chartMerges: (W.charts[0].merges || []).length,
             active: S.activeGroupId, mode: S.layoutMode };
  });
  t.log(JSON.stringify(r4));
  t.check('消去前に合流設定が存在する（テストの前提）', r4.before > 0, r4);
  t.check('合流設定が残らない', r4.merges === 0 && r4.chartMerges === 0, r4);
  t.check('追加先グループ・配置パターンも初期化される', r4.active === null && r4.mode === 'balance', r4);

  console.log('[5] 大きなデータでも保存できる');
  const r5 = await t.page.evaluate(async () => {
    clearAll();
    const mk = (id, type, x, y, gid) => ({
      id, type, x, y, label: '工程' + id, note: '', comment: '', unit: '', unitQty: '',
      badges: [], badgePos: 'top', badgeOffsets: {}, badgeBorders: {},
      badgeColors: {}, badgeColorEnabled: {}, groupId: gid, listParentIds: [],
    });
    for (let g = 0; g < 10; g++) {
      S.groups.push({ id: 'G' + g, label: 'グループ' + g, color: '#6366f1' });
      for (let i = 0; i < 20; i++) {
        S.nodes.push(mk(`n${g}_${i}`, i === 0 ? 'naisei' : (i === 19 ? 'tt_k' : 'kako'), i * 100, g * 200, 'G' + g));
        if (i > 0) S.edges.push({ id: `e${g}_${i}`, from: `n${g}_${i-1}`, fromPort: 'r', to: `n${g}_${i}`, toPort: 'l' });
      }
    }
    S.listOrder = S.nodes.map(n => n.id);
    S.backboneGroupId = 'G0';
    const okSave = await saveNow();
    return { nodes: S.nodes.length, okSave };
  });
  t.log(JSON.stringify(r5));
  t.check('200工程規模でも保存が成功する', r5.okSave === true, r5);
  await t.page.reload();
  await t.page.waitForTimeout(700);
  const r5b = await t.page.evaluate(() => ({ nodes: S.nodes.length }));
  t.check('リロード後も全ノードが復元される', r5b.nodes === r5.nodes, { saved: r5.nodes, loaded: r5b.nodes });

  // ── [6] 旧バージョン(localStorage)のデータが引き継がれる ──
  // 既存利用者がこのバージョンへ更新したとき、作りためた工程図が消えないことを保証する。
  console.log('[6] 旧localStorageデータからの移行');
  await t.page.goto(`${t.baseURL}/`);
  await t.resetStorage();
  await t.page.evaluate(() => {
    // 旧バージョンが書いていた形式をそのまま再現する
    localStorage.setItem('nps_workspace_v3', JSON.stringify({
      charts: [{
        id: 'oldchart', name: '旧バージョンの工程図', backboneGroupId: null,
        meta: { hb: 'OLD-1', hm: '旧製品', sk: '', dt: '2024-01-01' },
        nodes: [{ id: 'o1', type: 'naisei', x: 0, y: 0, label: '旧工程', badges: [], groupId: null }],
        edges: [], groups: [], merges: [], listOrder: ['o1'],
      }],
      activeId: 'oldchart', uid: 42,
    }));
  });
  await t.page.reload();
  await t.page.waitForTimeout(700);
  const r6 = await t.page.evaluate(async () => ({
    chartName: W.charts[0]?.name,
    nodes: S.nodes.length,
    metaHb: S.meta.hb,
    movedToIdb: !!(await idbGet('workspace_v3')),
    oldKeyRemoved: localStorage.getItem('nps_workspace_v3') === null,
  }));
  t.log(JSON.stringify(r6));
  t.check('旧データの工程図が読み込まれる', r6.chartName === '旧バージョンの工程図', r6);
  t.check('旧データの工程が復元される', r6.nodes === 1, r6);
  t.check('旧データの図面情報も復元される', r6.metaHb === 'OLD-1', r6);
  t.check('IndexedDBへ移行される', r6.movedToIdb, r6);
  t.check('移行後は旧localStorageキーが削除される', r6.oldKeyRemoved, r6);
});
