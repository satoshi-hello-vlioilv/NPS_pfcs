'use strict';

// ═══════════════════════════════════════════════
// MAIN — マウス・キーボードインタラクション / I/O / 初期化
// ═══════════════════════════════════════════════

// ── インタラクション ─────────────────────────────

let IA        = null;
let spaceHeld = false;

// ダブルクリック検出（redraw で要素が再生成されるため自前実装）
let _dblNid  = null;
let _dblTime = 0;
const DBL_MS = 300;

// ── チャートインサート（エッジ/ノード上ドロップ挿入）─────

/** 点(px,py)からセグメント(ax,ay)-(bx,by)への最短距離 */
function _distToSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

/** 点(px,py)から折れ線 pts への最短距離 */
function _distToPolyline(px, py, pts) {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const d = _distToSeg(px, py, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y);
    if (d < best) best = d;
  }
  return best;
}

/** 折れ線 pts の全長の中間点を返す */
function _polylineMidpoint(pts) {
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    total += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
  }
  let rest = total / 2;
  for (let i = 0; i < pts.length - 1; i++) {
    const len = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
    if (rest <= len || i === pts.length - 2) {
      const t = len > 0 ? rest / len : 0;
      return {
        x: pts[i].x + (pts[i + 1].x - pts[i].x) * t,
        y: pts[i].y + (pts[i + 1].y - pts[i].y) * t,
      };
    }
    rest -= len;
  }
  return pts[0];
}

/**
 * ドラッグ中のノードに対してインサート候補を返す。
 * すでに同一経路で接続済みのエッジ・ノードは候補から除外する。
 * ・記号本体に直接重ねた場合はそのノードの直後への挿入を最優先
 * ・エッジは実際の描画経路（折れ線）との距離で「最も近い」ものを採用
 * @returns {null | {kind:'edge', edge, fn, tn} | {kind:'node', target}}
 */
function _findInsertTarget(node) {
  const r  = SYMS[node.type].r;
  // 運搬は左寄せ描画のため中心座標に補正して判定する
  const cx = node.type === 'unpan' ? node.x + r : node.x;
  const cy = node.y;

  // 最近傍ノードを求めておく（自分以外・起点以外）
  let bestNode = null, bestNodeD = Infinity;
  for (const n of S.nodes) {
    if (n.id === node.id || isBase(n.type)) continue;
    // tgt→node の接続が既に存在する場合は対象外
    if (_edgeExists(n.id, 'r', node.id, 'l')) continue;
    const rn  = SYMS[n.type].r;
    const ncx = n.type === 'unpan' ? n.x + rn : n.x;
    const d   = Math.hypot(cx - ncx, cy - n.y);
    if (d < bestNodeD) { bestNodeD = d; bestNode = n; }
  }

  // 1. 記号本体への直接重なり → そのノードの直後に挿入（最優先）
  if (bestNode && bestNodeD < SYMS[bestNode.type].r + 6) {
    return { kind: 'node', target: bestNode };
  }

  // 2. エッジへの近接（最も近いエッジを採用。自身が from/to のエッジは除外）
  const EDGE_HIT = r + 14;
  let bestEdge = null, bestEdgeD = EDGE_HIT;
  for (const e of S.edges) {
    if (e.from === node.id || e.to === node.id) continue;
    if (e.hidden) continue;
    const fn = N(e.from), tn = N(e.to);
    if (!fn || !tn) continue;
    if (isBase(fn.type)) continue;
    // 挿入後の接続 fn→node, node→tn が既に両方存在する場合はスキップ
    const wouldDup = _edgeExists(fn.id, 'r', node.id, 'l') &&
                     _edgeExists(node.id, 'r', tn.id, 'l');
    if (wouldDup) continue;
    const pts = _edgePolyPoints(fn, e.fromPort, tn, e.toPort);
    const d   = _distToPolyline(cx, cy, pts);
    if (d < bestEdgeD) { bestEdgeD = d; bestEdge = { kind: 'edge', edge: e, fn, tn }; }
  }
  if (bestEdge) return bestEdge;

  // 3. ノードへの近接（重なりに満たないが十分近い場合）
  const NODE_HIT = r + 10;
  if (bestNode && bestNodeD < r + SYMS[bestNode.type].r + NODE_HIT) {
    return { kind: 'node', target: bestNode };
  }

  return null;
}

/**
 * 挿入ターゲットが見つからない位置のうち「挿入できない場所」に
 * 重なっている場合はその理由を返す（起点記号・起点直後の線・自分自身の接続線）。
 * 空き地（本当に何もない場所）では null を返す。
 * ドラッグ判定用に node が一時的にポインタ座標へ動かされている場合、
 * 自分の接続線の端点は元位置 (ox, oy) で評価する（線が付いてこないように）。
 * @returns {null | {reason:'base'|'base-edge'|'self-edge'}}
 */
function _findInsertBlocked(node, ox, oy) {
  const r  = SYMS[node.type].r;
  const cx = node.type === 'unpan' ? node.x + r : node.x;
  const cy = node.y;

  // 起点記号（内製・外製）への重なり
  for (const n of S.nodes) {
    if (n.id === node.id || !isBase(n.type)) continue;
    const rn = SYMS[n.type].r;
    if (Math.hypot(cx - n.x, cy - n.y) < r + rn + 10) return { reason: 'base' };
  }

  // 挿入対象外の線（自分自身の接続線・起点直後の線）への近接
  const EDGE_HIT = r + 14;
  for (const e of S.edges) {
    if (e.hidden) continue;
    const fn = N(e.from), tn = N(e.to);
    if (!fn || !tn) continue;
    const isSelf     = e.from === node.id || e.to === node.id;
    const isBaseEdge = isBase(fn.type);
    if (!isSelf && !isBaseEdge) continue;
    let pts;
    if (isSelf && ox !== undefined) {
      const sx = node.x, sy = node.y;
      node.x = ox; node.y = oy;
      pts = _edgePolyPoints(fn, e.fromPort, tn, e.toPort);
      node.x = sx; node.y = sy;
    } else {
      pts = _edgePolyPoints(fn, e.fromPort, tn, e.toPort);
    }
    if (_distToPolyline(cx, cy, pts) < EDGE_HIT) {
      return { reason: isSelf ? 'self-edge' : 'base-edge' };
    }
  }
  return null;
}

/** 挿入ターゲットが所属するグループを返す（挿入後に引き継ぐグループ） */
function _insertTargetGroup(target) {
  if (!target) return null;
  const gid = target.kind === 'edge' ? target.fn.groupId : target.target.groupId;
  return gid ? G(gid) : null;
}

/** ノードの表示名（ラベル → 記号名の順でフォールバック） */
function _nodeName(n) {
  return getEffectiveLabel(n) || SYMS[n.type]?.name || '';
}

/** ドラッグヒント用のピルバッジSVG（グループ名・警告などの表示に使用） */
function _hintPill(cx, cy, label, fill) {
  const w = Math.max(44, [...label].reduce((s, ch) => s + (ch.charCodeAt(0) > 0xff ? 10 : 6), 0) + 20);
  return `<g class="insert-hint-anim" pointer-events="none">
    <rect x="${cx - w / 2}" y="${cy - 10}" width="${w}" height="20" rx="10"
      fill="${fill}" opacity="0.93"/>
    <text x="${cx}" y="${cy + 3.5}" text-anchor="middle"
      font-family="'Noto Sans JP',sans-serif" font-size="10" font-weight="700"
      fill="white">${esc(label)}</text>
  </g>`;
}

/**
 * ドラッグ中のホバー位置に応じたステータスメッセージを返す。
 * どのグループへ移るのか / どこから外れるのか / なぜ挿入できないのかを明示する。
 */
