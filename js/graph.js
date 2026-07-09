'use strict';

// ═══════════════════════════════════════════════
// GRAPH — SVG描画ユーティリティ / トポロジカルソート /
//         番号付け / バリデーション / 整列
// ═══════════════════════════════════════════════

// ── SVG 描画ユーティリティ ──────────────────────

function drawSym(type, cx = 0, cy = 0, num = null) {
  const { r, color: c } = SYMS[type];
  const hit = type === 'unpan'
    ? `<rect x="${cx-2}" y="${cy-r-2}" width="${2*r+4}" height="${2*r+4}" fill="transparent"/>`
    : `<rect x="${cx-r-2}" y="${cy-r-2}" width="${2*r+4}" height="${2*r+4}" fill="transparent"/>`;
  let s = '';

  switch (type) {
    case 'naisei':
      s = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="white" stroke="#334155" stroke-width="2.5"/>`;
      break;
    case 'gaisei':
      s = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#334155"/>`;
      break;
    case 'kako':
      s = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="white" stroke="${c}" stroke-width="2.2"/>`;
      break;
    case 'kensa_q': {
      const p = `${cx},${cy-r} ${cx+r},${cy} ${cx},${cy+r} ${cx-r},${cy}`;
      s = `<polygon points="${p}" fill="white" stroke="${c}" stroke-width="2.2"/>`;
      break;
    }
    case 'kensa_n':
      s = `<rect x="${cx-r}" y="${cy-r}" width="${2*r}" height="${2*r}" fill="white" stroke="${c}" stroke-width="2.2"/>`;
      break;
    case 'kensa_qn': {
      const p = `${cx},${cy-r} ${cx+r},${cy} ${cx},${cy+r} ${cx-r},${cy}`;
      s = `<rect x="${cx-r}" y="${cy-r}" width="${2*r}" height="${2*r}" fill="white" stroke="${c}" stroke-width="2.2"/>
           <polygon points="${p}" fill="white" stroke="${c}" stroke-width="2.2"/>`;
      break;
    }
    case 'unpan':
      // 左寄せ: 円中心を (cx+r, cy) にシフト。左端=cx、右端=cx+2r
      s = `<circle cx="${cx + r}" cy="${cy}" r="${r}" fill="white" stroke="${c}" stroke-width="2.2"/>`;
      break;
    case 'tt_s': {
      const p = `${cx+r},${cy-r} ${cx-r},${cy} ${cx+r},${cy+r}`;
      s = `<polygon points="${p}" fill="white" stroke="${c}" stroke-width="2.2"/>`;
      break;
    }
    case 'tt_k': {
      const p = `${cx-r},${cy-r} ${cx+r},${cy} ${cx-r},${cy+r}`;
      s = `<polygon points="${p}" fill="white" stroke="${c}" stroke-width="2.2"/>`;
      break;
    }
    case 'tt_p': {
      const pO = `${cx-r},${cy-r} ${cx+r},${cy} ${cx-r},${cy+r}`;
      const SQ5 = Math.sqrt(5), IxOff = r*(SQ5-3)/2, rho = r*(SQ5-1)/2, mg = 4;
      const sc  = Math.max(0.1, (rho-mg)/rho);
      const Ix  = cx + IxOff;
      const ax  = Ix + sc * ((cx-r) - Ix), bx = Ix + sc * ((cx+r) - Ix);
      const ay  = cy + sc * ((cy-r) - cy), cy2 = cy + sc * ((cy+r) - cy);
      const pI  = `${ax},${ay} ${bx},${cy} ${ax},${cy2}`;
      s = `<polygon points="${pO}" fill="white" stroke="${c}" stroke-width="2.2"/>
           <polygon points="${pI}" fill="white" stroke="${c}" stroke-width="2"/>`;
      break;
    }
    case 'tt_l': {
      const R = r * 0.92;
      const H = R * Math.sqrt(3) / 2;
      const pR = `${cx+R},${cy} ${cx-R/2},${cy-H} ${cx-R/2},${cy+H}`;
      const pL = `${cx-R},${cy} ${cx+R/2},${cy-H} ${cx+R/2},${cy+H}`;
      s = `<polygon points="${pR}" fill="white" stroke="${c}" stroke-width="2.2"/>
           <polygon points="${pL}" fill="none"  stroke="${c}" stroke-width="2.2"/>`;
      break;
    }
  }

  let numSvg = '';
  if (num !== null) {
    const fs   = r >= 20 ? 12 : 10;
    const ncx  = type === 'unpan' ? cx + r : cx;   // 左寄せ補正
    numSvg = `<text x="${ncx}" y="${cy+fs*0.38}" text-anchor="middle"
      font-family="'IBM Plex Mono',monospace" font-size="${fs}" font-weight="700"
      fill="${c}">${num}</text>`;
  }

  return hit + s + numSvg;
}

function portXY(node, port) {
  const r = SYMS[node.type].r;
  // 運搬は左寄せ: 円中心が (node.x + r, node.y) のため各ポートをオフセット
  if (node.type === 'unpan') {
    switch (port) {
      case 'l': return { x: node.x,       y: node.y };
      case 'r': return { x: node.x + 2*r, y: node.y };
      case 't': return { x: node.x + r,   y: node.y - r };
      case 'b': return { x: node.x + r,   y: node.y + r };
    }
  }
  switch (port) {
    case 'l': return { x: node.x - r, y: node.y };
    case 'r': return { x: node.x + r, y: node.y };
    case 't': return { x: node.x,     y: node.y - r };
    case 'b': return { x: node.x,     y: node.y + r };
  }
}

function routePath(fn, fp, tn, tp) {
  const a = portXY(fn, fp), b = portXY(tn, tp);
  const H = p => p === 'l' || p === 'r';
  const V = p => p === 't' || p === 'b';
  if (H(fp) && H(tp)) {
    if (Math.abs(a.y - b.y) < 1) return `M${a.x} ${a.y}L${b.x} ${b.y}`;
    const mx = (a.x + b.x) / 2;
    return `M${a.x} ${a.y}L${mx} ${a.y}L${mx} ${b.y}L${b.x} ${b.y}`;
  }
  if (V(fp) && V(tp)) {
    if (Math.abs(a.x - b.x) < 1) return `M${a.x} ${a.y}L${b.x} ${b.y}`;
    const my = (a.y + b.y) / 2;
    return `M${a.x} ${a.y}L${a.x} ${my}L${b.x} ${my}L${b.x} ${b.y}`;
  }
  if (H(fp) && V(tp)) return `M${a.x} ${a.y}L${b.x} ${a.y}L${b.x} ${b.y}`;
  return `M${a.x} ${a.y}L${a.x} ${b.y}L${b.x} ${b.y}`;
}

function palIcoSVG(type, sz = 32) {
  const r  = SYMS[type].r + 3;
  // unpan は左寄せ: 描画範囲が [0, 2r] なので viewBox を右にシフト
  const vb = type === 'unpan'
    ? `-3 -${r} ${r*2+3} ${r*2}`
    : `-${r} -${r} ${r*2} ${r*2}`;
  return `<svg viewBox="${vb}" width="${sz}" height="${sz}" xmlns="http://www.w3.org/2000/svg" style="flex-shrink:0;overflow:visible">${drawSym(type, 0, 0)}</svg>`;
}

// ── トポロジカルソート ──────────────────────────

function getTopoOrder() {
  const re   = S.edges.filter(e => e.fromPort === 'r');
  const adj  = {}, indeg = {};
  for (const n of S.nodes) { adj[n.id] = []; indeg[n.id] = 0; }
  for (const e of re) { adj[e.from].push(e.to); indeg[e.to] = (indeg[e.to] || 0) + 1; }
  const q    = S.nodes.filter(n => !indeg[n.id]).map(n => n.id);
  const ord  = [];
  const seen = new Set();
  while (q.length) {
    const id = q.shift();
    if (seen.has(id)) continue;
    seen.add(id); ord.push(id);
    for (const c of (adj[id] || [])) { if (--indeg[c] === 0) q.push(c); }
  }
  for (const n of S.nodes) if (!seen.has(n.id)) ord.push(n.id);
  return ord;
}

// ── 合流接続ヘルパー ────────────────────────────

/** groupId のグループの最後のノード（listOrder基準）を返す */
function getGroupLastNode(groupId) {
  const ids = S.listOrder.filter(id => {
    const n = N(id);
    return n && n.groupId === groupId;
  });
  return ids.length ? N(ids[ids.length - 1]) : null;
}

/** subGroupId に対応する合流設定を返す */
function getMergeBySubGroup(subGroupId) {
  return (S.merges || []).find(m => m.subGroupId === subGroupId) || null;
}

/** targetNodeId に向かう合流設定を全て返す */
function getMergesByTarget(targetNodeId) {
  return (S.merges || []).filter(m => m.targetNodeId === targetNodeId);
}

// ── 通し番号 ────────────────────────────────────

function computeNums() {
  return (S.groups && S.groups.length > 0)
    ? _computeNumsByGroup()
    : _computeNumsTopo();
}

function _computeNumsByGroup() {
  const nums = {};
  for (const { nodes } of _getGroupedOrder()) {
    let counter = 0;
    for (const node of nodes) {
      if (isNumType(node.type)) { counter++; nums[node.id] = counter; }
    }
  }
  return nums;
}

function _computeNumsTopo() {
  const ord   = getTopoOrder();
  const maxIn = {};
  for (const id of S.nodes.map(n => n.id)) maxIn[id] = 0;
  const nums  = {};
  for (const id of ord) {
    const node = N(id); if (!node) continue;
    let cNum = maxIn[id];
    if (isNumType(node.type)) { cNum += 1; nums[id] = cNum; }
    const outEdges = S.edges.filter(e => e.from === id && e.fromPort === 'r');
    for (const e of outEdges) { if (cNum > maxIn[e.to]) maxIn[e.to] = cNum; }
  }
  return nums;
}

function _getGroupedOrder() {
  const result = [];
  const seen   = new Set();
  for (const g of (S.groups || [])) {
    const nodes = S.listOrder.map(id => N(id)).filter(n => n && n.groupId === g.id);
    result.push({ groupId: g.id, group: g, nodes });
    nodes.forEach(n => seen.add(n.id));
  }
  const ungrouped = S.listOrder.map(id => N(id)).filter(n => n && !n.groupId && !seen.has(n.id));
  result.push({ groupId: null, group: null, nodes: ungrouped });
  return result;
}

// ── チャート自動生成 ─────────────────────────────

// ── レイアウト共通計算 ──────────────────────────

/**
 * グループ行を配置する（alignLayout と完全同一のギャップ規則を使用）。
 *
 * ギャップ規則（alignLayout と同一）:
 *   prev が unpan → gap = 2*C、それ以外 → gap = 1*C
 *   unpan の node.x = 左端、other の node.x = 中心
 *   prevRightPort: unpan → node.x+2r、other → node.x+r
 *
 * アルゴリズム:
 *   1. 非サブグループ行を先に左→右で配置する（合流先のXを確定）
 *   2. merge 未設定のサブグループ行を通常配置
 *   3. 合流接続のあるサブグループを右→左で逆算配置
 *   4. X/Y を各ノードに書き込む
 */
function _layoutRows(grouped, _NODE_GAP_UNUSED, LEFT_MARGIN) {
  const nodeXMap = {};  // nid → node.x (unpan=左端, other=中心)

  const subGroupIds = new Set((S.merges || []).map(m => m.subGroupId));

  // ── Step1a: 非サブグループ行を先に配置 ──────────
  for (const { groupId, nodes } of grouped) {
    if (!nodes.length || subGroupIds.has(groupId)) continue;
    _placeNodesLR(nodes, LEFT_MARGIN, nodeXMap);
  }

  // ── Step1b: merge 未設定のサブグループを通常配置 ──
  for (const { groupId, nodes } of grouped) {
    if (!nodes.length || !subGroupIds.has(groupId)) continue;
    if ((S.merges || []).some(m => m.subGroupId === groupId)) continue;
    _placeNodesLR(nodes, LEFT_MARGIN, nodeXMap);
  }

  // ── Step2: 合流接続のあるサブグループを右→左で逆算 ──
  for (const m of (S.merges || [])) {
    const tgt  = N(m.targetNodeId); if (!tgt) continue;
    const tgtX = nodeXMap[m.targetNodeId]; if (tgtX == null) continue;

    const subRow = grouped.find(row => row.groupId === m.subGroupId);
    if (!subRow || !subRow.nodes.length) continue;

    const subNodes = subRow.nodes;
    const tgtR     = SYMS[tgt.type].r;

    // 合流先の左ポート: unpan→tgtX, other→tgtX-tgtR
    const tgtLeftPort   = tgt.type === 'unpan' ? tgtX : tgtX - tgtR;
    // 末端ノードの右ポート = 合流先左ポート - C
    const lastRightPort = snapV(tgtLeftPort - C);

    // 末端ノードを右ポートから逆算
    const last  = subNodes[subNodes.length - 1];
    const lastR = SYMS[last.type].r;
    nodeXMap[last.id] = last.type === 'unpan'
      ? snapV(lastRightPort - 2 * lastR)   // 左端
      : snapV(lastRightPort - lastR);      // 中心

    // 末端より左のノードを右→左に逆算
    for (let i = subNodes.length - 2; i >= 0; i--) {
      const node  = subNodes[i];
      const nextN = subNodes[i + 1];
      const r     = SYMS[node.type].r;
      const nextR = SYMS[nextN.type].r;
      // 次ノードの左ポート
      const nextLeftPort = nextN.type === 'unpan'
        ? nodeXMap[nextN.id]
        : nodeXMap[nextN.id] - nextR;
      // 現ノードの右ポート = 次ノード左ポート - gap(現→次)
      const gap      = node.type === 'unpan' ? 2 * C : C;
      const rightPort= snapV(nextLeftPort - gap);
      nodeXMap[node.id] = node.type === 'unpan'
        ? snapV(rightPort - 2 * r)
        : snapV(rightPort - r);
    }
  }

  // ── Step3: X/Y を各ノードに書き込む ─────────────
  let yi = 0;
  for (const { nodes } of grouped) {
    if (!nodes.length) continue;
    for (const node of nodes) {
      node.x = nodeXMap[node.id] ?? node.x;
      node.y = snapV(yi);
    }
    yi += C * 14;
  }
}

/**
 * ノード列を左→右に配置する（alignLayout と同一ギャップ規則）。
 * nodeXMap[node.id] = node.x (unpan=左端, other=中心)
 */
function _placeNodesLR(nodes, LEFT_MARGIN, nodeXMap) {
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const r    = SYMS[node.type].r;
    if (i === 0) {
      nodeXMap[node.id] = node.type === 'unpan'
        ? snapV(LEFT_MARGIN)         // 左端
        : snapV(LEFT_MARGIN + r);   // 中心
    } else {
      const prev      = nodes[i - 1];
      const prevR     = SYMS[prev.type].r;
      // 前ノードの右ポートX
      const prevRight = prev.type === 'unpan'
        ? nodeXMap[prev.id] + 2 * prevR
        : nodeXMap[prev.id] + prevR;
      // gap: unpan発→2C、それ以外→1C
      const gap = prev.type === 'unpan' ? 2 * C : C;
      nodeXMap[node.id] = node.type === 'unpan'
        ? snapV(prevRight + gap)        // 左端
        : snapV(prevRight + gap + r);  // 中心
    }
  }
}

function buildChartFromList() {
  if (!S.nodes.length) { setStatus('記号を追加してからチャートに反映してください'); return; }
  pushUndo();

  const grouped     = _getGroupedOrder();
  const NODE_GAP    = C;
  const LEFT_MARGIN = C * 3;

  _layoutRows(grouped, NODE_GAP, LEFT_MARGIN);

  // エッジ自動生成（グループ内の連続ノード間）
  // ① 現在のlistOrder隣接関係を求める
  const allGroupedIds = new Set(grouped.flatMap(({ nodes }) => nodes.map(n => n.id)));
  const newAdjSet = new Set();
  for (const { nodes } of grouped) {
    for (let i = 1; i < nodes.length; i++) {
      if (!isBase(nodes[i].type)) newAdjSet.add(`${nodes[i-1].id}|${nodes[i].id}`);
    }
  }
  // ② グループ内ノード間で新しい隣接に含まれない古いエッジを削除
  S.edges = S.edges.filter(e =>
    !(allGroupedIds.has(e.from) && allGroupedIds.has(e.to) &&
      e.fromPort === 'r' && !newAdjSet.has(`${e.from}|${e.to}`))
  );
  // ③ 必要なエッジを追加
  for (const { nodes } of grouped) {
    for (let i = 1; i < nodes.length; i++) {
      if (isBase(nodes[i].type)) continue;
      const prev   = nodes[i - 1];
      const exists = S.edges.find(e => e.from === prev.id && e.to === nodes[i].id && e.fromPort === 'r');
      if (!exists) {
        const edge = { id: uid(), from: prev.id, fromPort:'r', to: nodes[i].id, toPort:'l' };
        if (isBase(prev.type) || isBase(nodes[i].type)) edge.hidden = true;
        S.edges.push(edge);
      }
    }
  }

  graphErrors = {};
  redraw();
  resetView();
  setStatus('チャートをリスト構造から自動生成しました');
}

// ── チャート位置のみ更新（エッジ保持）──────────────

function syncChartFromListOrder() {
  if (!S.nodes.length) return;
  const grouped     = _getGroupedOrder();
  const NODE_GAP    = C;
  const LEFT_MARGIN = C * 3;
  _layoutRows(grouped, NODE_GAP, LEFT_MARGIN);
  graphErrors = {};
}

// ── listOrder 同期 ──────────────────────────────

function syncListOrder() {
  const ids   = S.nodes.map(n => n.id);
  S.listOrder = S.listOrder.filter(id => ids.includes(id));
  for (const id of ids) if (!S.listOrder.includes(id)) S.listOrder.push(id);
}

// ── 自動接続 ────────────────────────────────────

function autoConnect(newNode, prevSelId) {
  if (!prevSelId) return;
  const prev = N(prevSelId); if (!prev) return;
  if (isBase(newNode.type)) return;
  const dup = S.edges.find(e => e.from === prevSelId && e.to === newNode.id);
  if (dup) return;
  const edge = { id: uid(), from: prevSelId, fromPort:'r', to: newNode.id, toPort:'l' };
  if (isBase(prev.type) || isBase(newNode.type)) edge.hidden = true;
  S.edges.push(edge);
}

// ── バリデーション ──────────────────────────────

function validateGraph() {
  graphErrors = {};
  if (!S.nodes.length) return;

  const indeg = {}, outdeg = {}, parents = {}, children = {};
  S.nodes.forEach(n => { indeg[n.id]=0; outdeg[n.id]=0; parents[n.id]=[]; children[n.id]=[]; });
  S.edges.forEach(e => {
    if (!N(e.from) || !N(e.to)) return;
    outdeg[e.from]++; indeg[e.to]++;
    parents[e.to].push(e.from); children[e.from].push(e.to);
  });

  const isTaitai = t => ['tt_s','tt_k','tt_p','tt_l'].includes(t);

  S.nodes.forEach(n => {
    const errs = [];
    if (indeg[n.id] === 0) {
      if (!isBase(n.type)) {
        errs.push('先頭の工程は「内製」または「外製」にしてください。');
      } else {
        const chIds = children[n.id];
        if (!chIds.length) {
          errs.push('直後に「停滞（素材置場）」を接続してください。');
        } else if (chIds.some(cid => { const cn = N(cid); return cn && cn.type !== 'tt_s'; })) {
          errs.push('「内製/外製」の直後は「停滞（素材置場）」にする必要があります。');
        }
      }
    }
    if (n.type === 'unpan') {
      const okP = parents[n.id].length  > 0 && parents[n.id].every(pid  => { const pn=N(pid);  return pn && isTaitai(pn.type); });
      const okC = children[n.id].length > 0 && children[n.id].every(cid => { const cn=N(cid);  return cn && isTaitai(cn.type); });
      if (!okP || !okC) errs.push('「運搬」の前後は「停滞」記号である必要があります。');
    }
    if (outdeg[n.id] === 0) {
      if (n.type !== 'tt_k' && S.nodes.length > 1)
        errs.push('最終工程は「停滞（完成品置場）」である必要があります。');
    } else if (n.type === 'tt_k') {
      errs.push('「停滞（完成品置場）」から次の工程へは接続できません。');
    }
    if (errs.length) graphErrors[n.id] = errs;
  });
}

// ── 整列・チェック ──────────────────────────────

function alignLayout() {
  pushUndo();
  // リストモードの並び順と完全に同一のルール（NODE_GAP=C）でX/Y両軸を再計算する。
  // buildChartFromList と同じ配置結果になる（既存のエッジは保持）。
  syncChartFromListOrder();
  validateGraph();
  const n = Object.keys(graphErrors).length;
  setStatus(n > 0 ? `整列完了 — ルール違反が ${n} 件あります` : '整列完了 — ルールチェック OK');
  redraw();
}
