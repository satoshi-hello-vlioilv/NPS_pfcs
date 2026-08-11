'use strict';
/**
 * 自動配置（整列）のレイアウト規則に関する回帰テスト。
 *
 * 特に「枝葉グループの合流線が他グループの箱を横切って交差する」不具合の再発を防ぐ。
 * 交差は次の2つの規則で防いでいる（_sortRowsForTrackPacking）:
 *   ① 合流の深さが浅いものほど背骨に近いトラックへ（孫は親より必ず外側）
 *   ② 同じ深さ内では合流先X座標が小さいものほど背骨に近いトラックへ
 */
const { run } = require('./_harness');

/** テスト用のノード生成ヘルパーをページ側に用意する */
const INSTALL_MK = () => {
  window._mk = (id, type, x, y, gid) => ({
    id, type, x, y, label: '', note: '', comment: '', unit: '', unitQty: '',
    badges: [], badgePos: 'top', badgeOffsets: {}, badgeBorders: {},
    badgeColors: {}, badgeColorEnabled: {}, groupId: gid, listParentIds: [],
  });
};

run('layout', async (t) => {
  await t.load();
  await t.page.evaluate(INSTALL_MK);

  // ── [1] 兄弟枝: データ量が同点でも合流先Xの順に並び、交差しない ──
  console.log('[1] 兄弟枝の合流線が交差しない');
  const r1 = await t.page.evaluate(() => {
    clearAll();
    const mk = window._mk;
    for (let i = 1; i <= 6; i++) S.nodes.push(mk('b' + i, i === 1 ? 'naisei' : 'kensa_q', i * 100, 0, 'GBB'));
    for (let i = 1; i < 6; i++) S.edges.push({ id: 'eb' + i, from: 'b' + i, fromPort: 'r', to: 'b' + (i + 1), toPort: 'l' });
    const branch = (p, y, gid) => {
      S.nodes.push(mk(p + '1', 'gaisei', 0, y, gid), mk(p + '2', 'tt_s', 100, y, gid),
                   mk(p + '3', 'unpan', 200, y, gid), mk(p + '4', 'tt_k', 300, y, gid));
      S.edges.push({ id: 'e' + p + '1', from: p + '1', fromPort: 'r', to: p + '2', toPort: 'l', hidden: true },
                   { id: 'e' + p + '2', from: p + '2', fromPort: 'r', to: p + '3', toPort: 'l' },
                   { id: 'e' + p + '3', from: p + '3', fromPort: 'r', to: p + '4', toPort: 'l' });
    };
    branch('L', 300, 'GL'); branch('M', 500, 'GM'); branch('R', 700, 'GR');
    // 合流の登録順をわざとX順と無関係にする（登録順に引きずられないことの確認）
    S.merges = [
      { id: 'm1', subGroupId: 'GM', targetNodeId: 'b5' },
      { id: 'm2', subGroupId: 'GR', targetNodeId: 'b6' },
      { id: 'm3', subGroupId: 'GL', targetNodeId: 'b4' },
    ];
    S.groups = [
      { id: 'GBB', label: '背骨', color: '#6366f1' }, { id: 'GL', label: '左', color: '#16a34a' },
      { id: 'GM', label: '中', color: '#dc2626' },    { id: 'GR', label: '右', color: '#7c3aed' },
    ];
    S.listOrder = S.nodes.map(n => n.id);
    S.backboneGroupId = 'GBB';
    S.layoutMode = 'bottomOnly';   // 同じ側に集めてトラック割り当てを検証する
    alignLayout();
    const info = g => {
      const ns = S.nodes.filter(n => n.groupId === g);
      const m  = getMergeBySubGroup(g);
      return { y: ns[0].y, min: Math.min(...ns.map(n => n.x)), max: Math.max(...ns.map(n => n.x)),
               tx: m ? N(m.targetNodeId).x : null };
    };
    return { L: info('GL'), M: info('GM'), R: info('GR'), bb: N('b1').y };
  });
  t.log(JSON.stringify(r1));
  t.check('背骨はY=0', r1.bb === 0, r1.bb);
  t.check('合流先Xが小さい枝ほど背骨に近い', r1.L.y <= r1.M.y && r1.M.y <= r1.R.y, r1);

  // 実際の交差判定: より内側にある箱のX範囲を、外側の枝の合流線が跨いでいないか
  const crossings = [];
  for (const a of ['L', 'M', 'R']) {
    for (const b of ['L', 'M', 'R']) {
      if (a === b) continue;
      if (r1[a].y < r1[b].y && r1[b].tx > r1[a].min && r1[b].tx < r1[a].max) {
        crossings.push(`${b}の合流線(x=${r1[b].tx})が${a}の箱[${r1[a].min},${r1[a].max}]を横切る`);
      }
    }
  }
  t.check('どの合流線も内側の箱を横切らない', crossings.length === 0, crossings.join(' / '));

  // ── [2] 入れ子合流: 孫グループは親の枝より必ず外側 ──
  console.log('[2] 入れ子合流で孫グループが親より外側に置かれる');
  const r2 = await t.page.evaluate(() => {
    clearAll();
    const mk = window._mk;
    for (let i = 1; i <= 5; i++) S.nodes.push(mk('b' + i, i === 1 ? 'naisei' : 'kako', i * 100, 0, 'BB'));
    for (let i = 1; i < 5; i++) S.edges.push({ id: 'eb' + i, from: 'b' + i, fromPort: 'r', to: 'b' + (i + 1), toPort: 'l' });
    for (const [p, y, g] of [['p', 300, 'GP'], ['q', 600, 'GQ']]) {
      for (let i = 1; i <= 3; i++) S.nodes.push(mk(p + i, i === 1 ? 'gaisei' : 'kako', i * 100, y, g));
      for (let i = 1; i < 3; i++) S.edges.push({ id: 'e' + p + i, from: p + i, fromPort: 'r', to: p + (i + 1), toPort: 'l' });
    }
    S.merges = [
      { id: 'm1', subGroupId: 'GP', targetNodeId: 'b4' },
      { id: 'm2', subGroupId: 'GQ', targetNodeId: 'p2' },   // 枝Pへ合流する孫グループ
    ];
    S.groups = [
      { id: 'BB', label: '背骨', color: '#6366f1' }, { id: 'GP', label: '枝P', color: '#0891b2' },
      { id: 'GQ', label: '枝Q', color: '#16a34a' },
    ];
    S.listOrder = S.nodes.map(n => n.id);
    S.backboneGroupId = 'BB';
    S.layoutMode = 'bottomOnly';
    alignLayout();
    const yOf = g => S.nodes.find(n => n.groupId === g).y;
    return { BB: yOf('BB'), GP: yOf('GP'), GQ: yOf('GQ'), dP: _mergeDepth('GP'), dQ: _mergeDepth('GQ') };
  });
  t.log(JSON.stringify(r2));
  t.check('背骨はY=0', r2.BB === 0, r2.BB);
  t.check('合流の深さが正しい（枝P=1, 枝Q=2）', r2.dP === 1 && r2.dQ === 2, r2);
  t.check('孫グループ(枝Q)は親(枝P)より外側', Math.abs(r2.GQ) > Math.abs(r2.GP), r2);

  // ── [3] 上配置でも同じ順序規則が働く ──
  console.log('[3] 上配置でも入れ子の順序が保たれる');
  const r3 = await t.page.evaluate(() => {
    S.layoutMode = 'topOnly';
    alignLayout();
    const yOf = g => S.nodes.find(n => n.groupId === g).y;
    return { GP: yOf('GP'), GQ: yOf('GQ') };
  });
  t.check('枝は背骨より上（負のY）', r3.GP < 0 && r3.GQ < 0, r3);
  t.check('上配置でも孫は親より外側', Math.abs(r3.GQ) > Math.abs(r3.GP), r3);

  // ── [4] 合流が循環している不正データでもハングしない ──
  console.log('[4] 合流が循環していても無限ループしない');
  const r4 = await t.page.evaluate(() => {
    S.merges = [
      { id: 'm1', subGroupId: 'GP', targetNodeId: 'q1' },
      { id: 'm2', subGroupId: 'GQ', targetNodeId: 'p1' },
    ];
    const depths = [_mergeDepth('GP'), _mergeDepth('GQ')];
    alignLayout();
    return { depths };
  });
  t.check('循環でも深さ計算が有限で返る', r4.depths.every(Number.isFinite), r4);

  // ── [5] サンプルデータの回帰 ──
  console.log('[5] サンプルデータでの回帰');
  const r5 = await t.page.evaluate(() => {
    clearAll(); loadSampleData();
    S.layoutMode = 'balance';
    alignLayout();
    const bb = getBackboneGroupId();
    return { bbY: [...new Set(S.nodes.filter(n => n.groupId === bb).map(n => n.y))] };
  });
  t.check('サンプルでも背骨はY=0', r5.bbY.length === 1 && r5.bbY[0] === 0, r5);
});