function _dragHoverMsg(node, target, blocked) {
  const curG = node.groupId ? G(node.groupId) : null;
  if (target) {
    const tg  = _insertTargetGroup(target);
    const pos = target.kind === 'edge'
      ? `「${_nodeName(target.fn)}」→「${_nodeName(target.tn)}」の間`
      : `「${_nodeName(target.target)}」の直後`;
    if ((tg?.id ?? null) !== (curG?.id ?? null)) {
      const from = curG ? `グループ「${curG.label}」から` : '';
      const to   = tg ? `「${tg.label}」` : 'グループなし';
      return `${pos}に挿入 — ${from}${to}へ移動します`;
    }
    return `${pos}に挿入します${tg ? `（グループ「${tg.label}」）` : ''}`;
  }
  if (blocked) {
    const msgs = {
      'base':      '⚠ 起点記号（内製・外製）には挿入できません — ドロップすると元の位置に戻ります',
      'base-edge': '⚠ 起点直後の線には挿入できません — ドロップすると元の位置に戻ります',
      'self-edge': '⚠ 自分自身の接続線には挿入できません — ドロップすると元の位置に戻ります',
    };
    return msgs[blocked.reason] || '⚠ ここには挿入できません — ドロップすると元の位置に戻ります';
  }
  const hasEdges = S.edges.some(e => e.from === node.id || e.to === node.id);
  if (hasEdges) {
    return `空き地: ドロップでラインから抜き取ります${curG ? ` — グループ「${curG.label}」からも外れます` : ''}`;
  }
  if (curG) return `空き地: ドロップでグループ「${curG.label}」から外れます`;
  return 'ドロップでこの位置に移動します';
}

/** インサートヒントのSVG文字列を生成（エッジは実際の描画経路をハイライト） */
function _insertHintSVG(target) {
  if (!target) return '';

  let svg = '';
  if (target.kind === 'edge') {
    const pts = _edgePolyPoints(target.fn, target.edge.fromPort, target.tn, target.edge.toPort);
    const d   = 'M' + pts.map(p => `${p.x} ${p.y}`).join('L');
    const { x: mx, y: my } = _polylineMidpoint(pts);
    // エッジをハイライト
    svg += `<path class="insert-hint-anim" d="${d}"
      fill="none" stroke="var(--acc)" stroke-width="3.5" stroke-dasharray="6,3"/>`;
    // 挿入位置マーカー（＋アイコン）
    svg += `<g class="insert-hint-anim">
      <circle cx="${mx}" cy="${my}" r="11"
        fill="var(--acc-bg)" stroke="var(--acc)" stroke-width="2.5"/>
      <path d="M${mx-5},${my} L${mx+5},${my} M${mx},${my-5} L${mx},${my+5}"
        stroke="var(--acc)" stroke-width="2.5" stroke-linecap="round"/>
    </g>`;
    // ラベル
    svg += `<text x="${mx}" y="${my + 24}" text-anchor="middle"
      font-family="'Noto Sans JP',sans-serif" font-size="10" font-weight="700"
      fill="var(--acc)" opacity="0.9">ここに挿入</text>`;
    // 挿入先グループのバッジ（グループ色＋名称で移動先を明示）
    const ge = _insertTargetGroup(target);
    svg += _hintPill(mx, my - 30, ge ? ge.label : 'グループなし', ge?.color || '#94a3b8');

  } else if (target.kind === 'node') {
    const n = target.target;
    const rn = SYMS[n.type].r;
    const cx = n.type === 'unpan' ? n.x + rn : n.x;
    const rx = portXY(n, 'r').x;
    // ノードをリングでハイライト
    svg += `<circle class="insert-hint-anim" cx="${cx}" cy="${n.y}" r="${rn + 13}"
      fill="none" stroke="var(--acc)" stroke-width="2.5" stroke-dasharray="5,3"/>`;
    // 右側に挿入矢印バッジ
    svg += `<g class="insert-hint-anim">
      <rect x="${rx + 6}" y="${n.y - 11}" width="52" height="22" rx="11"
        fill="var(--acc)" opacity="0.92"/>
      <text x="${rx + 32}" y="${n.y + 4}" text-anchor="middle"
        font-family="'Noto Sans JP',sans-serif" font-size="10" font-weight="700"
        fill="white">→挿入</text>
    </g>`;
    // 挿入先グループのバッジ（グループ色＋名称で移動先を明示）
    const gn = _insertTargetGroup(target);
    svg += _hintPill(cx, n.y - rn - 27, gn ? gn.label : 'グループなし', gn?.color || '#94a3b8');
  }
  return svg;
}

/** インサートヒントのSVGをTLレイヤーに描画 */
function _renderInsertHint(target) {
  document.getElementById('TL').innerHTML = _insertHintSVG(target);
}

/**
 * ゴーストドラッグ中に TL レイヤーへ描画する。
 * ・元ノードは半透明化（renderNodes 側でクラス付与）
 * ・ゴーストノード（半透明シンボル）を (gx, gy) に描画
 * ・挿入ヒントを重ねて描画
 */
function _renderGhostAndHint(node, gx, gy, target, blocked) {
  const r  = SYMS[node.type].r;
  const cx = node.type === 'unpan' ? gx + r : gx;

  // ゴーストノード（ドロップ候補位置に半透明で表示）
  let svg = `<g opacity="0.48" pointer-events="none">
    <circle cx="${cx}" cy="${gy}" r="${r + 7}" fill="var(--acc-bg)"
      stroke="var(--acc)" stroke-width="2" stroke-dasharray="5,3"/>
    ${drawSym(node.type, gx, gy, null)}
  </g>`;

  svg += _insertHintSVG(target);

  // ターゲットなし（既存ノードのドラッグ時のみ）: 挿入不可 / グループ離脱の予告バッジ
  if (!target && N(node.id)) {
    if (blocked) {
      const lbls = {
        'base':      '起点には挿入不可',
        'base-edge': 'この線には挿入不可',
        'self-edge': '自分の線には挿入不可',
      };
      svg += _hintPill(cx, gy + r + 22, lbls[blocked.reason] || '挿入不可', '#dc2626');
    } else {
      const curG     = node.groupId ? G(node.groupId) : null;
      const hasEdges = S.edges.some(e => e.from === node.id || e.to === node.id);
      if (hasEdges || curG) {
        const lbl = curG ? `「${curG.label}」から外れます` : 'ラインから外れます';
        svg += _hintPill(cx, gy + r + 22, lbl, '#d97706');
      }
    }
  }

  document.getElementById('TL').innerHTML = svg;
}

/** 下流ノード（startId から右エッジで到達可能なもの）のIDセットを返す */
function _downstreamIds(startId) {
  const visited = new Set();
  const queue = [startId];
  while (queue.length) {
    const id = queue.shift();
    if (visited.has(id)) continue;
    visited.add(id);
    for (const e of S.edges) {
      if (e.from === id && e.fromPort === 'r') queue.push(e.to);
    }
  }
  visited.delete(startId);
  return visited;
}

// ── 循環検出・チェーン抽出・リスト同期 ────────────────

/**
 * fromId → toId の接続を追加したとき循環が生じるか検査する。
 * toId から既存エッジを DFS で辿り fromId へ到達できれば循環と判定。
 * @param {string} fromId
 * @param {string} toId
 * @returns {boolean}
 */
function _wouldCreateCycle(fromId, toId) {
  if (fromId === toId) return true;
  const visited = new Set();
  const stack   = [toId];
  while (stack.length) {
    const cur = stack.pop();
    if (cur === fromId) return true;
    if (visited.has(cur)) continue;
    visited.add(cur);
    for (const e of S.edges) {
      if (e.from === cur) stack.push(e.to);
    }
  }
  return false;
}

/**
 * ノードを現在の接続チェーンから切り離し、前後ノードをブリッジ接続する。
 * ドラッグ挿入前に呼び出すことで、旧接続の残留（ダイヤモンド構造・循環）を防ぐ。
 *
 * 処理内容:
 *   1. node に繋がる全エッジを削除
 *   2. 前ノード（inEdge.from）と後ノード（outEdge.to）が存在すれば直結ブリッジを追加
 *
 * @param {object} node - 切り離すノードオブジェクト
 */
