'use strict';
/**
 * 配線ダブルクリックメニューからの記号挿入のテスト。
 *
 * 以前は挿入先をクリック位置から推測し直していたため、ダブルクリックした
 * 配線とは別の場所に挿入されることがあった。
 *  - 短い配線の終点寄り → 終点の記号の「直後」に挿入される
 *  - 分岐元の付近       → 同じ分岐元から出る別の配線に挿入される
 */
const { run } = require('./_harness');

run('edge-insert', async (t) => {
  await t.load('chart');

  /** 配線 eid 上の割合 frac の位置でメニューを開き、記号を選んで挿入する */
  const helpers = () => {
    window.__insertOnEdge = (eid, frac, type) => {
      const e = E(eid), fn = N(e.from), tn = N(e.to);
      const pts = _edgePolyPoints(fn, e.fromPort, tn, e.toPort);
      let total = 0;
      for (let i = 0; i < pts.length - 1; i++) total += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
      let rest = total * frac, p = pts[pts.length - 1];
      for (let i = 0; i < pts.length - 1; i++) {
        const L = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
        if (rest <= L) { const k = L ? rest / L : 0; p = { x: pts[i].x + (pts[i + 1].x - pts[i].x) * k, y: pts[i].y + (pts[i + 1].y - pts[i].y) * k }; break; }
        rest -= L;
      }
      const r = document.getElementById('cvs').getBoundingClientRect();
      const ev = { clientX: p.x * S.vp.scale + S.vp.tx + r.left, clientY: p.y * S.vp.scale + S.vp.ty + r.top };
      openEdgeInsertMenu(ev, eid);
      const btn = document.querySelector(`#_edge_ins_menu .edge-ins-item[data-type="${type}"]`);
      if (!btn) { document.getElementById('_edge_ins_menu')?.remove(); return null; }
      btn.click();
      const nid = S.sel.id;
      return {
        from: S.edges.filter(x => x.to === nid).map(x => x.from),
        to:   S.edges.filter(x => x.from === nid).map(x => x.to),
        oldEdgeGone: !E(eid),
      };
    };
  };
  await t.page.evaluate(helpers);
  await t.page.evaluate(() => { window.__sample = JSON.stringify({ nodes: S.nodes, edges: S.edges, listOrder: S.listOrder }); });

  console.log('[1] 短い配線のどの位置でも、ダブルクリックした配線に挿入される');
  const r1 = await t.page.evaluate(() => {
    const snap = __sample;
    const targets = S.edges.filter(e => !isBase(N(e.from).type)).map(e => ({ id: e.id, from: e.from, to: e.to }));
    const fails = [];
    for (const e of targets) {
      for (const frac of [0.1, 0.5, 0.9]) {
        const st = JSON.parse(snap);
        S.nodes = st.nodes; S.edges = st.edges; S.listOrder = st.listOrder;
        const r = __insertOnEdge(e.id, frac, 'kako');
        if (!r || !r.from.includes(e.from) || !r.to.includes(e.to) || !r.oldEdgeGone) fails.push({ e, frac, r });
      }
    }
    return { count: targets.length, fails };
  });
  t.log(JSON.stringify({ count: r1.count, fails: r1.fails.length }));
  t.check('対象の配線がある（テストの前提）', r1.count > 0, r1);
  t.check('すべての位置で正しい配線に挿入される', r1.fails.length === 0, r1.fails);

  console.log('[2] 分岐元付近のダブルクリックでも、別の分岐線に挿入されない');
  const r2 = await t.page.evaluate(() => {
    S.nodes = []; S.edges = []; S.listOrder = [];
    const a = mkNode('kako', 100, 100), b = mkNode('kako', 300, 100), c = mkNode('kako', 300, 300);
    S.nodes.push(a, b, c); S.listOrder.push(a.id, b.id, c.id);
    S.edges.push({ id: 'eAB', from: a.id, fromPort: 'r', to: b.id, toPort: 'l' });
    S.edges.push({ id: 'eAC', from: a.id, fromPort: 'r', to: c.id, toPort: 'l' });
    redraw();
    const r = __insertOnEdge('eAC', 0.05, 'kensa_q');
    return { r, abKept: !!E('eAB'), a: a.id, c: c.id };
  });
  t.log(JSON.stringify(r2));
  t.check('A→新記号→C になる', r2.r && r2.r.from.includes(r2.a) && r2.r.to.includes(r2.c), r2);
  t.check('A→B の配線はそのまま残る', r2.abKept, r2);

  console.log('[3] 起点直後の線には挿入メニューを出さない（ドラッグ挿入と同じ規則）');
  const r3 = await t.page.evaluate(() => {
    const st = JSON.parse(__sample);
    S.nodes = st.nodes; S.edges = st.edges; S.listOrder = st.listOrder; redraw();
    const e = S.edges.find(x => isBase(N(x.from).type));
    if (!e) return null;
    const before = S.nodes.length;
    const r = __insertOnEdge(e.id, 0.5, 'kako');
    return { r, added: S.nodes.length - before };
  });
  t.log(JSON.stringify(r3));
  t.check('起点直後の線がある（テストの前提）', !!r3, r3);
  t.check('挿入ボタンが無く、記号も増えない', r3 && r3.r === null && r3.added === 0, r3);
});
