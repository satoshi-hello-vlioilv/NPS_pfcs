'use strict';
/**
 * データ整合性まわりの不具合の回帰テスト。
 *  - 合流設定（merges）が Undo で戻らない
 *  - 合流先の記号を削除すると合流設定が残り、そのグループが整列されなくなる
 *  - 孫グループの合流が作成順によって配置されない
 *  - 編集モーダルで記号を加工・検査に変えると、前に開いた別記号の改善データが混入する
 *  - 非アクティブ工程図（改善前/後バリアント付き）の能力表モーダルが開かない
 *  - 別工程図への転送で、転送先に表示されない／Undo で記号が重複する
 */
const { run } = require('./_harness');

run('integrity', async (t) => {
  await t.load('chart');
  t.page.on('dialog', d => d.accept());
  await t.page.evaluate(() => {
    window.__sample = JSON.stringify({ nodes: S.nodes, edges: S.edges, listOrder: S.listOrder,
      groups: S.groups, merges: S.merges });
    window.__restore = () => {
      Object.assign(S, JSON.parse(__sample));
      S._undo = []; S._redo = []; S.sel = null; redraw();
    };
  });

  console.log('[1] 合流の解除を Undo で戻せる');
  const r1 = await t.page.evaluate(() => {
    __restore();
    const before = S.merges.length;
    deleteMerge(S.merges[0].id);
    const afterDel = S.merges.length;
    undo();
    const afterUndo = S.merges.length;
    redo();
    return { before, afterDel, afterUndo, afterRedo: S.merges.length };
  });
  t.log(JSON.stringify(r1));
  t.check('サンプルに合流がある（テストの前提）', r1.before > 0, r1);
  t.check('解除で0件になる', r1.afterDel === r1.before - 1, r1);
  t.check('Undo で合流が戻る', r1.afterUndo === r1.before, r1);
  t.check('Redo で再び解除される', r1.afterRedo === r1.before - 1, r1);

  console.log('[2] 合流先の記号を削除すると合流設定も消え、そのグループが整列される');
  const r2 = await t.page.evaluate(() => {
    __restore();
    const m = S.merges[0];
    const subId = S.nodes.find(n => n.groupId === m.subGroupId).id;
    S.sel = { kind: 'node', id: m.targetNodeId }; deleteSel();
    const dangling = S.merges.some(x => !N(x.targetNodeId));
    N(subId).x = 5000;
    alignLayout();
    return { dangling, subX: N(subId).x };
  });
  t.log(JSON.stringify(r2));
  t.check('合流先の無い合流設定が残らない', !r2.dangling, r2);
  t.check('合流元グループも整列で配置される', r2.subX < 5000, r2);

  console.log('[3] 孫グループの合流が作成順に関係なく配置される');
  const r3 = await t.page.evaluate(() => {
    S.nodes = []; S.edges = []; S.listOrder = []; S.groups = []; S.merges = [];
    for (const id of ['BB', 'CH', 'GC']) S.groups.push({ id, label: id, color: '#6366f1' });
    const mk = (id, gid) => { const n = mkNode('kako', 0, 0); n.id = id; n.groupId = gid; S.nodes.push(n); S.listOrder.push(id); };
    ['b1', 'b2', 'b3', 'b4', 'b5'].forEach(i => mk(i, 'BB'));
    ['c1', 'c2', 'c3'].forEach(i => mk(i, 'CH'));
    ['g1', 'g2'].forEach(i => mk(i, 'GC'));
    S.backboneGroupId = 'BB';
    S.merges.push({ id: 'm2', subGroupId: 'GC', targetNodeId: 'c3' }); // 孫を先に登録
    S.merges.push({ id: 'm1', subGroupId: 'CH', targetNodeId: 'b4' });
    N('g1').x = N('g2').x = 9999;
    syncChartFromListOrder();
    return { g2x: N('g2').x, c3x: N('c3').x };
  });
  t.log(JSON.stringify(r3));
  t.check('孫グループの末端が合流先の左に置かれる', r3.g2x < r3.c3x, r3);

  console.log('[4] 編集モーダルで種類を変えても、他の記号の改善データが混入しない');
  const r4 = await t.page.evaluate(() => {
    __restore();
    const k = S.nodes.find(n => n.type === 'kako');
    const other = S.nodes.find(n => !isNumType(n.type) && !isBase(n.type));
    openModal(k.id);
    switchModalTab('imp');
    // 保存時に入力欄の値で確定されるため、入力欄にも書き込む
    document.getElementById('m-imp-labelOverride').value = 'LEAKED';
    onImpField('labelOverride', 'LEAKED');
    saveModal();
    openModal(other.id);
    selectModalType('kako');
    saveModal();
    const imp = N(other.id).improvement || {};
    return { before: imp.before?.labelOverride ?? '', after: imp.after?.labelOverride ?? '' };
  });
  t.log(JSON.stringify(r4));
  t.check('別記号のラベル上書きが混入しない', r4.before !== 'LEAKED' && r4.after !== 'LEAKED', r4);

  console.log('[5] 非アクティブ工程図の能力表モーダルが、表示中のモードのデータで開く');
  const r5 = await t.page.evaluate(() => {
    setImprovementMode('after');
    const other = W.charts.find(c => c.id !== W.activeId);
    const vk = other.impVariants.after.nodes.find(n => isNumType(n.type));
    vk.improvement = { ...(vk.improvement || {}), after: { ...(vk.improvement?.after || {}), manualTime: 777 } };
    switchView('capacity');
    openCapImpModal(vk.id, other.id);
    const shown = document.getElementById('cap-imp-modal').classList.contains('show');
    const manual = document.getElementById('ci-manualTime')?.value ?? null;
    closeCapImpModal();
    setImprovementMode('before');
    switchView('chart');
    return { shown, manual };
  });
  t.log(JSON.stringify(r5));
  t.check('モーダルが開く', r5.shown, r5);
  t.check('バリアント側の値が表示される', r5.manual === '777', r5);

  console.log('[6] 別工程図への転送で、転送先に表示され、Undo で重複しない');
  const r6 = await t.page.evaluate(() => {
    __restore();
    pushUndo(); // 転送前に履歴がある状態にする
    const n = S.nodes.find(x => isNumType(x.type));
    const tgt = W.charts.find(c => c.id !== W.activeId);
    _crossChartTransfer(n.id, tgt.id);
    const visible = getChartData(tgt).nodes.some(x => x.id === n.id);
    const goneFromSource = !N(n.id);
    undo();
    return { visible, goneFromSource, backInSource: !!N(n.id) };
  });
  t.log(JSON.stringify(r6));
  t.check('転送先に表示される', r6.visible, r6);
  t.check('転送元からは消える', r6.goneFromSource, r6);
  t.check('Undo しても転送元に復活しない（重複しない）', !r6.backInSource, r6);
});