function _extractNodeFromChain(node) {
  // メインフロー方向の入出力エッジを特定（fromPort:'r' を主フローとする）
  const inEdges  = S.edges.filter(e => e.to   === node.id && e.fromPort === 'r');
  const outEdges = S.edges.filter(e => e.from === node.id && e.fromPort === 'r');

  // ノードに繋がる全エッジを除去
  S.edges = S.edges.filter(e => e.from !== node.id && e.to !== node.id);

  // 前後ノードが存在する場合はブリッジ接続を追加してチェーンを維持
  // （合流点などで入出力が複数ある場合も全ペアを接続して分断を防ぐ）
  for (const ie of inEdges) {
    for (const oe of outEdges) {
      const pred = N(ie.from);
      const succ = N(oe.to);
      if (!pred || !succ || pred.id === succ.id) continue;
      const hidden = isBase(pred.type) || isBase(succ.type);
      _addEdgeSafe(pred.id, 'r', succ.id, 'l', hidden ? { hidden: true } : {});
    }
  }
}

/**
 * エッジのトポロジカル順序に基づいて listOrder を再ソートする。
 * チャートモードでエッジが追加・変更されたときにリストビューへ反映するために使用。
 * グループ情報（node.groupId）はそのまま保持し、表示順序のみを更新する。
 */
function _syncListOrderFromGraph() {
  const topo    = getTopoOrder();
  const topoPos = new Map(topo.map((id, i) => [id, i]));
  S.listOrder.sort((a, b) => {
    const pa = topoPos.has(a) ? topoPos.get(a) : Infinity;
    const pb = topoPos.has(b) ? topoPos.get(b) : Infinity;
    return pa - pb;
  });
}

// ── 多重接続チェック ──────────────────────────────

/**
 * 完全同一経路（from・fromPort・to・toPort）のエッジが既に存在するか確認。
 * hidden エッジも含めて検査する。
 */
function _edgeExists(fromId, fromPort, toId, toPort) {
  return S.edges.some(e =>
    e.from === fromId && e.fromPort === fromPort &&
    e.to   === toId   && e.toPort   === toPort
  );
}

/**
 * 重複がなければエッジを追加して返す。重複があれば null を返す。
 */
function _addEdgeSafe(fromId, fromPort, toId, toPort, extra = {}) {
  if (_edgeExists(fromId, fromPort, toId, toPort)) return null;
  const e = { id: uid(), from: fromId, fromPort, to: toId, toPort, ...extra };
  S.edges.push(e);
  return e;
}

/**
 * S.edges の重複エッジを除去する（from+fromPort+to+toPort の完全一致）。
 * 同一経路が複数ある場合は最初の1件を残す。
 */
