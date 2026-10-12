'use strict';
/**
 * 細かな不具合の回帰テスト。
 *  - ダイアログ表示中に Delete キーで背後の記号が消える
 *  - バッジポップオーバーでの変更が Undo できない
 *  - 編集画面で起点⇔通常記号に変えても配線の非表示設定が変わらない
 *  - グループの合流を循環させられる
 *  - 改善前/後を持つ工程図を複製するとバリアント側のIDが複製元と重複する
 *  - 細工したJSONを読み込むと、ID・色などがそのままHTMLに埋め込まれる
 */
const { run } = require('./_harness');

run('minor-fixes', async (t) => {
  await t.load('chart');
  const alerts = [];
  t.page.on('dialog', d => { if (d.type() === 'alert') alerts.push(d.message()); d.accept(); });

  console.log('[1] ダイアログ表示中は Delete キーで記号が消えない');
  const nid = await t.page.evaluate(() => {
    const n = S.nodes.find(x => isNumType(x.type));
    S.sel = { kind: 'node', id: n.id }; redraw();
    openExportDialog();
    return n.id;
  });
  await t.page.keyboard.press('Delete');
  const r1 = await t.page.evaluate(id => {
    const exists = !!N(id);
    closeExportDialog();
    return { exists };
  }, nid);
  t.check('記号が残っている', r1.exists, r1);

  console.log('[2] バッジポップオーバーでの変更を Undo できる');
  const r2 = await t.page.evaluate(() => {
    const n = S.nodes.find(x => isNumType(x.type));
    S._undo = []; S._redo = []; // 以前の操作の履歴で偶然元に戻らないよう空にする
    const before = JSON.stringify(n.badges || []);
    const btn = document.createElement('button'); document.body.appendChild(btn);
    _bpopNid = null;
    openBadgePop(n.id, btn);
    document.querySelector('#_badge_pop .bpop-btn[data-bid="kaizen"]').click();
    const changed = JSON.stringify(N(n.id).badges);
    document.getElementById('_badge_pop')?.remove(); btn.remove();
    undo();
    return { before, changed, after: JSON.stringify(N(n.id).badges || []) };
  });
  t.log(JSON.stringify(r2));
  t.check('バッジが変更される（テストの前提）', r2.changed !== r2.before, r2);
  t.check('Undo で元に戻る', r2.after === r2.before, r2);

  console.log('[3] 編集画面で起点⇔通常記号に変えると配線の非表示設定が付け直される');
  const r3 = await t.page.evaluate(() => {
    const e = S.edges.find(x => !x.hidden && !isBase(N(x.from).type) && !isBase(N(x.to).type));
    const fromId = e.from;
    const origType = N(fromId).type;
    openModal(fromId); selectModalType('naisei'); saveModal();
    const hiddenAsBase = !!E(e.id).hidden;
    openModal(fromId); selectModalType(origType); saveModal();
    return { hiddenAsBase, hiddenAfterRevert: !!E(e.id).hidden };
  });
  t.log(JSON.stringify(r3));
  t.check('起点にすると非表示配線になる', r3.hiddenAsBase, r3);
  t.check('元に戻すと表示配線に戻る', !r3.hiddenAfterRevert, r3);

  console.log('[4] 合流が循環する接続は作れない');
  const r4 = await t.page.evaluate(() => {
    const m = S.merges[0];
    const tgtGroup = N(m.targetNodeId).groupId;
    const subNode = S.nodes.find(n => n.groupId === m.subGroupId);
    const otherGroupNode = S.nodes.find(n => n.groupId && n.groupId !== m.subGroupId && n.groupId !== tgtGroup);
    return {
      reverse: _wouldCreateMergeCycle(tgtGroup, subNode.id),
      normal:  otherGroupNode ? _wouldCreateMergeCycle(otherGroupNode.groupId, m.targetNodeId) : false,
    };
  });
  t.log(JSON.stringify(r4));
  t.check('逆向きの合流は循環と判定される', r4.reverse, r4);
  t.check('循環しない合流は許可される', !r4.normal, r4);

  console.log('[5] 改善前/後を持つ工程図の複製でIDが重複しない');
  const r5 = await t.page.evaluate(() => {
    const src = W.charts.find(c => c.impVariants);
    const ids = c => new Set([c, ...Object.values(c.impVariants || {})].flatMap(d =>
      [...(d.nodes || []).map(n => n.id), ...(d.groups || []).map(g => g.id)]));
    duplicateChart(src.id);
    const copy = W.charts[W.charts.length - 1];
    const a = ids(src), b = ids(copy);
    const shared = [...b].filter(x => a.has(x));
    const v = copy.impVariants.after;
    const refsOk = v.nodes.every(n => !n.groupId || v.groups.some(g => g.id === n.groupId))
      && v.listOrder.every(id => v.nodes.some(n => n.id === id));
    return { shared: shared.length, refsOk };
  });
  t.log(JSON.stringify(r5));
  t.check('複製元とIDを共有しない', r5.shared === 0, r5);
  t.check('バリアント内の参照が保たれる', r5.refsOk, r5);

  console.log('[6] 細工したJSONを読み込んでもスクリプトが実行されない');
  const evil = {
    charts: [{
      id: "c1');alert('chart", name: '<img src=x onerror=alert(1)>',
      nodes: [
        { id: "n1');alert('node", type: 'naisei', x: 0, y: 0, label: '<b>x</b>', groupId: "g1\" onmouseover=\"alert(1)" },
        { id: 'n2', type: 'kako', x: '"><script>alert(1)</script>', y: 0, label: 'ok', groupId: "g1\" onmouseover=\"alert(1)",
          unitQty: '<img src=x onerror=alert(1)>', unit: 'kg', badges: ['unit', '<x>'],
          badgeColors: { unit: 'red" onload="alert(1)' } },
        { id: 'n3', type: '<svg onload=alert(1)>', x: 0, y: 0 },
      ],
      edges: [{ id: 'e1', from: "n1');alert('node", fromPort: 'r', to: 'n2', toPort: 'l' }],
      groups: [{ id: "g1\" onmouseover=\"alert(1)", label: 'G', color: 'red;" onmouseover="alert(1)' }],
      merges: [], listOrder: ["n1');alert('node", 'n2'],
    }],
    activeId: "c1');alert('chart",
    machineMaster: [{ id: "m1');alert('m", name: 'M', manualTime: '1);alert(1', autoTime: 1, toolChangeTime: 1, toolChangeFrequency: 1 }],
  };
  await t.page.setInputFiles('#fload', { name: 'evil.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(evil)) });
  await t.page.waitForTimeout(300);
  const r6 = await t.page.evaluate(() => {
    switchView('list'); updateListPanel();
    const n2 = S.nodes.find(n => n.label === 'ok');
    S.sel = { kind: 'node', id: n2.id }; redraw();
    const safe = /^[A-Za-z0-9_-]+$/;
    return {
      idsSafe: [W.activeId, ...W.charts.map(c => c.id), ...S.nodes.map(n => n.id), ...S.groups.map(g => g.id),
        ...S.edges.flatMap(e => [e.id, e.from, e.to]), ...machineMaster.map(m => m.id)].every(id => safe.test(id)),
      edgeKept: S.edges.length === 1 && !!N(S.edges[0].from),
      groupKept: S.nodes.filter(n => n.groupId === S.groups[0]?.id).length === 2,
      color: S.groups[0]?.color,
      unknownTypeDropped: S.nodes.length === 2,
      xIsNumber: typeof n2.x === 'number',
      injected: !!document.querySelector('img[src="x"], script:not([src])'),
    };
  });
  await t.page.waitForTimeout(200);
  t.log(JSON.stringify(r6));
  t.check('IDが安全な形式に置き換えられる', r6.idsSafe, r6);
  t.check('置き換え後も配線の参照が保たれる', r6.edgeKept, r6);
  t.check('置き換え後もグループの所属が保たれる', r6.groupKept, r6);
  t.check('不正な色は既定色になる', r6.color === '#94a3b8', r6);
  t.check('未知の記号種別は読み込まない', r6.unknownTypeDropped, r6);
  t.check('座標は数値になる', r6.xIsNumber, r6);
  t.check('HTMLが埋め込まれない', !r6.injected, r6);
  t.check('alert が実行されない', alerts.length === 0, alerts);
});
