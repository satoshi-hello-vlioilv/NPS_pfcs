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

/**
 * エッジの描画経路を折れ線の頂点配列で返す（routePath と同一規則）。
 * ヒットテスト・挿入ヒント位置の計算に使用する。
 */
function _edgePolyPoints(fn, fp, tn, tp) {
  const a = portXY(fn, fp), b = portXY(tn, tp);
  const H = p => p === 'l' || p === 'r';
  const V = p => p === 't' || p === 'b';
  if (H(fp) && H(tp)) {
    if (Math.abs(a.y - b.y) < 1) return [a, b];
    const mx = (a.x + b.x) / 2;
    return [a, { x: mx, y: a.y }, { x: mx, y: b.y }, b];
  }
  if (V(fp) && V(tp)) {
    if (Math.abs(a.x - b.x) < 1) return [a, b];
    const my = (a.y + b.y) / 2;
    return [a, { x: a.x, y: my }, { x: b.x, y: my }, b];
  }
  if (H(fp) && V(tp)) return [a, { x: b.x, y: a.y }, b];
  return [a, { x: a.x, y: b.y }, b];
}

function routePath(fn, fp, tn, tp) {
  const pts = _edgePolyPoints(fn, fp, tn, tp);
  return 'M' + pts.map(p => `${p.x} ${p.y}`).join('L');
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
  for (const e of re) {
    if (!(e.from in adj) || !(e.to in indeg)) continue; // 欠損ノード参照を無視
    adj[e.from].push(e.to); indeg[e.to]++;
  }
  // 現在の listOrder 位置をタイブレークに使う安定トポロジカルソート。
  // エッジ制約がない範囲では既存の並び順を維持する（グループ交錯を防ぐ）。
  const pos  = new Map(S.listOrder.map((id, i) => [id, i]));
  const prio = id => (pos.has(id) ? pos.get(id) : Infinity);
  const avail = S.nodes.filter(n => !indeg[n.id]).map(n => n.id);
  const ord  = [];
  const seen = new Set();
  while (avail.length) {
    let bi = 0;
    for (let i = 1; i < avail.length; i++) if (prio(avail[i]) < prio(avail[bi])) bi = i;
    const id = avail.splice(bi, 1)[0];
    if (seen.has(id)) continue;
    seen.add(id); ord.push(id);
    for (const c of (adj[id] || [])) { if (--indeg[c] === 0) avail.push(c); }
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
  // groupId が未設定または実在しないグループを指すノードは「グループなし」行へ
  const ungrouped = S.listOrder.map(id => N(id))
    .filter(n => n && !seen.has(n.id) && (!n.groupId || !G(n.groupId)));
  result.push({ groupId: null, group: null, nodes: ungrouped });
  return result;
}

// ── チャート自動生成 ─────────────────────────────

// ── レイアウト共通計算 ──────────────────────────

/**
 * グループ行の縦方向の並び順を、背骨グループを中心とした構造で決定する。
 * 従来は S.groups の登録順（配置とは無関係な配列順）で単純に上から積んでいたため、
 * データ量や合流構造を無視した不規則な配置になっていた。
 *
 * アルゴリズム:
 *   1. 背骨グループ（メインライン）を中心行に据える
 *   2. 背骨へ合流する（さらにその先へ合流する子孫も含む）グループを
 *      「枝」として木構造にまとめ、各枝の合計ノード数（データ量）を
 *      背骨の上側・下側に交互ではなく、より少ない側へ足していく貪欲法で
 *      振り分け、上下の分量ができるだけ均等になるようにする
 *   3. 背骨と無関係な独立グループ（合流のないグループ）はデータ量の多い順に
 *      最下段へ積む（背骨中心の構造を崩さないよう分離して配置）
 *   4. グループなし行は常に最下段
 *
 * @param {Array<{groupId:string|null, group:object|null, nodes:object[]}>} grouped
 * @returns {{ordered: object[], bbIndex: number}} ordered: 上から下への行配列、bbIndex: 背骨行のインデックス
 */
function _orderGroupsForLayout(grouped) {
  const byId = new Map(grouped.map(row => [row.groupId, row]));
  const ungroupedRow = grouped.find(row => row.groupId == null && row.nodes.length);
  const realRows = grouped.filter(row => row.groupId != null && row.nodes.length);

  if (!realRows.length) return { ordered: ungroupedRow ? [ungroupedRow] : [], bbIndex: -1 };

  const bbId = getBackboneGroupId();
  const bbRow = bbId ? byId.get(bbId) : null;

  // 合流先グループを解決: subGroupId → 合流先ノードの所属グループID
  const mergeTargetGroup = new Map();
  for (const m of (S.merges || [])) {
    const tgt = N(m.targetNodeId);
    if (tgt && tgt.groupId && byId.has(tgt.groupId)) mergeTargetGroup.set(m.subGroupId, tgt.groupId);
  }
  const childrenOf = new Map();
  for (const [subId, tgtGid] of mergeTargetGroup) {
    if (!childrenOf.has(tgtGid)) childrenOf.set(tgtGid, []);
    childrenOf.get(tgtGid).push(subId);
  }

  // 木構造（背骨を根とする）を DFS で辿り、枝ごとに「行の並び＋合計ノード数」を得る。
  // 同じ枝の中で合流を重ねるグループは連続して隣接させ、視覚的なまとまりを保つ。
  const visited = new Set();
  function collectBranch(gid) {
    if (gid == null || visited.has(gid) || !byId.has(gid)) return { rows: [], weight: 0 };
    visited.add(gid);
    const row = byId.get(gid);
    let rows = [row];
    let weight = row.nodes.length;
    const kids = (childrenOf.get(gid) || []).slice()
      .sort((a, b) => (byId.get(b)?.nodes.length || 0) - (byId.get(a)?.nodes.length || 0));
    for (const k of kids) {
      const sub = collectBranch(k);
      rows = rows.concat(sub.rows);
      weight += sub.weight;
    }
    return { rows, weight };
  }

  let bbRows = [];
  if (bbRow) {
    visited.add(bbRow.groupId);
    bbRows = [bbRow];
  }

  // 背骨に直接合流する枝を、データ量の多い順に上下へ貪欲配分してバランスさせる
  const directChildren = bbRow ? (childrenOf.get(bbRow.groupId) || []) : [];
  const branches = directChildren
    .map(gid => collectBranch(gid))
    .filter(b => b.rows.length)
    .sort((a, b) => b.weight - a.weight);

  const above = [], below = [];
  let aboveW = 0, belowW = 0;
  for (const br of branches) {
    if (aboveW <= belowW) { above.push(br); aboveW += br.weight; }
    else                  { below.push(br); belowW += br.weight; }
  }

  // 背骨自体が無い場合（グループ0件など）は全グループをデータ量の多い順に単純に積む
  if (!bbRow) {
    const rest = realRows.filter(r => !visited.has(r.groupId))
      .sort((a, b) => b.nodes.length - a.nodes.length);
    for (const r of rest) collectBranch(r.groupId); // visited 管理のためだけに通す
    const ordered = rest.slice();
    if (ungroupedRow) ordered.push(ungroupedRow);
    return { ordered, bbIndex: -1 };
  }

  // 背骨と合流関係にない独立グループ（別ライン）はデータ量の多い順に最下段へ
  const independents = realRows
    .filter(r => !visited.has(r.groupId))
    .sort((a, b) => b.nodes.length - a.nodes.length);
  for (const r of independents) visited.add(r.groupId);

  const ordered = [
    ...above.flatMap(b => b.rows),
    ...bbRows,
    ...below.flatMap(b => b.rows),
    ...independents,
  ];
  if (ungroupedRow) ordered.push(ungroupedRow);

  return { ordered, bbIndex: above.reduce((s, b) => s + b.rows.length, 0) };
}

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
 *   4. 背骨グループを中心行としてデータ量に応じ上下へ振り分けた並び順で
 *      X/Y を各ノードに書き込む（背骨から遠いほど上下外側へ）
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

  // ── Step3: 背骨中心の並び順で X/Y を各ノードに書き込む ─────────────
  // 背骨グループを基準行(オフセット0)とし、合流構造・データ量を考慮して
  // バランスよく振り分けた行順に沿って上下へ配置する（_orderGroupsForLayout）。
  const { ordered, bbIndex } = _orderGroupsForLayout(grouped);
  for (let i = 0; i < ordered.length; i++) {
    const { nodes } = ordered[i];
    if (!nodes.length) continue;
    const rowOffset = bbIndex >= 0 ? (i - bbIndex) : i;
    const yi = rowOffset * C * 14;
    for (const node of nodes) {
      node.x = nodeXMap[node.id] ?? node.x;
      node.y = snapV(yi);
    }
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
      // 「工程待ち」は工程途中の一時的な滞留を表すため、後続未接続でもエラーとしない
      if (n.type !== 'tt_k' && n.type !== 'tt_p' && S.nodes.length > 1)
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
  // 背骨中心の配置では枝グループが背骨より上（負のY）へ移動することがあり、
  // 直前の表示範囲では新しい配置全体が見えない場合があるため、毎回ビューを合わせ直す。
  fitView();
}