function _deduplicateEdges() {
  const seen = new Set();
  S.edges = S.edges.filter(e => {
    const key = `${e.from}:${e.fromPort}>${e.to}:${e.toPort}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ── 右チェーン整列（alignLayout と同一ギャップ式・起点から連鎖）──

/**
 * alignLayout と同じギャップ規則を startId から右エッジを辿って連鎖適用する。
 * Y座標は親と揃える（同一行前提）。
 * グラフが分岐・合流していても正しく辿れるよう BFS で処理する。
 *
 * ギャップ規則（alignLayout と完全同一）:
 *   gap      = par.type === 'unpan' ? 2*C : 1*C
 *   ch.x     = snapV( portXY(par,'r').x + gap + chLeftOff )
 *   chLeftOff = ch.type === 'unpan' ? 0 : SYMS[ch.type].r
 */
function _alignRightChainFrom(startId) {
  // 右エッジの「子→親エッジ」マップを構築
  const rightEdgesOf = {}; // parentId → [edge]
  for (const e of S.edges) {
    if (e.fromPort !== 'r') continue;
    if (!rightEdgesOf[e.from]) rightEdgesOf[e.from] = [];
    rightEdgesOf[e.from].push(e);
  }

  // startId から BFS で連鎖整列
  const visited = new Set();
  const queue   = [startId];
  while (queue.length) {
    const pid = queue.shift();
    if (visited.has(pid)) continue;
    visited.add(pid);
    const par = N(pid); if (!par) continue;
    for (const e of (rightEdgesOf[pid] || [])) {
      const ch = N(e.to); if (!ch || visited.has(ch.id)) continue;
      const gap      = par.type === 'unpan' ? 2 * C : 1 * C;
      const parRight = portXY(par, 'r').x;
      const chOff    = ch.type  === 'unpan' ? 0 : SYMS[ch.type].r;
      ch.x = snapV(parRight + gap + chOff);
      ch.y = snapV(par.y);          // 同一行維持
      queue.push(ch.id);
    }
  }
}

// ── インサート実行 ────────────────────────────────

/**
 * チャートへのドロップ挿入を実行する。
 *
 * 処理順:
 *   0. ノードを現在の接続チェーンから切り離す（旧接続の残留を防ぐ）
 *   1. ターゲットエッジ/ノードを特定して接続を組み替え（多重接続は _addEdgeSafe で排除）
 *   2. listOrder を更新
 *   3. ノードをひとまず親の右に仮配置
 *   4. _alignRightChainFrom で親ノードから連鎖整列（alignLayout 同一規則）
 *
 * @returns {boolean} インサートを実行したか
 */
function _doChartInsert(node, target) {
  if (!target) return false;

  // ── Step 0: ノードを旧チェーンから切り離してブリッジ接続を生成 ──
  // これにより旧エッジが残留してダイヤモンド構造や循環が生まれるのを防ぐ
  _extractNodeFromChain(node);

  if (target.kind === 'edge') {
    const { edge, fn, tn } = target;

    // 既存エッジを削除
    S.edges = S.edges.filter(e => e.id !== edge.id);

    // 新エッジを追加（重複チェック付き）
    const hidden1 = isBase(fn.type) || isBase(node.type);
    const hidden2 = isBase(node.type) || isBase(tn.type);
    _addEdgeSafe(fn.id,   'r', node.id, 'l', hidden1 ? { hidden: true } : {});
    _addEdgeSafe(node.id, 'r', tn.id,   'l', hidden2 ? { hidden: true } : {});

    // groupId を挿入先（fn）のグループに合わせる
    node.groupId = fn.groupId ?? null;

    // listOrder: draggingノードを tn の直前に移動
    const fromIdx = S.listOrder.indexOf(node.id);
    if (fromIdx >= 0) S.listOrder.splice(fromIdx, 1);
    const toIdx = S.listOrder.indexOf(tn.id);
    S.listOrder.splice(toIdx >= 0 ? toIdx : S.listOrder.length, 0, node.id);

    // 仮配置（fn 直右）→ 連鎖整列で正確な位置に確定
    node.y = snapV(fn.y);
    node.x = snapV(portXY(fn, 'r').x + C);
    _alignRightChainFrom(fn.id);

  } else if (target.kind === 'node') {
    const tgt = target.target;

    // tgt の右エッジを探す（_extractNodeFromChain 後に再検索する）
    const rightEdge = S.edges.find(e => e.from === tgt.id && e.fromPort === 'r');
    const succNode  = rightEdge ? N(rightEdge.to) : null;

    // groupId を挿入先（tgt）のグループに合わせる
    node.groupId = tgt.groupId ?? null;

    if (rightEdge && succNode) {
      // 既存エッジを組み替え
      S.edges = S.edges.filter(e => e.id !== rightEdge.id);
      const hidden1 = isBase(tgt.type)  || isBase(node.type);
      const hidden2 = isBase(node.type) || isBase(succNode.type);
      _addEdgeSafe(tgt.id,  'r', node.id,     'l', hidden1 ? { hidden: true } : {});
      _addEdgeSafe(node.id, 'r', succNode.id,  'l', hidden2 ? { hidden: true } : {});

      // listOrder: node を succNode の直前に移動
      const fromIdx = S.listOrder.indexOf(node.id);
      if (fromIdx >= 0) S.listOrder.splice(fromIdx, 1);
      const succIdx = S.listOrder.indexOf(succNode.id);
      S.listOrder.splice(succIdx >= 0 ? succIdx : S.listOrder.length, 0, node.id);

    } else {
      // 末尾ノード: tgt の右に接続するだけ
      const hidden = isBase(tgt.type) || isBase(node.type);
      _addEdgeSafe(tgt.id, 'r', node.id, 'l', hidden ? { hidden: true } : {});

      // listOrder: tgt の直後に移動
      const fromIdx = S.listOrder.indexOf(node.id);
      if (fromIdx >= 0) S.listOrder.splice(fromIdx, 1);
      const tgtIdx = S.listOrder.indexOf(tgt.id);
      S.listOrder.splice(tgtIdx >= 0 ? tgtIdx + 1 : S.listOrder.length, 0, node.id);
    }

    // 仮配置（tgt 直右）→ 連鎖整列で正確な位置に確定
    node.y = snapV(tgt.y);
    node.x = snapV(portXY(tgt, 'r').x + C);
    _alignRightChainFrom(tgt.id);
  }

  // 挿入後の最終クリーンアップ:
  // ① 重複エッジを除去（ドラッグ操作の繰り返しによる蓄積を防ぐ）
  _deduplicateEdges();
  // ② グラフのトポロジカル順でリスト順序を同期（チャート↔リスト一致）
  _syncListOrderFromGraph();

  return true;
}

/**
 * 新規記号を (wx, wy) に配置する（パレットドラッグ / 配置モードクリック共通）。
 * フロー線（エッジ）や既存記号の上にドロップされた場合はその位置へ挿入し、
 * 何もない場所へのドロップは従来どおり選択中ノードの直後に追加・自動接続する。
 * @returns {object} 生成したノード
 */
function placeSymbolAt(type, wx, wy, prevSelId) {
  const sp = snapP(wx, wy);
  pushUndo();
  // 挿入判定はグリッド吸着前のドロップ位置で行う（吸着による誤ターゲットを防ぐ）
  const node = mkNode(type, wx, wy);
  S.nodes.push(node);
  const target = _findInsertTarget(node);
  node.x = sp.x; node.y = sp.y;
  const inserted = _doChartInsert(node, target);

  if (inserted) {
    // 挿入後に整列と整合チェックを自動実行
    syncChartFromListOrder();
    validateGraph();
    const n = Object.keys(graphErrors).length;
    const g = node.groupId ? G(node.groupId) : null;
    const gTxt = g ? `工程をグループ「${g.label}」に挿入しました` : '工程を挿入しました';
    setStatus(n > 0
      ? `${gTxt} — ルール違反が ${n} 件あります`
      : `${gTxt} — 整列・ルールチェック OK`);
  } else {
    // 空き領域へのドロップ: 選択中ノードのグループ・並び順を引き継いで自動接続
    if (prevSelId) {
      node.groupId = N(prevSelId)?.groupId ?? null;
    } else {
      // 無選択で作成された工程は無名グループに所属させる
      node.groupId = ensureDefaultGroup();
    }
    _insertInListOrder(node.id, prevSelId);
    autoConnect(node, prevSelId);
  }

  S.sel = { kind:'node', id:node.id };
  document.getElementById('TL').innerHTML = '';
  redraw();
  return node;
}

// ── 複数選択 ────────────────────────────────────
// S.sel = { kind:'multi', ids:string[] } で複数選択状態を表す

function _multiIds() {
  return S.sel?.kind === 'multi' ? S.sel.ids : [];
}
function _isInMultiSel(nid) {
  return S.sel?.kind === 'multi' && S.sel.ids.includes(nid);
}

/** 入力ポートの近傍検索 */
function nearPort(wx, wy, excId) {
  const HIT = 16;
  let best = null, bestD = HIT;
  for (const n of S.nodes) {
    if (n.id === excId || isBase(n.type)) continue;
    for (const pt of ['l','t','b']) {
      const p = portXY(n, pt);
      const d = Math.hypot(p.x - wx, p.y - wy);
      if (d < bestD) { bestD = d; best = { nid:n.id, port:pt, px:p.x, py:p.y }; }
    }
  }
  return best;
}

function onNodeMD(ev) {
  if (placeType) return;
  if (ev.button !== 0) return; // 右クリックはコンテキストメニュー用。ドラッグ/選択処理を起動しない

  const portEl = ev.target.closest('.ph-out');
  if (portEl) {
    ev.stopPropagation(); ev.preventDefault();
    const nid  = portEl.dataset.nid;
    const node = N(nid); if (!node) return;
    const pp   = portXY(node, 'r');
    IA = { kind:'edge', fromId:nid, fromPort:'r', sx:pp.x, sy:pp.y };
    return;
  }
  if (ev.target.closest('.ph-in')) return;
  ev.stopPropagation();

  const nid  = ev.currentTarget.dataset.nid;
  const node = N(nid); if (!node) return;

  // ダブルクリック判定
  const now = Date.now();
  if (nid === _dblNid && now - _dblTime < DBL_MS) {
    _dblNid = null; _dblTime = 0;
    openModal(nid); return;
  }
  _dblNid = nid; _dblTime = now;

  const w = c2w(ev.clientX, ev.clientY);

  // Shift+クリック: 複数選択トグル
  if (ev.shiftKey) {
    let ids = _multiIds().slice();
    if (S.sel?.kind === 'node') ids = [S.sel.id]; // 単一選択→複数に昇格
    if (ids.includes(nid)) ids = ids.filter(id => id !== nid);
    else ids.push(nid);
    S.sel = ids.length === 1 ? { kind:'node', id:ids[0] } : { kind:'multi', ids };
    redraw(); return;
  }

  // 複数選択中のノードをドラッグ → 全体移動
  if (_isInMultiSel(nid)) {
    const snap0 = ss();
    const origins = {};
    for (const id of _multiIds()) {
      const n = N(id); if (n) origins[id] = { ox:n.x, oy:n.y };
    }
    IA = { kind:'multi-move', ids:_multiIds(), origins, mx:w.x, my:w.y, snap0, moved:false };
    return;
  }

  // 通常の単一選択・移動
  S.sel = { kind:'node', id:nid };
  IA = { kind:'move', id:nid, ox:node.x, oy:node.y, mx:w.x, my:w.y, snap0:ss(), moved:false, freeMove:moveOnlyMode };
  redraw();
}

function onEdgeClick(ev) {
  if (placeType) return;
  ev.stopPropagation();
  S.sel = { kind:'edge', id:ev.currentTarget.dataset.eid };
  redraw();
}

/** 左サイドバーの幅をドラッグで調整可能にし、直近の幅を永続化する（タブ切替では幅を変えない） */
function initSidResizer() {
  const sid    = document.getElementById('sid');
  const handle = document.getElementById('sid-resizer');
  if (!sid || !handle) return;

  const MIN_W = 200, MAX_W = 440;
  const saved = parseInt(localStorage.getItem('nps_sid_w'), 10);
  if (saved >= MIN_W && saved <= MAX_W) sid.style.width = saved + 'px';

  let startX = 0, startW = 0, dragging = false;

  handle.addEventListener('mousedown', ev => {
    dragging = true;
    startX = ev.clientX;
    startW = sid.getBoundingClientRect().width;
    sid.style.transition = 'none';
    handle.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    ev.preventDefault();
  });

  window.addEventListener('mousemove', ev => {
    if (!dragging) return;
    const w = Math.min(MAX_W, Math.max(MIN_W, startW + (ev.clientX - startX)));
    sid.style.width = w + 'px';
  });

  window.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    sid.style.transition = '';
    handle.classList.remove('dragging');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    localStorage.setItem('nps_sid_w', Math.round(sid.getBoundingClientRect().width));
  });
}

function initEvents() {
  const cvs = document.getElementById('cvs');

  cvs.addEventListener('mousemove', ev => {
    if (placeType) { const w = c2w(ev.clientX, ev.clientY); showGhost(w.x, w.y); return; }
    if (!IA) return;
    const w = c2w(ev.clientX, ev.clientY);

    if (IA.kind === 'pan') {
      S.vp.tx = IA.stx + (ev.clientX - IA.sx);
      S.vp.ty = IA.sty + (ev.clientY - IA.sy);
      applyVP(); return;
    }

    if (IA.kind === 'move') {
      const node = N(IA.id); if (!node) return;
      const rawX = IA.ox + (w.x - IA.mx);
      const rawY = IA.oy + (w.y - IA.my);
      IA.moved = true;

      if (IA.freeMove) {
        // 配置調整モード: 配線の組み替え（挿入/抜き取り）を行わず座標だけ更新する。
        // 接続線は routePath が現在座標を参照するため、そのまま追従して表示される。
        node.x = snapV(rawX);
        node.y = snapV(rawY);
        document.getElementById('TL').innerHTML = '';
        renderEdges(); renderMerges(); renderNodes(); return;
      }

      // ゴースト位置を追跡（ノード自体は元位置を維持→接続線はそのまま表示）
      IA.ghostX = snapV(rawX);
      IA.ghostY = snapV(rawY);
      // インサート候補検知: グリッド吸着前の実ポインタ位置で判定する
      // （スナップ後の座標だと隣接ノードに吸着して意図しないターゲットになるため）
      const origX = node.x, origY = node.y;
      node.x = rawX; node.y = rawY;
      IA.insertTarget = _findInsertTarget(node);
      IA.blocked      = IA.insertTarget ? null : _findInsertBlocked(node, origX, origY);
      node.x = origX; node.y = origY;
      // ゴーストノード + 挿入ヒント + グループ移動/離脱バッジを TL レイヤーに描画
      _renderGhostAndHint(node, IA.ghostX, IA.ghostY, IA.insertTarget, IA.blocked);
      // ホバー位置の意味（挿入先グループ・離脱・挿入不可）をステータスに常時表示
      const msg = _dragHoverMsg(node, IA.insertTarget, IA.blocked);
      if (msg !== IA._msg) { IA._msg = msg; setStatus(msg); }
      renderEdges(); renderMerges(); renderNodes(); return;
    }

    // 複数ノード同時移動
    if (IA.kind === 'multi-move') {
      const dx = w.x - IA.mx, dy = w.y - IA.my;
      for (const id of IA.ids) {
        const n = N(id), o = IA.origins[id]; if (!n || !o) continue;
        n.x = snapV(o.ox + dx);
        n.y = snapV(o.oy + dy);
      }
      IA.moved = true;
      renderEdges(); renderMerges(); renderNodes(); return;
    }

    // ラバーバンド選択
    if (IA.kind === 'band') {
      // ワールド座標での選択範囲
      const x0 = Math.min(IA.wx0, w.x), y0 = Math.min(IA.wy0, w.y);
      const x1 = Math.max(IA.wx0, w.x), y1 = Math.max(IA.wy0, w.y);
      // スクリーン座標での表示矩形（cwrap相対）
      const wrap  = document.getElementById('cwrap').getBoundingClientRect();
      const bx0   = Math.min(IA.cx0, ev.clientX) - wrap.left;
      const by0   = Math.min(IA.cy0, ev.clientY) - wrap.top;
      const bx1   = Math.max(IA.cx0, ev.clientX) - wrap.left;
      const by1   = Math.max(IA.cy0, ev.clientY) - wrap.top;
      const bw    = bx1 - bx0, bh = by1 - by0;

      // ヒットテスト（ワールド座標）
      const hit = S.nodes.filter(n => {
        const r = SYMS[n.type].r;
        return n.x + r >= x0 && n.x - r <= x1 && n.y + r >= y0 && n.y - r <= y1;
      }).map(n => n.id);
      IA.hitIds = hit;

      // バンド表示（最小サイズ4px以上で表示）
      const bd = document.getElementById('band-div');
      const bi = document.getElementById('band-info');
      if (bw > 4 || bh > 4) {
        bd.style.display  = 'block';
        bd.style.left     = bx0 + 'px';
        bd.style.top      = by0 + 'px';
        bd.style.width    = bw  + 'px';
        bd.style.height   = bh  + 'px';
        // 件数バッジ: Gestalt近接性 — カーソル右下に追従
        const infoX = Math.max(IA.cx0, ev.clientX) - wrap.left + 10;
        const infoY = Math.max(IA.cy0, ev.clientY) - wrap.top  + 10;
        bi.style.display = 'block';
        bi.style.left    = infoX + 'px';
        bi.style.top     = infoY + 'px';
        bi.textContent   = hit.length ? hit.length + '件選択中' : '範囲を指定';
        bi.className     = hit.length ? 'band-info has-hit' : 'band-info';
      } else {
        bd.style.display = 'none';
        bi.style.display = 'none';
      }

      // 対象ノードを即時ハイライト（ノードSVGクラスを直接切替）
      document.querySelectorAll('.ng').forEach(el => {
        el.classList.toggle('band-hover', hit.includes(el.dataset.nid));
      });
      return;
    }

    if (IA.kind === 'edge') {
      const tgt = nearPort(w.x, w.y, IA.fromId);
      const ex = tgt ? tgt.px : w.x, ey = tgt ? tgt.py : w.y;
      document.getElementById('TL').innerHTML =
        `<line x1="${IA.sx}" y1="${IA.sy}" x2="${ex}" y2="${ey}"
           stroke="var(--acc)" stroke-width="2" stroke-dasharray="5,3"/>
         ${tgt ? `<circle cx="${tgt.px}" cy="${tgt.py}" r="9"
           fill="var(--acc-bg)" stroke="var(--acc)" stroke-width="2"/>` : ''}`;
    }
  });

  cvs.addEventListener('mousedown', ev => {
    const w = c2w(ev.clientX, ev.clientY);

    // 配置モード中はノード・エッジのヒット領域より配置操作を優先する
    // （フロー線の上をクリックしたときに挿入されず無反応になるのを防ぐ）
    if (placeType && ev.button === 0) {
      const prevSelId = S.sel?.kind === 'node' ? S.sel.id : null;
      // フロー線・記号上なら挿入、それ以外は選択中ノードから自動接続
      placeSymbolAt(placeType, w.x, w.y, prevSelId);
      return;
    }

    if (ev.target.closest('.ng') || ev.target.closest('.eg') || ev.target.closest('.mg')) return;

    if (ev.button === 1 || (ev.button === 0 && spaceHeld)) {
      ev.preventDefault();
      IA = { kind:'pan', sx:ev.clientX, sy:ev.clientY, stx:S.vp.tx, sty:S.vp.ty };
      cvs.classList.add('panning'); return;
    }

    if (ev.button === 0) {
      _dblNid = null; _dblTime = 0;
      // ラバーバンド選択開始（空白クリック）
      IA = { kind:'band', wx0:w.x, wy0:w.y, cx0:ev.clientX, cy0:ev.clientY, hitIds:[] };
    }
  });

  window.addEventListener('mouseup', ev => {
    if (!IA) return;
    const { kind } = IA;

    if (kind === 'pan') {
      document.getElementById('cvs').classList.remove('panning');
      document.getElementById('TL').innerHTML = '';

    } else if (kind === 'move') {
      document.getElementById('TL').innerHTML = '';
      if (IA.moved && IA.freeMove) {
        // 配置調整モード: 挿入/抜き取り判定を行わず、位置の確定のみ行う（配線は保持）
        const { snap0 } = IA;
        IA = null;
        graphErrors = {};
        S._undo.push(snap0);
        if (S._undo.length > 100) S._undo.shift();
        S._redo = []; rUB();
        redraw();
      } else if (IA.moved) {
        const { id, ox, oy, ghostX, ghostY, insertTarget, blocked, snap0 } = IA;
        // redraw の前に IA をクリアする（ドラッグ中表示クラス
        // node-dragging-src が確定後のノードに残るのを防ぐ）
        IA = null;

        const node = N(id);
        const hasEdges = node && S.edges.some(e => e.from === node.id || e.to === node.id);
        const inserted = node ? _doChartInsert(node, insertTarget) : false;

        if (node && !inserted && blocked) {
          // 挿入できない場所（起点記号・起点直後の線・自分の接続線）への
          // ドロップは状態を変えず元の位置に戻す。
          node.x = ox;
          node.y = oy;
          const reasons = {
            'base':      '起点記号には挿入できないため',
            'base-edge': '起点直後の線には挿入できないため',
            'self-edge': '自分自身の接続線には挿入できないため',
          };
          showToast(`⚠ ${reasons[blocked.reason] || 'ここには挿入できないため'}元の位置に戻しました`, 'error');
          redraw();
          return;
        }

        let leftMsg = null;
        if (node && !inserted) {
          // 空き地へのドロップ: ラインから抜き取り（前後をブリッジ接続）、
          // グループからも外して単独記号としてドロップ位置に配置する。
          const prevG = node.groupId ? G(node.groupId) : null;
          node.x = ghostX ?? node.x;
          node.y = ghostY ?? node.y;
          if (hasEdges) {
            _extractNodeFromChain(node);
            _syncListOrderFromGraph();
          }
          if (hasEdges || prevG) {
            node.groupId = null;
            leftMsg = hasEdges
              ? `ラインから抜き取りました${prevG ? ` — グループ「${prevG.label}」から外れました` : ''}（線や記号にドロップすると再挿入できます）`
              : `グループ「${prevG.label}」から外れました`;
          }
        }

        graphErrors = {};
        S._undo.push(snap0);
        if (S._undo.length > 100) S._undo.shift();
        S._redo = []; rUB();
        if (inserted) {
          // 挿入後に整列と整合チェックを自動実行
          syncChartFromListOrder();
          validateGraph();
          const n = Object.keys(graphErrors).length;
          const g = node?.groupId ? G(node.groupId) : null;
          const gTxt = g ? `工程をグループ「${g.label}」に挿入しました` : '工程を挿入しました';
          setStatus(n > 0
            ? `${gTxt} — ルール違反が ${n} 件あります`
            : `${gTxt} — 整列・ルールチェック OK`);
        } else if (leftMsg) {
          setStatus(leftMsg);
        }
        redraw();
      }

    } else if (kind === 'multi-move') {
      if (IA.moved) {
        graphErrors = {};
        S._undo.push(IA.snap0);
        if (S._undo.length > 100) S._undo.shift();
        S._redo = []; rUB();
        renderMerges();
      }

    } else if (kind === 'band') {
      document.getElementById('band-div').style.display = 'none';
      document.getElementById('band-info').style.display = 'none';
      document.querySelectorAll('.ng.band-hover').forEach(el => el.classList.remove('band-hover'));
      const hit = IA.hitIds || [];
      if (hit.length > 1) {
        S.sel = { kind:'multi', ids: hit };
        redraw();
      } else if (hit.length === 1) {
        S.sel = { kind:'node', id: hit[0] };
        redraw();
      } else {
        S.sel = null; redraw();
      }

    } else if (kind === 'edge') {
      const w   = c2w(ev.clientX, ev.clientY);
      const tgt = nearPort(w.x, w.y, IA.fromId);
      document.getElementById('TL').innerHTML = '';
      if (tgt && tgt.nid !== IA.fromId) {
        // ── 循環接続チェック ──────────────────────────
        if (_wouldCreateCycle(IA.fromId, tgt.nid)) {
          showToast('⚠ 循環接続（ループ）は作成できません — 工程順は DAG（有向非巡回グラフ）でなければなりません', 'error');
        } else {
          const fn = N(IA.fromId), tn = N(tgt.nid);
          // ── 異なるグループ間の接続チェック ─────────────
          if (fn?.groupId && tn?.groupId && fn.groupId !== tn.groupId) {
            if (tgt.port === 't' || tgt.port === 'b') {
              // 合流接続（右端OUT → 上/下IN）: merge エントリを作成
              const existing = getMergeBySubGroup(fn.groupId);
              if (existing) {
                if (!confirm('このグループにはすでに合流接続があります。上書きしますか？')) { IA = null; return; }
                S.merges = (S.merges || []).filter(m => m.id !== existing.id);
              }
              pushUndo();
              S.merges = S.merges || [];
              S.merges.push({ id: uid(), subGroupId: fn.groupId, targetNodeId: tgt.nid });
              syncChartFromListOrder();
              _syncListOrderFromGraph();
              redraw(); fitView();
              setStatus('グループ合流を設定しました');
            } else {
              showToast('⚠ 別グループへの直接接続はできません — 合流させる場合は合流先記号の上/下ポートに接続してください', 'error');
            }
          } else {
            // 重複エッジチェック（同一経路のエッジが既にある場合はスキップ）
            if (_edgeExists(IA.fromId, IA.fromPort, tgt.nid, tgt.port)) {
              showToast('⚠ この接続は既に存在します', 'warn');
            } else {
              pushUndo();
              const edge = { id:uid(), from:IA.fromId, fromPort:IA.fromPort, to:tgt.nid, toPort:tgt.port };
              if (fn && tn && (isBase(fn.type) || isBase(tn.type))) edge.hidden = true;
              S.edges.push(edge);
              // ── listOrder をグラフのトポロジカル順に同期 ──
              _syncListOrderFromGraph();
              redraw();
            }
          }
        }
      }
    }
    IA = null;
  });

  cvs.addEventListener('wheel', ev => {
    ev.preventDefault();
    zoomAt(ev.clientX, ev.clientY, ev.deltaY < 0 ? 1.12 : 1 / 1.12);
  }, { passive: false });

  document.addEventListener('keydown', ev => {
    if (document.getElementById('edit-modal').classList.contains('show')) return;
    if (document.getElementById('guide-modal').classList.contains('show')) {
      if (ev.key === 'Escape') closeGuideModal();
      return;
    }
    const tag = document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (ev.key === ' ' || ev.code === 'Space') {
      ev.preventDefault(); spaceHeld = true;
      if (!placeType) document.getElementById('cvs').style.cursor = 'grab';
    }
    if (ev.key === 'Escape')                              cancelPlace();
    if (ev.key === 'Delete' || ev.key === 'Backspace')    { ev.preventDefault(); deleteSel(); }
    if (ev.ctrlKey && ev.key === 'z')                     { ev.preventDefault(); undo(); }
    if (ev.ctrlKey && (ev.key === 'y' || ev.key === 'Y')) { ev.preventDefault(); redo(); }
    if (ev.ctrlKey && ev.key === 's')                     { ev.preventDefault(); saveJ(); }
  });

  document.addEventListener('keyup', ev => {
    if (ev.key === ' ' || ev.code === 'Space') {
      spaceHeld = false;
      if (!placeType) document.getElementById('cvs').style.cursor = '';
    }
  });

  cvs.addEventListener('contextmenu', ev => {
    ev.preventDefault();
    cancelPlace();
    if (currentView !== 'chart' || placeType) return;
    const nodeEl  = ev.target.closest('.ng');
    const edgeEl  = !nodeEl && ev.target.closest('.eg');
    const mergeEl = !nodeEl && !edgeEl && ev.target.closest('.mg');
    if (nodeEl)       openContextMenu(ev, 'node', nodeEl.dataset.nid);
    else if (edgeEl)  openContextMenu(ev, 'edge', edgeEl.dataset.eid);
    else if (mergeEl) openContextMenu(ev, 'merge', mergeEl.dataset.mid);
    else              openContextMenu(ev, 'canvas', null);
  });
}

/** ノードオブジェクト生成ファクトリ */
function mkNode(type, x, y) {
  return { id:uid(), type, x, y, label:'', note:'', comment:'', unit:'', unitQty:'',
           badges:[], badgePos:'top', badgeOffsets:{}, badgeBorders:{},
           badgeColors:{}, badgeColorEnabled:{},
           groupId:null, listParentIds:[] };
}

// ── I/O ─────────────────────────────────────────

const gMeta = ()  => S.meta;
const sMeta = m   => { if (m) S.meta = { ...S.meta, ...m }; };

function saveJ() {
  syncActiveChart();
  const payload = {
    charts: W.charts, activeId: W.activeId, uid: _uid,
    machineMaster, capSettings, improvementMode,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type:'application/json' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = `NPS工程図_${getActiveChartName() || 'workspace'}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  saveLS();
}

function trigLoad() { document.getElementById('fload').click(); }

function loadJ(ev) {
  const f = ev.target.files[0]; if (!f) return;
  // 既存の作業内容がある場合は上書き確認（誤って別ファイルを選んだ場合のデータ消失を防ぐ）
  const hasExisting = W.charts.some(c => (c.nodes?.length || 0) > 0 ||
    Object.values(c.impVariants || {}).some(v => (v?.nodes?.length || 0) > 0));
  if (hasExisting && !confirm('現在の作業内容を、読み込むJSONファイルの内容で置き換えます。\nこの操作は元に戻せません。続けますか？')) {
    ev.target.value = '';
    return;
  }
  const r = new FileReader();
  r.onload = e => {
    try {
      const d = JSON.parse(e.target.result);
      if (Array.isArray(d.charts) && d.charts.length) {
        // V3 ワークスペース形式
        W.charts   = d.charts;
        W.activeId = d.activeId || d.charts[0].id;
        if (d.uid) _uid = Math.max(_uid, d.uid);
        const active = W.charts.find(c => c.id === W.activeId) || W.charts[0];
        W.activeId = active.id;
        if (d.improvementMode) improvementMode = d.improvementMode; // バリアントロード前にモード確定
        loadChartIntoS(active);
      } else {
        // V2 単一工程図形式 → アクティブ工程図を置き換え
        const ac = W.charts.find(c => c.id === W.activeId);
        if (ac) {
          // ノードフィールドを loadChartIntoS / mkNode と完全一致させる
          ac.nodes     = (d.nodes || []).map(n => ({
            listParentIds:[], badgeOffsets:{}, badgeBorders:{}, badgeColors:{}, badgeColorEnabled:{}, ...n
          }));
          ac.edges            = d.edges      || [];
          ac.groups           = d.groups     || [];
          ac.merges           = d.merges     || [];
          ac.listOrder        = d.listOrder  || [];
          ac.meta             = d.meta       || ac.meta;
          ac.backboneGroupId  = d.backboneGroupId || null;
          if (d.uid) _uid = Math.max(_uid, d.uid);
          loadChartIntoS(ac);
        }
      }
      S._undo = []; S._redo = [];
      graphErrors = {};
      rUB(); redraw(); resetView();
      saveLS();
      // グローバル設定を復元
      if (Array.isArray(d.machineMaster) && d.machineMaster.length) machineMaster = d.machineMaster;
      if (d.capSettings) {
        capSettings.operatingTime  = d.capSettings.operatingTime  ?? capSettings.operatingTime;
        capSettings.targetQty      = d.capSettings.targetQty      ?? capSettings.targetQty;
        capSettings.groupOverrides = d.capSettings.groupOverrides ?? {};
      }
      if (d.improvementMode) setImprovementMode(d.improvementMode);
      _saveGlobalSettings();
      _updateActiveChartDisplay();
      setStatus('読み込み完了');
    } catch (err) { alert('読み込みエラー: ' + err.message); }
  };
  r.readAsText(f);
  ev.target.value = '';
}

// ── 初期化 ───────────────────────────────────────

function init() {
  if (!S.meta.dt) S.meta.dt = new Date().toISOString().split('T')[0];
  const verEl = document.getElementById('app-version');
  if (verEl) verEl.textContent = 'v' + APP_VERSION;
  buildPalette();
  buildChartPalBar();
  initEvents();
  initSidResizer();
  _loadLegendPref();
  window.addEventListener('resize', () => _applyLegendPos());
  document.getElementById('btn-nums').classList.toggle('on', showNums);

  const wr = document.getElementById('cwrap').getBoundingClientRect();
  S.vp.tx  = wr.width  / 2;
  S.vp.ty  = wr.height / 2;
  applyVP();
  rUB();

  const hasData = _loadLS();
  _loadGlobalSettings();

  // 保存済みモードに合わせてバリアントを再ロード＆ imp-mode ボタン同期
  if (W.activeId) {
    const _ac = W.charts.find(c => c.id === W.activeId);
    if (_ac?.impVariants) loadChartIntoS(_ac);
  }
  document.querySelectorAll('.imp-mode-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.mode === improvementMode));

  _updateActiveChartDisplay();
  if (hasData) {
    redraw();
    resetView();
    setStatus('前回のデータを復元しました — 保存: Ctrl+S');
  } else {
    redraw();
    showWelcome();
  }
}

init();

// ── 画像保存（A4 PNG エクスポート）─────────────────

// A4サイズ定義 (mm)
const A4 = { w: 297, h: 210 }; // Landscape デフォルト

let _exportOrient = 'landscape'; // 'landscape' | 'portrait'
let _exportSplit  = 1;           // 1 | 2 | 3 | 4

function openExportDialog() {
  document.getElementById('export-modal').classList.add('show');
  _updateExportInfo();
  _renderExportPreview();
}
function closeExportDialog() {
  document.getElementById('export-modal').classList.remove('show');
}
function setExportOrient(o) {
  _exportOrient = o;
  document.getElementById('exp-landscape').classList.toggle('active', o === 'landscape');
  document.getElementById('exp-portrait').classList.toggle('active', o === 'portrait');
  _updateExportInfo();
  _renderExportPreview();
}
function setExportSplit(n) {
  _exportSplit = n;
  [1,2,3,4].forEach(i => {
    document.getElementById(`exp-${i}page`).classList.toggle('active', i === n);
  });
  _updateExportInfo();
  _renderExportPreview();
}

function _updateExportInfo() {
  const orient = _exportOrient === 'landscape' ? '横' : '縦';
  const dpi = document.getElementById('exp-dpi')?.value || 200;
  const split = _exportSplit === 1 ? '1枚' : _exportSplit === 4 ? '2×2分割' : `縦${_exportSplit}分割`;
  document.getElementById('export-info').textContent = `A4 ${orient} ${split} · ${dpi}dpi`;
}

/** SVGのノード群のバウンディングボックスを取得 */
function _getNodesBBox() {
  if (!S.nodes.length) return { x:-200, y:-200, w:400, h:400 };
  const PAD = 80; // 余白(px, SVG座標系)
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of S.nodes) {
    const r = SYMS[n.type].r;
    const tx = n.type === 'unpan' ? r : 0;
    // ラベル上の余白も考慮
    minX = Math.min(minX, n.x - r * 2);
    minY = Math.min(minY, n.y - r - 70); // ラベルボックス上方
    maxX = Math.max(maxX, n.x + r * 2);
    maxY = Math.max(maxY, n.y + r + 60); // バッジ下方
  }
  return {
    x: minX - PAD, y: minY - PAD,
    w: (maxX - minX) + PAD * 2,
    h: (maxY - minY) + PAD * 2,
  };
}

/** A4 1ページのピクセルサイズを計算 (dpi基準) */
function _a4px(dpi) {
  const mmToInch = 1 / 25.4;
  const pw = (_exportOrient === 'landscape' ? A4.w : A4.h) * mmToInch * dpi;
  const ph = (_exportOrient === 'landscape' ? A4.h : A4.w) * mmToInch * dpi;
  return { pw: Math.round(pw), ph: Math.round(ph) };
}

/**
 * SVGをシリアライズし、指定ビューポートでCanvasに描画してPNG Blobを返す。
 * ビューポートの transform (translate/scale) をリセットして viewBox をワールド座標で制御する。
 */
async function _renderPageToBlob(vbX, vbY, vbW, vbH, canvasW, canvasH, marginMM, dpi) {
  const mmPx = dpi / 25.4;
  const mPx  = marginMM * mmPx;
  // 描画領域（余白内側）
  const drawW = canvasW - mPx * 2;
  const drawH = canvasH - mPx * 2;

  // scale: SVG空間 → Canvas描画領域
  const scale = Math.min(drawW / vbW, drawH / vbH);
  const scaledW = vbW * scale;
  const scaledH = vbH * scale;
  const offX = mPx + (drawW - scaledW) / 2;
  const offY = mPx + (drawH - scaledH) / 2;

  // SVGをシリアライズ（元のSVGをクローンして viewBox を書き換え）
  const origSvg = document.getElementById('cvs');
  const clone = origSvg.cloneNode(true);
  clone.setAttribute('viewBox', `${vbX} ${vbY} ${vbW} ${vbH}`);
  clone.setAttribute('width',  String(scaledW));
  clone.setAttribute('height', String(scaledH));

  // ビューポートグループの transform をリセット（translate/scale の影響を除去）
  // ノードはワールド座標に配置されており、viewBox もワールド座標で指定するため
  const vpEl = clone.querySelector('#vp');
  if (vpEl) vpEl.setAttribute('transform', 'translate(0,0) scale(1)');

  // フォント埋め込みのためスタイルを注入
  const styleEl = document.createElement('style');
  styleEl.textContent = `
    text { font-family: 'Noto Sans JP', 'Hiragino Kaku Gothic Pro', sans-serif; }
    .ph { display: none; }
    .insert-hint-anim { display: none; }
    /* 非表示配線の作成中プレビュー表示は画像保存には出さない（最終出力仕様） */
    .eg[data-hidden-wire="1"] path { stroke: transparent !important; }
  `;
  clone.insertBefore(styleEl, clone.firstChild);

  let svgStr = new XMLSerializer().serializeToString(clone);
  // 凡例（加工・検査・運搬・停滞の集計）を各ページ左下に焼き込む。
  // オンスクリーンの自由な位置はページ座標系と無関係なため反映できないが、
  // 内容（集計値・表示サイズ）は画面表示と一致させる。
  const legendSvg = _legendExportSVG(vbX, vbY, vbW, vbH);
  if (legendSvg) svgStr = svgStr.replace('</svg>', legendSvg + '</svg>');

  const blob   = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
  const url    = URL.createObjectURL(blob);

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width  = canvasW;
      canvas.height = canvasH;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvasW, canvasH);
      ctx.drawImage(img, offX, offY, scaledW, scaledH);
      URL.revokeObjectURL(url);
      canvas.toBlob(resolve, 'image/png');
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('SVG render failed')); };
    img.src = url;
  });
}

/** スプリット数に応じたページ配列を計算 */
function _computePages(bbox) {
  const n = _exportSplit;
  if (n === 1) {
    return [{ vbX: bbox.x, vbY: bbox.y, vbW: bbox.w, vbH: bbox.h, label: '1' }];
  }
  if (n === 2) {
    // 縦2分割（左右）
    const hw = bbox.w / 2;
    return [
      { vbX: bbox.x,       vbY: bbox.y, vbW: hw, vbH: bbox.h, label: '1of2' },
      { vbX: bbox.x + hw,  vbY: bbox.y, vbW: hw, vbH: bbox.h, label: '2of2' },
    ];
  }
  if (n === 3) {
    const tw = bbox.w / 3;
    return [0,1,2].map(i => ({
      vbX: bbox.x + i * tw, vbY: bbox.y, vbW: tw, vbH: bbox.h, label: `${i+1}of3`,
    }));
  }
  // 4: 2×2
  const hw = bbox.w / 2, hh = bbox.h / 2;
  return [
    { vbX: bbox.x,      vbY: bbox.y,      vbW: hw, vbH: hh, label: '1of4(左上)' },
    { vbX: bbox.x + hw, vbY: bbox.y,      vbW: hw, vbH: hh, label: '2of4(右上)' },
    { vbX: bbox.x,      vbY: bbox.y + hh, vbW: hw, vbH: hh, label: '3of4(左下)' },
    { vbX: bbox.x + hw, vbY: bbox.y + hh, vbW: hw, vbH: hh, label: '4of4(右下)' },
  ];
}

/**
 * プレビューサムネイルを生成する。表示領域（.export-preview-area の実サイズ）を
 * 実測し、ページ配置（1〜3枚は横並び、4枚は2×2）で収まる最大サイズまで
 * サムネイルを拡大する（従来は 180×140px の固定上限だったため、モーダルを
 * 広げても余白ばかりでプレビュー自体は小さいままだった）。
 */
async function _renderExportPreview() {
  const inner = document.getElementById('export-preview-inner');
  const area  = document.getElementById('export-preview-area');
  if (!inner) return;
  inner.innerHTML = '<span class="export-preview-hint">生成中...</span>';

  const dpi = 96; // プレビュー用（拡大表示してもある程度鮮明に見える解像度）
  const margin = parseInt(document.getElementById('exp-margin')?.value || 15);
  const { pw, ph } = _a4px(dpi);
  const bbox = _getNodesBBox();
  const pages = _computePages(bbox);

  const areaRect = area ? area.getBoundingClientRect() : { width: 900, height: 700 };
  const GAP = 16, LABEL_H = 22, OUTER_PAD = 16; // OUTER_PAD は .export-preview-area の実際の padding と一致させる
  const cols = pages.length === 4 ? 2 : pages.length;
  const rows = Math.ceil(pages.length / cols);
  const availW = Math.max(240, areaRect.width  - OUTER_PAD * 2 - GAP * (cols - 1));
  const availH = Math.max(240, areaRect.height - OUTER_PAD * 2 - GAP * (rows - 1) - LABEL_H * rows);
  const scale  = Math.min((availW / cols) / pw, (availH / rows) / ph);
  const thumbW = Math.round(pw * scale);
  const thumbH = Math.round(ph * scale);

  if (inner) {
    inner.style.display = 'grid';
    inner.style.gridTemplateColumns = `repeat(${cols}, ${thumbW}px)`;
  }

  inner.innerHTML = '';
  for (const pg of pages) {
    try {
      const blob = await _renderPageToBlob(pg.vbX, pg.vbY, pg.vbW, pg.vbH, pw, ph, margin, dpi);
      const url = URL.createObjectURL(blob);
      const wrap = document.createElement('div');
      wrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;';
      const img = document.createElement('img');
      img.className = 'export-page-thumb';
      img.style.cssText = `width:${thumbW}px;height:${thumbH}px;display:block;`;
      img.src = url;
      img.onload = () => URL.revokeObjectURL(url);
      const lbl = document.createElement('div');
      lbl.className = 'export-page-label';
      lbl.textContent = pages.length > 1 ? `ページ ${pg.label}` : 'A4 プレビュー';
      wrap.appendChild(img);
      wrap.appendChild(lbl);
      inner.appendChild(wrap);
    } catch(e) {
      inner.innerHTML = '<span class="export-preview-hint">プレビュー生成エラー</span>';
    }
  }
}

/** 実際にダウンロード */
async function runExport() {
  const btn = document.getElementById('export-run-btn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 処理中...'; }

  const dpi    = parseInt(document.getElementById('exp-dpi')?.value || 200);
  const margin = parseInt(document.getElementById('exp-margin')?.value || 15);
  const { pw, ph } = _a4px(dpi);
  const bbox   = _getNodesBBox();
  const pages  = _computePages(bbox);
  const name   = S.meta.hb || S.meta.hm || 'NPS工程図';

  try {
    for (const pg of pages) {
      const blob = await _renderPageToBlob(pg.vbX, pg.vbY, pg.vbW, pg.vbH, pw, ph, margin, dpi);
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      const suffix = pages.length > 1 ? `_p${pg.label}` : '';
      a.download = `${name}${suffix}.png`;
      a.click();
      URL.revokeObjectURL(url);
      if (pages.length > 1) await new Promise(r => setTimeout(r, 300));
    }
    setStatus(`画像保存完了 — ${pages.length}ファイルをダウンロードしました`);
    closeExportDialog();
  } catch(e) {
    alert('画像保存エラー: ' + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-download"></i> ダウンロード'; }
  }
}

/**
 * 現在の工程図を（凡例を含めて）PNG画像としてクリップボードにコピーする。
 * A4ページ割りは行わず、図全体をそのままの縦横比・等倍相当の解像度で書き出す
 * （Slack・Word等への貼り付け用の素早いコピー操作のため）。
 */
async function copyChartImageToClipboard() {
  if (!S.nodes.length) { setStatus('コピーする工程図がありません'); return; }
  if (!navigator.clipboard || typeof ClipboardItem === 'undefined') {
    setStatus('⚠ このブラウザはクリップボードへの画像コピーに対応していません');
    return;
  }

  const btn = document.getElementById('btn-copy-image');
  const prevHtml = btn ? btn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> コピー中...'; }

  try {
    const bbox   = _getNodesBBox();
    const SCALE  = 2; // Retina相当の解像度
    const canvasW = Math.round(bbox.w * SCALE);
    const canvasH = Math.round(bbox.h * SCALE);
    const blob = await _renderPageToBlob(bbox.x, bbox.y, bbox.w, bbox.h, canvasW, canvasH, 0, 96);
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    setStatus('工程図（凡例含む）をクリップボードにコピーしました — Ctrl+V で貼り付けられます');
  } catch (e) {
    setStatus('⚠ クリップボードへのコピーに失敗しました: ' + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = prevHtml; }
  }
}
