'use strict';

// ═══════════════════════════════════════════════
// RENDER — ビューポート / 描画エンジン / プロパティパネル
// ═══════════════════════════════════════════════

// ── レイアウト定数 ─────────────────────────────
const LABEL_BOX_TOP = -54;
const LABEL_BOX_H   = 18;
const UNIT_BADGE_H  = 13;

// ── ビューポート ─────────────────────────────────

function applyVP() {
  document.getElementById('vp').setAttribute('transform',
    `translate(${S.vp.tx},${S.vp.ty}) scale(${S.vp.scale})`);
}

function c2w(cx, cy) {
  const r = document.getElementById('cvs').getBoundingClientRect();
  return {
    x: (cx - r.left - S.vp.tx) / S.vp.scale,
    y: (cy - r.top  - S.vp.ty) / S.vp.scale,
  };
}

function zoomAt(cx, cy, f) {
  const ns = Math.max(0.1, Math.min(6, S.vp.scale * f));
  const r  = document.getElementById('cvs').getBoundingClientRect();
  const px = cx - r.left, py = cy - r.top;
  S.vp.tx  = px - (px - S.vp.tx) * (ns / S.vp.scale);
  S.vp.ty  = py - (py - S.vp.ty) * (ns / S.vp.scale);
  S.vp.scale = ns;
  applyVP();
  document.getElementById('zdsp').textContent = Math.round(ns * 100) + '%';
}

function doZoom(f) {
  const r = document.getElementById('cwrap').getBoundingClientRect();
  zoomAt(r.left + r.width / 2, r.top + r.height / 2, f);
}

/**
 * 全ノードの視覚的バウンディングボックスを返す。
 * シンボル本体・ラベルボックス・各バッジ（状態/unit/comment）の
 * 実際の描画領域を考慮して minX/minY/maxX/maxY を計算する。
 */
function getNodesBounds() {
  const PILL_H = 14, GAP = 2;
  const COMMENT_LINE_H = 10, COMMENT_PAD_V = 4;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

  for (const node of S.nodes) {
    const r      = SYMS[node.type].r;
    const badges = node.badges || [];

    // ── X 範囲: シンボル幅 vs ラベルボックス幅の広い方 ──
    const symL  = node.type === 'unpan' ? node.x        : node.x - r;
    const symR  = node.type === 'unpan' ? node.x + 2 * r : node.x + r;
    const cx    = node.type === 'unpan' ? node.x + r    : node.x;
    const label = node.label || '';
    const lbw   = Math.max(44, label.length * 7 + 24);
    minX = Math.min(minX, Math.min(symL, cx - lbw / 2));
    maxX = Math.max(maxX, Math.max(symR, cx + lbw / 2));

    // ── Y 上端: ラベルボックス天辺 + ステータスバッジ分 ──
    const statusBids   = badges.filter(bid => STATUS_BADGE_IDS.has(bid));
    const totalStatusH = statusBids.length * (PILL_H + GAP);
    const topY         = node.y + LABEL_BOX_TOP - (totalStatusH > 0 ? totalStatusH + 2 : 0);
    minY = Math.min(minY, topY);

    // ── Y 下端: シンボル下端 + unit / comment バッジ分 ──
    const labelShow  = node.labelShow !== false;
    const hasUnit    = badges.includes('unit');
    const hasComment = badges.includes('comment');
    let bottomY = node.y + r + (labelShow && label ? 5 : 18) + 2;
    if (hasUnit)    bottomY += PILL_H + GAP;
    if (hasComment) {
      const nLines = (node.comment || '').trim()
        ? Math.min((node.comment.trim().split('\n').length), 6) : 1;
      bottomY += COMMENT_PAD_V * 2 + nLines * COMMENT_LINE_H + GAP;
    }
    maxY = Math.max(maxY, bottomY);
  }
  return { minX, maxX, minY, maxY };
}

function resetView() {
  const wr = document.getElementById('cwrap').getBoundingClientRect();
  if (wr.width <= 0 || wr.height <= 0) { requestAnimationFrame(resetView); return; }
  if (!S.nodes.length) {
    S.vp.scale = 1;
    S.vp.tx = wr.width  / 2;
    S.vp.ty = wr.height / 2;
    applyVP();
    document.getElementById('zdsp').textContent = '100%';
    return;
  }
  const MARGIN = 40;
  const bounds = getNodesBounds();
  const cw = bounds.maxX - bounds.minX;
  const ch = bounds.maxY - bounds.minY;
  // コンテンツが収まらない場合のみ縮小。拡大は行わない（上限 100% = scale 1.0）
  const ns = Math.min(1,
    (wr.width  - MARGIN * 2) / (cw || 1),
    (wr.height - MARGIN * 2) / (ch || 1)
  );
  S.vp.scale = Math.max(0.1, ns);
  S.vp.tx = -bounds.minX * S.vp.scale + MARGIN;
  S.vp.ty = -bounds.minY * S.vp.scale + MARGIN;
  applyVP();
  document.getElementById('zdsp').textContent = Math.round(S.vp.scale * 100) + '%';
}

function fitView() {
  if (!S.nodes.length) { resetView(); return; }
  const wr = document.getElementById('cwrap').getBoundingClientRect();
  if (wr.width <= 0 || wr.height <= 0) { requestAnimationFrame(fitView); return; }
  const minX = Math.min(...S.nodes.map(n => n.x - SYMS[n.type].r));
  const maxX = Math.max(...S.nodes.map(n => n.x + SYMS[n.type].r));
  const minY = Math.min(...S.nodes.map(n => n.y - SYMS[n.type].r));
  const maxY = Math.max(...S.nodes.map(n => n.y + SYMS[n.type].r));
  S.vp.scale = Math.min((wr.width - 80) / (maxX - minX || 1), (wr.height - 80) / (maxY - minY || 1), 1);
  S.vp.tx    = (wr.width  - (minX + maxX) * S.vp.scale) / 2;
  S.vp.ty    = (wr.height - (minY + maxY) * S.vp.scale) / 2;
  applyVP();
  document.getElementById('zdsp').textContent = Math.round(S.vp.scale * 100) + '%';
}

// ── 合流接続線 ───────────────────────────────────

function renderMerges() {
  let h = '';
  for (const m of (S.merges || [])) {
    const g    = (S.groups || []).find(x => x.id === m.subGroupId);
    const tgt  = N(m.targetNodeId);
    const last = getGroupLastNode(m.subGroupId);
    if (!g || !tgt || !last) continue;
    const pt  = portXY(tgt, 't');
    const pb  = portXY(tgt, 'b');
    const a   = portXY(last, 'r');
    const dt  = Math.hypot(a.x - pt.x, a.y - pt.y);
    const db  = Math.hypot(a.x - pb.x, a.y - pb.y);
    const bPt = dt <= db ? 't' : 'b';
    const d   = routePath(last, 'r', tgt, bPt);
    const sel    = S.sel?.kind === 'merge' && S.sel.id === m.id;
    const stroke = sel ? '#f59e0b' : '#475569';
    const sw     = sel ? 2.5 : 1.8;
    h += `<g class="mg" data-mid="${m.id}" style="cursor:pointer">
      <path d="${d}" fill="none" stroke="transparent" stroke-width="14"/>
      <path d="${d}" fill="none" stroke="${stroke}" stroke-width="${sw}"/>
    </g>`;
  }
  document.getElementById('ML').innerHTML = h;
  document.querySelectorAll('.mg').forEach(el => {
    el.addEventListener('click', ev => {
      ev.stopPropagation();
      S.sel = { kind:'merge', id:el.dataset.mid };
      redraw();
    });
  });
}

function renderEdges() {
  let h = '';
  for (const e of S.edges) {
    const fn = N(e.from), tn = N(e.to); if (!fn || !tn) continue;
    // ゴーストドラッグ中も元位置のエッジはそのまま表示する
    const d      = routePath(fn, e.fromPort, tn, e.toPort);
    const sel    = S.sel?.kind === 'edge' && S.sel.id === e.id;
    const hidden = e.hidden && !sel && !showHiddenWire;
    const stroke = sel ? '#f59e0b' : (hidden ? 'transparent' : (e.hidden ? '#94a3b8' : '#475569'));
    const sw     = sel ? 2.5 : 1.8;
    const dash   = e.hidden && (sel || showHiddenWire) ? '6,4' : 'none';
    h += `<g class="eg" data-eid="${e.id}" data-hidden-wire="${e.hidden ? '1' : '0'}" style="cursor:pointer">
      <path d="${d}" fill="none" stroke="transparent" stroke-width="14"/>
      <path d="${d}" fill="none" stroke="${stroke}" stroke-width="${sw}" stroke-dasharray="${dash}"/>
    </g>`;
  }
  document.getElementById('EL').innerHTML = h;
}

// ── バッジ SVG ──────────────────────────────────
// badgeOffsets:      {badgeId:{dx,dy}} デフォルト位置からのオフセット(px)
// badgeBorders:      {badgeId:boolean} false のとき枠線なし
// badgeColors:       {badgeId:string}  カスタムカラー（null=デフォルト）
// badgeColorEnabled: {badgeId:boolean} false のとき無色（グレー表示）
// unit,unitQty:      'unit'システムバッジのコンテンツ
// comment:           'comment'システムバッジのコンテンツ
// isPreview:         true のときDnD用の data-bid・透明ヒットエリアを付与

// 状態バッジIDセット（チャート描画・モーダルで参照）
const STATUS_BADGE_IDS = new Set(['important','quality','kaizen','auto','outsource','pokayoke']);

/**
 * バッジSVGを描画する。
 * ・状態バッジ（max1）→ ラベルボックス上方がデフォルト位置
 * ・unit / comment   → 記号下方がデフォルト位置（unit上・comment下）
 * badgeOffsets によりデフォルト位置からの相対移動が可能（プレビュー・チャート共通）
 */
function _badgeLabelSVG(badges, r, bottomY,
    badgeOffsets, badgeBorders, badgeColors, badgeColorEnabled,
    isPreview, unit, unitQty, comment) {
  if (!badges || !badges.length) return '';

  const CHAR_W = 9, PAD = 22, PILL_H = 14, GAP = 2;
  const COMMENT_LINE_H = 10, COMMENT_PAD_V = 4, COMMENT_MAX_LINES = 6, COMMENT_MAX_CHARS = 18;

  const statusBids = badges.filter(bid => STATUS_BADGE_IDS.has(bid));
  const unitOn     = badges.includes('unit');
  const commentOn  = badges.includes('comment');

  // デフォルトY位置
  const totalStatusH = statusBids.length * (PILL_H + GAP);
  const statusStartY = LABEL_BOX_TOP - totalStatusH - 2;
  const sysBaseY     = (bottomY || (r + 22)) + 2;
  const unitY        = sysBaseY;
  const commentY     = sysBaseY + (unitOn ? PILL_H + GAP : 0);

  let svg = '';

  /** コメントバッジ: 改行対応・動的高さ */
  const renderCommentPill = (b, defaultY) => {
    const { color, bg } = getEffBadgeColors(b, badgeColors, badgeColorEnabled);
    const off = (badgeOffsets || {})[b.id] || { dx: 0, dy: 0 };
    const sw  = (badgeBorders || {})[b.id] !== false ? 0.9 : 0;

    let lines = ['コメント'];
    if (comment && comment.trim()) {
      const rawLines = comment.trim().split('\n');
      lines = rawLines.slice(0, COMMENT_MAX_LINES).map(l => {
        const t = l.trim();
        return t.length > COMMENT_MAX_CHARS ? t.slice(0, COMMENT_MAX_CHARS - 1) + '…' : (t || '　');
      });
    }
    const nLines = lines.length;
    const pillH  = COMMENT_PAD_V * 2 + COMMENT_LINE_H * nLines;
    const maxLen = Math.max(...lines.map(l => l.length), 4);
    const pw  = Math.ceil(maxLen * CHAR_W) + PAD;
    const bx  = -pw / 2;
    const by  = defaultY;
    const rx  = 5; // pill の角丸（multiline は四角に近い形状）
    const ty0 = by + COMMENT_PAD_V + COMMENT_LINE_H * 0.82; // 1行目のテキスト基準Y

    const tspans = lines.map((l, i) =>
      `<tspan x="0" ${i > 0 ? `dy="${COMMENT_LINE_H}"` : ''}>${esc(l)}</tspan>`
    ).join('');

    if (isPreview) {
      return `<g class="preview-badge" data-bid="${b.id}" transform="translate(${off.dx},${off.dy})" style="cursor:grab">
        <rect x="${bx-6}" y="${by-4}" width="${pw+12}" height="${pillH+8}"
              rx="${rx+3}" fill="transparent" stroke="none" pointer-events="all"/>
        <rect class="preview-badge-pill" x="${bx}" y="${by}" width="${pw}" height="${pillH}"
              rx="${rx}" fill="${bg}" stroke="${color}" stroke-width="${sw}"/>
        <text x="0" y="${ty0}" text-anchor="middle"
          font-family="'Noto Sans JP',sans-serif" font-size="8" font-weight="700"
          fill="${color}" pointer-events="none">${tspans}</text>
      </g>`;
    } else {
      return `<g transform="translate(${off.dx},${off.dy})">
        <rect x="${bx}" y="${by}" width="${pw}" height="${pillH}"
              rx="${rx}" fill="${bg}" stroke="${color}" stroke-width="${sw}"/>
        <text x="0" y="${ty0}" text-anchor="middle"
          font-family="'Noto Sans JP',sans-serif" font-size="8" font-weight="700"
          fill="${color}" pointer-events="none">${tspans}</text>
      </g>`;
    }
  };

  /** 通常バッジ（単行）*/
  const renderPill = (b, defaultY) => {
    let label = b.label;
    if (b.id === 'unit') {
      if (unit) label = unitQty ? `[${unitQty}${unit}]` : `[${unit}]`;
    }
    const { color, bg } = getEffBadgeColors(b, badgeColors, badgeColorEnabled);
    const pw  = Math.ceil(label.length * CHAR_W) + PAD;
    const bx  = -pw / 2;
    const by  = defaultY;
    const off = (badgeOffsets || {})[b.id] || { dx: 0, dy: 0 };
    const sw  = (badgeBorders || {})[b.id] !== false ? 0.9 : 0;

    if (isPreview) {
      return `<g class="preview-badge" data-bid="${b.id}" transform="translate(${off.dx},${off.dy})" style="cursor:grab">
        <rect x="${bx-6}" y="${by-6}" width="${pw+12}" height="${PILL_H+12}"
              rx="${(PILL_H+12)/2}" fill="transparent" stroke="none" pointer-events="all"/>
        <rect class="preview-badge-pill" x="${bx}" y="${by}" width="${pw}" height="${PILL_H}"
              rx="${PILL_H/2}" fill="${bg}" stroke="${color}" stroke-width="${sw}"/>
        <text x="0" y="${by + PILL_H*0.73}" text-anchor="middle"
          font-family="'Noto Sans JP',sans-serif" font-size="8" font-weight="700"
          fill="${color}" pointer-events="none">${esc(label)}</text>
      </g>`;
    } else {
      return `<g transform="translate(${off.dx},${off.dy})">
        <rect x="${bx}" y="${by}" width="${pw}" height="${PILL_H}"
              rx="${PILL_H/2}" fill="${bg}" stroke="${color}" stroke-width="${sw}"/>
        <text x="0" y="${by + PILL_H*0.73}" text-anchor="middle"
          font-family="'Noto Sans JP',sans-serif" font-size="8" font-weight="700"
          fill="${color}" pointer-events="none">${esc(label)}</text>
      </g>`;
    }
  };

  statusBids.forEach((bid, i) => {
    const b = BADGES.find(x => x.id === bid); if (!b) return;
    svg += renderPill(b, statusStartY + i * (PILL_H + GAP));
  });
  if (unitOn)    { const b = BADGES.find(x => x.id === 'unit');    if (b) svg += renderPill(b, unitY); }
  if (commentOn) { const b = BADGES.find(x => x.id === 'comment'); if (b) svg += renderCommentPill(b, commentY); }

  return svg;
}

// ── ノード装飾 SVG ──────────────────────────────
// badgePos パラメータは廃止（バッジ種別でデフォルト位置を自動決定）

function _nodeDecoSVG(type, label, unit, unitQty, badges, comment, r, tx,
    badgeOffsets, badgeBorders, labelBorder, labelShow, isPreview,
    badgeColors, badgeColorEnabled) {
  let svg = '';
  const sd = SYMS[type];
  const badgeArr = badges || [];

  // ① 工程名ラベルボックス（labelShow=false のとき非表示）
  if (label && labelShow !== false) {
    const bw  = Math.max(44, label.length * 7 + 24);
    const bx  = tx - bw / 2;
    const lsw = (labelBorder !== false) ? 1.2 : 0;
    // ラベルカラー: badgeColors['label'] でカスタム / badgeColorEnabled['label']=false で背景透明
    const lbEnabled = (badgeColorEnabled || {})['label'] !== false;
    const lbCustom  = (badgeColors      || {})['label'];
    const lbColor   = lbCustom || sd.color;
    const lbFill    = lbEnabled ? 'white' : 'transparent';
    svg += `<rect x="${bx}" y="${LABEL_BOX_TOP}" width="${bw}" height="${LABEL_BOX_H}" rx="4"
              fill="${lbFill}" stroke="${lbColor}" stroke-width="${lsw}" filter="url(#bsh)"/>
            <text x="${tx}" y="${LABEL_BOX_TOP + 13}" text-anchor="middle"
              font-family="'Noto Sans JP',sans-serif" font-size="10" font-weight="600"
              fill="${lbColor}">${esc(label)}</text>`;
  } else {
    const dispLabel = sd.shortName ?? sd.name;
    svg += `<text x="${tx}" y="${r + 14}" text-anchor="middle"
              font-family="'Noto Sans JP',sans-serif" font-size="10"
              fill="${sd.color}" opacity=".65" font-weight="500">${esc(dispLabel)}</text>`;
  }

  // ② バッジ（状態・unit・comment）— 種別ごとにデフォルト位置を自動計算
  const bottomY = r + (label ? 5 : 18);
  if (badgeArr.length > 0) {
    const bSvg = _badgeLabelSVG(
      badgeArr, r, bottomY,
      badgeOffsets, badgeBorders, badgeColors, badgeColorEnabled,
      isPreview, unit, unitQty, comment
    );
    if (bSvg) svg += `<g transform="translate(${tx},0)">${bSvg}</g>`;
  }

  return svg;
}

/**
 * 所属グループ名バッジ（showGroupBadge ON時のみ）。
 * 同一グループに属し配線でつながっている連続したノード群（ラン）ごとに1つだけ表示する
 * （ノード1つずつに同じラベルを繰り返すと視認性が落ちるため）。
 * 「対象記号（アイコン）を柔らかい角丸の四角で囲む枠」＋「枠の上端にまたがる小さな
 * グループ名バッジ」の組み合わせで表示する。枠はアイコン本体だけを包み、工程名ラベルや
 * 状態バッジ（自由に位置調整できるため範囲が不定）とは重ならない。
 */
function _computeGroupBadgeRuns() {
  const visited = new Set();
  const runs = [];
  for (const node of S.nodes) {
    if (!node.groupId || visited.has(node.id)) continue;
    const stack = [node.id];
    const ids = [];
    visited.add(node.id);
    while (stack.length) {
      const id = stack.pop();
      ids.push(id);
      for (const e of S.edges) {
        const nbId = e.from === id ? e.to : (e.to === id ? e.from : null);
        if (nbId == null || visited.has(nbId)) continue;
        const nb = N(nbId);
        if (nb && nb.groupId === node.groupId) { visited.add(nbId); stack.push(nbId); }
      }
    }
    runs.push({ groupId: node.groupId, nodes: ids.map(id => N(id)).filter(Boolean) });
  }
  return runs;
}

/**
 * ラン内ノードの表示全体（工程名ラベル・状態バッジの積み上げ〜アイコン本体）を包む
 * バウンディングボックスを返す。上端をノードごとの積み上げ最上部に合わせて計算するため、
 * 枠の上端は常に工程名ラベルよりさらに上に来る（枠上端に載せるバッジがラベルと衝突しない）。
 */
function _groupRunFrameBox(run) {
  let minX = Infinity, maxX = -Infinity, minTop = Infinity, maxBottom = -Infinity;
  for (const n of run.nodes) {
    const r  = SYMS[n.type].r;
    const cx = n.x + (n.type === 'unpan' ? r : 0);
    if (cx - r < minX) minX = cx - r;
    if (cx + r > maxX) maxX = cx + r;
    const statusCount = (n.badges || []).filter(bid => STATUS_BADGE_IDS.has(bid)).length;
    const top    = n.y + LABEL_BOX_TOP - statusCount * 16 - 2; // _badgeLabelSVG の statusStartY と同一式
    const bottom = n.y + r;
    if (top < minTop) minTop = top;
    if (bottom > maxBottom) maxBottom = bottom;
  }
  const padX = 30, padTop = 14, padBottom = 28;
  return {
    x: minX - padX, y: minTop - padTop,
    w: (maxX - minX) + padX * 2,
    h: (maxBottom - minTop) + padTop + padBottom,
  };
}

/** ラン全体（工程名ラベル〜アイコン）を柔らかい角丸の四角で囲う背景枠。ノードより先に描画する。 */
function _groupFrameSVG(run) {
  const g = G(run.groupId); if (!g) return '';
  const box = _groupRunFrameBox(run);
  return `<rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" rx="14"
    fill="${g.color}14" stroke="${g.color}" stroke-width="1.3" stroke-opacity=".6"
    pointer-events="none"/>`;
}

/**
 * 枠の上端にまたがる、グループ名バッジ（ドット＋テキスト）。ノードより後に描画する。
 * 幅は「文字が収まる最小幅」を下限に、枠の幅まで広げられる場合は広げる
 * （枠に対して不自然に細い帯にならないようにするため）。中身は常に中央寄せ。
 */
function _groupBadgePillSVG(run) {
  const g = G(run.groupId); if (!g) return '';
  const box = _groupRunFrameBox(run);
  const label = g.label || 'グループ';
  const textW = Math.ceil(label.length * 6.4);
  const contentW = textW + 20; // ドット＋余白込みの中身の幅
  const minPw = contentW + 22;
  const pw = Math.max(minPw, box.w);
  const ph = 14;
  const bx = box.x + box.w / 2 - pw / 2;
  const by = box.y - ph / 2; // 枠の上端線にまたがるように配置
  const dotCx = pw / 2 - contentW / 2 + 3;
  const textX = pw / 2 - contentW / 2 + 14;

  return `<g pointer-events="none" transform="translate(${bx},${by})">
    <rect x="0" y="0" width="${pw}" height="${ph}" rx="7" fill="white" stroke="${g.color}" stroke-width="1" filter="url(#bsh)"/>
    <circle cx="${dotCx}" cy="7" r="3" fill="${g.color}"/>
    <text x="${textX}" y="10.3" font-family="'Noto Sans JP',sans-serif" font-size="8.5" font-weight="700"
      fill="${g.color}">${esc(label)}</text>
  </g>`;
}

function renderNodes() {
  const nums = showNums ? computeNums() : {};
  const badgeRuns = showGroupBadge ? _computeGroupBadgeRuns() : [];
  let h = '';
  // グループ枠はアイコンより先に描画し、背景として記号を柔らかく囲う
  for (const run of badgeRuns) h += _groupFrameSVG(run);
  for (const node of S.nodes) {
    const sd  = SYMS[node.type], r = sd.r;
    const sel = S.sel?.kind === 'node' && S.sel.id === node.id;
    const num = isNumType(node.type) ? nums[node.id] ?? null : null;
    const tx  = node.type === 'unpan' ? r : 0;
    // ゴーストドラッグ中は元ノードを半透明化
    const isGhostSrc = (typeof IA !== 'undefined' && IA?.kind === 'move' && IA.moved && IA.id === node.id && !IA.freeMove);

    h += `<g class="ng${isGhostSrc ? ' node-dragging-src' : ''}" data-nid="${node.id}" transform="translate(${node.x},${node.y})" style="cursor:move">`;

    const inMulti = S.sel?.kind === 'multi' && S.sel.ids.includes(node.id);
    const selCx   = node.type === 'unpan' ? r : 0;
    if (sel)     h += `<circle cx="${selCx}" r="${r+9}" fill="rgba(37,99,235,.07)" stroke="var(--acc)" stroke-width="1.5" stroke-dasharray="4,3"/>`;
    if (inMulti) h += `<circle cx="${selCx}" r="${r+9}" fill="rgba(37,99,235,.05)" stroke="var(--acc)" stroke-width="1.5" stroke-dasharray="4,3"/>`;

    h += drawSym(node.type, 0, 0, showNums ? num : null);

    h += _nodeDecoSVG(
      node.type, node.label || '', node.unit || '', node.unitQty || '',
      node.badges || [],
      node.comment || '', r, tx,
      node.badgeOffsets      || {},
      node.badgeBorders      || {},
      node.labelBorder,
      node.labelShow,          // false のとき工程名非表示
      false,                   // isPreview = false
      node.badgeColors       || {},
      node.badgeColorEnabled || {}
    );

    // バッジ指示ドット: 削除（バッジピルラベルで識別するため不要）

    if (graphErrors[node.id]) {
      const msgs  = graphErrors[node.id].join('&#10;');
      const errOx = node.type === 'unpan' ? 2 * r : r;
      h += `<g class="err-badge" transform="translate(${errOx},${-r})">
              <circle cx="0" cy="0" r="9" fill="#ef4444" stroke="#fff" stroke-width="1.5"/>
              <text x="0" y="3.5" text-anchor="middle" font-size="11" font-weight="bold"
                fill="#fff" font-family="sans-serif">!</text>
              <title>${msgs}</title>
            </g>`;
    }

    const phOutX = node.type === 'unpan' ? r * 2 : r;
    h += `<circle class="ph ph-out" cx="${phOutX}" cy="0" r="7"
        fill="var(--acc)" stroke="white" stroke-width="2"
        data-nid="${node.id}" data-pt="r"
        style="cursor:crosshair;opacity:0;transition:opacity .1s"/>`;

    if (!isBase(node.type)) {
      const inPorts = node.type === 'unpan'
        ? [['l', 0, 0], ['t', r, -r], ['b', r, r]]
        : [['l', -r, 0], ['t', 0, -r], ['b', 0, r]];
      for (const [pt, dx, dy] of inPorts) {
        h += `<circle class="ph ph-in" cx="${dx}" cy="${dy}" r="5"
            fill="#16a34a" stroke="white" stroke-width="1.5"
            data-nid="${node.id}" data-pt="${pt}"
            style="opacity:0;transition:opacity .1s;cursor:crosshair"/>`;
      }
    }

    h += '</g>';
  }
  // グループ名バッジは枠の上端にまたがる形で最後(最前面)に描画する
  for (const run of badgeRuns) h += _groupBadgePillSVG(run);
  document.getElementById('NL').innerHTML = h;
  bindNodeEv();
}

function bindNodeEv() {
  document.querySelectorAll('.ng').forEach(g => {
    g.addEventListener('mousedown', onNodeMD);
    g.addEventListener('mouseenter', () => g.querySelectorAll('.ph').forEach(p => p.style.opacity = '1'));
    g.addEventListener('mouseleave', () => g.querySelectorAll('.ph').forEach(p => p.style.opacity = '0'));
  });
  bindEdgeEv();
}

/**
 * .eg（配線）へのイベントバインド。renderNodes() 内の bindNodeEv() から呼ばれるほか、
 * renderEdges() 単体を呼んだ直後（redraw() を介さない軽量な再描画）にも明示的に呼び出し、
 * 再生成された要素にリスナーが確実に付くようにする必要がある
 * （renderEdges() 自体はDOMを作り直すだけでイベントは何もバインドしないため）。
 */
function bindEdgeEv() {
  document.querySelectorAll('.eg').forEach(g => g.addEventListener('mousedown', onEdgeMD));
}

function redraw() {
  syncListOrder();
  renderEdges();
  renderMerges();
  renderNodes();
  updateProps();
  updateChartLegend();
  _syncLayoutModeUI();
  _syncChartPalBar();
  if (currentView === 'list') updateListPanel();
  _scheduleLS();
}

// ── チャート凡例（加工・検査・運搬・停滞の集計）─────────────
// ドラッグでキャンバス内の任意位置へ移動でき、表示サイズ（小/中/大）も選べる。
// 位置・サイズは localStorage に保存し、操作ガイド（左下固定）とは独立して扱う。
const _LEGEND_CATS = [
  { l:'加工', k:['kako'] },
  { l:'検査', k:['kensa_q','kensa_n','kensa_qn'] },
  { l:'運搬', k:['unpan'] },
  { l:'停滞', k:['tt_s','tt_k','tt_p','tt_l'] },
];

const LEGEND_PREF_KEY = 'nps_legend_pref';
let legendSize = 'm'; // 's' | 'm' | 'l'
let _legendPos = null; // { x, y } — #cwrap 基準の左上座標。null = デフォルト位置未確定

function _loadLegendPref() {
  try {
    const raw = localStorage.getItem(LEGEND_PREF_KEY);
    if (raw) {
      const d = JSON.parse(raw);
      if (d.size === 's' || d.size === 'm' || d.size === 'l') legendSize = d.size;
      if (typeof d.x === 'number' && typeof d.y === 'number') _legendPos = { x: d.x, y: d.y };
    }
  } catch (_) {}
}

function _saveLegendPref() {
  try {
    localStorage.setItem(LEGEND_PREF_KEY, JSON.stringify({ size: legendSize, x: _legendPos?.x, y: _legendPos?.y }));
  } catch (_) {}
}

/** 凡例が #cwrap の表示範囲内に収まるよう座標をクランプする */
function _clampLegendPos(x, y) {
  const wrap = document.getElementById('cwrap');
  const el   = document.getElementById('chart-legend');
  if (!wrap || !el) return { x, y };
  const ww = wrap.clientWidth, wh = wrap.clientHeight;
  const ew = el.offsetWidth  || 160, eh = el.offsetHeight || 40;
  return {
    x: Math.max(4, Math.min(x, ww - ew - 4)),
    y: Math.max(4, Math.min(y, wh - eh - 4)),
  };
}

function _applyLegendPos() {
  const el = document.getElementById('chart-legend');
  if (!el) return;
  if (!_legendPos) {
    // デフォルト位置: キャンバス右上（左下の操作ガイドとは明確に分離）
    const wrap = document.getElementById('cwrap');
    const ew = el.offsetWidth || 200;
    _legendPos = { x: (wrap ? wrap.clientWidth : 800) - ew - 14, y: 14 };
  }
  const p = _clampLegendPos(_legendPos.x, _legendPos.y);
  el.style.left = p.x + 'px';
  el.style.top  = p.y + 'px';
}

/** 凡例の表示サイズを切り替える（S/M/L） */
function setLegendSize(size) {
  if (!['s','m','l'].includes(size)) return;
  legendSize = size;
  _saveLegendPref();
  updateChartLegend();
}

/**
 * 凡例ヘッダーをつかんでドラッグし、#cwrap 内の任意位置へ移動する。
 * updateChartLegend() は毎回 innerHTML を再構築するため、ヘッダー要素自体に
 * リスナーを付けると再描画のたびに失われる。外側コンテナ(el、再生成されない)に
 * 一度だけイベント委譲で登録する。
 */
function _initLegendDrag(el) {
  el.addEventListener('mousedown', ev => {
    const hdr = ev.target.closest('.cl-hdr');
    if (!hdr || ev.button !== 0 || ev.target.closest('.cl-size-btn')) return;
    ev.preventDefault();
    const startX = ev.clientX, startY = ev.clientY;
    const baseX  = el.offsetLeft, baseY = el.offsetTop;
    el.classList.add('cl-dragging');
    let moved = false;
    const onMove = mv => {
      moved = true;
      const p = _clampLegendPos(baseX + (mv.clientX - startX), baseY + (mv.clientY - startY));
      el.style.left = p.x + 'px';
      el.style.top  = p.y + 'px';
      _legendPos = p;
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      el.classList.remove('cl-dragging');
      if (moved) _saveLegendPref();
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  });
}

function updateChartLegend() {
  const el = document.getElementById('chart-legend');
  if (!el) return;
  if (!S.nodes.length) { el.innerHTML = ''; el.className = 'chart-legend'; return; }

  const cnt = {};
  for (const n of S.nodes) cnt[n.type] = (cnt[n.type] || 0) + 1;

  const items = _LEGEND_CATS.map(c => {
    const n = c.k.reduce((a, k) => a + (cnt[k] || 0), 0);
    const color = SYMS[c.k[0]].color;
    return `<div class="cl-item">
      <span class="cl-dot" style="background:${color}"></span>
      <span class="cl-lbl">${c.l}</span>
      <span class="cl-cnt">${n}</span>
    </div>`;
  }).join('');

  const sizeBtns = ['s','m','l'].map(sz =>
    `<button class="cl-size-btn${legendSize === sz ? ' active' : ''}" onclick="setLegendSize('${sz}')"
      title="${{s:'小',m:'中',l:'大'}[sz]}サイズ">${sz.toUpperCase()}</button>`
  ).join('');

  el.className = `chart-legend cl-size-${legendSize}`;
  el.innerHTML = `
    <div class="cl-hdr" title="ドラッグして移動">
      <i class="fa-solid fa-grip-vertical cl-grip"></i>
      <span class="cl-hdr-ttl"><i class="fa-solid fa-list-check"></i> 凡例</span>
      <div class="cl-size-btns">${sizeBtns}</div>
    </div>
    <div class="cl-body">${items}</div>`;

  if (!el.dataset.dragBound) {
    _initLegendDrag(el);
    el.dataset.dragBound = '1';
  }
  _applyLegendPos();
}

/**
 * 画像保存（PNG）・印刷用に、凡例を純SVGで生成する。
 * オンスクリーンでのドラッグ位置（#cwrap内の割合）をできるだけ再現する形で
 * 出力先ページ内の対応する位置に配置する（画面上で見えている相対位置と同じ場所に
 * 焼き込まれるように）。サイズ設定（legendSize）も反映する。
 * @param {number} vbX ページのviewBox X（ワールド座標）
 * @param {number} vbY ページのviewBox Y
 * @param {number} vbW ページのviewBox 幅
 * @param {number} vbH ページのviewBox 高さ
 */
function _legendExportSVG(vbX, vbY, vbW, vbH) {
  if (!S.nodes.length) return '';
  const cnt = {};
  for (const n of S.nodes) cnt[n.type] = (cnt[n.type] || 0) + 1;
  const cats = _LEGEND_CATS.map(c => ({
    l: c.l, color: SYMS[c.k[0]].color,
    n: c.k.reduce((a, k) => a + (cnt[k] || 0), 0),
  }));

  const scale  = { s: 0.8, m: 1, l: 1.25 }[legendSize] || 1;
  const FS     = 12 * scale;
  const HDR_FS = 9 * scale;
  const DOT    = 5 * scale;
  const ITEM_W = 84 * scale;
  const PADX   = 12 * scale, PADY = 9 * scale;
  const HDR_H  = 16 * scale;
  const ROW_H  = FS + 8 * scale;

  const boxW = PADX * 2 + ITEM_W * cats.length;
  const boxH = PADY + HDR_H + ROW_H;

  // 画面上の凡例の位置（#cwrapに対する割合）を求め、出力先ページ内の対応位置へ変換する
  const wrap = document.getElementById('cwrap');
  const legendEl = document.getElementById('chart-legend');
  let fracX = 1, fracY = 0; // 取得できない場合は右上相当にフォールバック
  if (wrap && wrap.clientWidth && wrap.clientHeight) {
    const ew = legendEl?.offsetWidth  || 200;
    const eh = legendEl?.offsetHeight || 44;
    const p  = _legendPos || { x: wrap.clientWidth - ew - 14, y: 14 };
    fracX = p.x / wrap.clientWidth;
    fracY = p.y / wrap.clientHeight;
  }
  fracX = Math.max(0, Math.min(1, fracX));
  fracY = Math.max(0, Math.min(1, fracY));

  let bx = vbX + fracX * vbW;
  let by = vbY + fracY * vbH;
  // ページ範囲からはみ出さないようクランプする
  bx = Math.max(vbX + 4, Math.min(bx, vbX + vbW - boxW - 4));
  by = Math.max(vbY + 4, Math.min(by, vbY + vbH - boxH - 4));

  let items = '';
  cats.forEach((c, i) => {
    const ix = PADX + i * ITEM_W;
    const cy = HDR_H + PADY / 2 + ROW_H / 2;
    items += `<circle cx="${ix + DOT}" cy="${cy}" r="${DOT}" fill="${c.color}"/>
      <text x="${ix + DOT * 2 + 5}" y="${cy + FS * 0.35}" font-family="'Noto Sans JP',sans-serif"
        font-size="${FS}" font-weight="600" fill="#334155">${esc(c.l)} ${c.n}</text>`;
  });

  return `<g pointer-events="none" transform="translate(${bx},${by})">
    <rect x="0" y="0" width="${boxW}" height="${boxH}" rx="9"
      fill="rgba(255,255,255,0.95)" stroke="#e2e8f0" stroke-width="1.3"/>
    <text x="${PADX}" y="${HDR_H - 3 * scale}" font-family="'Noto Sans JP',sans-serif"
      font-size="${HDR_FS}" font-weight="700" fill="#64748b" letter-spacing="0.6">凡例</text>
    ${items}
  </g>`;
}

// ── プレビュー SVG（モーダル用）─────────────────

function buildNodePreviewSVG({ type, label, unit, unitQty, badges, comment,
    badgeOffsets, badgeBorders, badgeColors, badgeColorEnabled, labelBorder, labelShow }) {
  const sd = SYMS[type] || SYMS['kako'];
  const r  = sd.r;
  const tx = type === 'unpan' ? r : 0;

  // ── 動的 viewBox 計算 ──────────────────────────
  const PILL_H = 14, GAP = 2;
  const badgeArr    = badges || [];
  const statusBids  = badgeArr.filter(bid => STATUS_BADGE_IDS.has(bid));
  const hasComment  = badgeArr.includes('comment');
  const hasUnit     = badgeArr.includes('unit');

  // 上方向追加: ステータスバッジが多い場合
  const totalStatusH = statusBids.length * (PILL_H + GAP);
  const statusStartY = LABEL_BOX_TOP - totalStatusH - 2; // LABEL_BOX_TOP = -54
  const extraTop = Math.max(0, (-100 - statusStartY)); // -100 = デフォルトvbY

  // 下方向追加: コメント複数行
  let commentH = PILL_H;
  if (hasComment && comment && comment.trim()) {
    const nLines = Math.min(comment.trim().split('\n').length, 6);
    commentH = 4 * 2 + nLines * 10; // COMMENT_PAD_V*2 + COMMENT_LINE_H*n
  }
  const showLabel   = label && labelShow !== false;
  const bottomY     = r + (showLabel ? 5 : 18);
  const sysBottom   = bottomY + 2 + (hasUnit ? PILL_H + GAP : 0) + (hasComment ? commentH + GAP : 0);
  const extraBottom = Math.max(0, sysBottom - 88); // 88 = デフォルト下端 (-100+200-12)

  const vbW = 240;
  const vbH = 210 + extraTop + extraBottom;
  const vbX = -vbW / 2;
  const vbY = -100 - extraTop;

  let inner = `<g>`;
  inner += drawSym(type, 0, 0, null);
  inner += _nodeDecoSVG(type, label, unit, unitQty, badges, comment, r, tx,
    badgeOffsets      || {},
    badgeBorders      || {},
    labelBorder,
    labelShow,           // false のとき工程名非表示
    true,                // isPreview = true
    badgeColors       || {},
    badgeColorEnabled || {}
  );
  inner += `</g>`;

  return `<svg width="${vbW}" height="${vbH}" viewBox="${vbX} ${vbY} ${vbW} ${vbH}"
    xmlns="http://www.w3.org/2000/svg" style="display:block;max-width:100%;max-height:100%;">
    <defs>
      <filter id="bsh" x="-30%" y="-30%" width="160%" height="160%">
        <feDropShadow dx="0" dy="1" stdDeviation="1.5" flood-opacity="0.1"/>
      </filter>
      <filter id="badge-drag-glow" x="-80%" y="-80%" width="260%" height="260%">
        <feDropShadow dx="0" dy="0" stdDeviation="4" flood-color="#6366f1" flood-opacity="0.55"/>
      </filter>
    </defs>
    ${inner}
  </svg>`;
}

// ── プロパティパネル ─────────────────────────────

function updateMeta(k, v) { S.meta[k] = v; }

function syncLabel(nid, val) {
  const n = N(nid); if (!n) return;
  n.label = val;
  // redraw() はリスト表示中に updateListPanel() でリストDOMを再構築するため、
  // インライン編集の入力欄が1文字目で破棄されフォーカスが外れてしまう。
  // 入力中はチャート描画とプロパティ表示のみ更新し、リスト行の再構築は
  // 編集確定（blur/Enter）時に行う。
  renderNodes();
  updateProps();
  _scheduleLS();
}

function updateNP(nid, f, v) {
  const n = N(nid); if (!n) return;
  n[f] = v;
}

function getStatsHTML() {
  const cnt = {};
  for (const k of Object.keys(SYMS)) cnt[k] = 0;
  for (const n of S.nodes) cnt[n.type] = (cnt[n.type] || 0) + 1;

  let va = 0, nva = 0;
  for (const [t, c] of Object.entries(cnt)) {
    if (SYMS[t].cat === 'va')  va  += c;
    if (SYMS[t].cat === 'nva') nva += c;
  }
  const tot = va + nva, pct = tot ? Math.round(va / tot * 100) : 0;

  const gs = [
    { l:'加工', k:['kako'],                         cls:'gn' },
    { l:'検査', k:['kensa_q','kensa_n','kensa_qn'], cls:'gn' },
    { l:'運搬', k:['unpan'],                         cls:'pk' },
    { l:'停滞', k:['tt_s','tt_k','tt_p','tt_l'],    cls:'rd' },
  ];
  const grid = gs.map(g => {
    const n = g.k.reduce((a, k) => a + (cnt[k] || 0), 0);
    return `<div class="stcard ${g.cls}"><div class="stn">${n}</div><div class="stl">${g.l}</div></div>`;
  }).join('');

  return `
    <div class="stgrid">${grid}</div>
    <div class="vabar-hd"><span>付加価値率</span><b style="color:#16a34a">${pct}%</b></div>
    <div class="vabar-bg"><div class="vabar-fg" style="width:${pct}%"></div></div>
    <div class="vabar-ft"><span>付加価値: ${va}</span><span>非付加価値: ${nva}</span></div>
  `;
}

function updateProps() {
  const pc = document.getElementById('prc');

  let selHtml = '';
  if (S.sel) {
    if (S.sel.kind === 'node') {
      const node = N(S.sel.id);
      if (node) {
        const sd = SYMS[node.type];
        const badgesHTML = (node.badges && node.badges.length)
          ? `<div class="rp-badges">
              ${node.badges.map(bid => {
                const b = BADGES.find(x => x.id === bid);
                return b ? `<span class="rp-badge" style="background:${b.bg};color:${b.color};border-color:${b.color}40">${b.label}</span>` : '';
              }).join('')}
            </div>` : '';
        const metaRows = [
          node.unit    && `<div class="rp-meta-row"><i class="fa-solid fa-box rp-meta-ico"></i><span>${esc(node.unit)}${node.unitQty ? ' × '+node.unitQty : ''}</span></div>`,
          node.comment && `<div class="rp-meta-row rp-meta-comment"><i class="fa-regular fa-comment-dots rp-meta-ico"></i><span>${esc(node.comment)}</span></div>`,
        ].filter(Boolean).join('');
        // ── 所属グループ表示（クリックで所属先を変更） ──
        const grp = node.groupId ? G(node.groupId) : null;
        const grpHtml = `
          <button class="rp-grp-row" style="${grp ? `border-color:${grp.color}40;background:${grp.color}0f;` : ''}"
            onclick="openGroupPop('${node.id}',this)" title="クリックしてグループを変更">
            <span class="rp-grp-dot" style="background:${grp ? grp.color : '#cbd5e1'}"></span>
            <span class="rp-grp-lbl" style="${grp ? `color:${grp.color}` : ''}">${grp ? esc(grp.label) : 'グループなし'}</span>
            <i class="fa-solid fa-chevron-down rp-grp-chv"></i>
          </button>`;
        selHtml = `
          <div class="p-sec rp-sel-sec" style="border-left:3px solid ${sd.color};">
            <div class="p-sec-ttl">
              <i class="fa-solid fa-circle-dot" style="color:${sd.color}"></i> 選択中の工程
            </div>
            <div class="rp-sel-head">
              <div class="pbdg" style="background:${sd.color}14;color:${sd.color};border-color:${sd.color}40;">
                ${palIcoSVG(node.type, 20)} ${sd.name}
              </div>
            </div>
            <p class="rp-sel-label">${esc(node.label || '（工程名未設定）')}</p>
            ${badgesHTML}
            ${grpHtml}
            ${metaRows ? `<div class="rp-meta">${metaRows}</div>` : ''}
            <div style="display:flex;gap:7px;margin-top:10px;">
              <button class="btn bp" style="flex:1;font-size:11px;padding:6px;"
                onclick="openModal('${node.id}')">
                <i class="fa-solid fa-pen-to-square"></i> 編集
              </button>
              <button class="btn bg-w" style="flex:1;font-size:11px;padding:6px;"
                onclick="duplicateNode('${node.id}')" title="この工程を複製">
                <i class="fa-solid fa-copy"></i> 複製
              </button>
              <button class="btn bg-w" style="flex:1;font-size:11px;padding:6px;color:#dc2626;border-color:#fecaca;"
                onclick="deleteSel()">
                <i class="fa-solid fa-trash-can"></i> 削除
              </button>
            </div>
            ${grp ? `
            <button class="btn bg-w" style="width:100%;font-size:11px;padding:6px;margin-top:6px;"
              onclick="duplicateGroup('${grp.id}')" title="所属グループ全体（起点含む）を複製">
              <i class="fa-solid fa-clone"></i> グループ「${esc(grp.label)}」を複製
            </button>` : ''}
          </div>`;
      }
    } else {
      const edge = E(S.sel.id);
      if (edge) {
        selHtml = `
          <div class="p-sec rp-sel-sec" style="border-left:3px solid #f59e0b;">
            <div class="p-sec-ttl">
              <i class="fa-solid fa-arrow-right-arrow-left" style="color:#d97706"></i> 選択中の接続線
            </div>
            <button class="btn bg-w"
              style="width:100%;font-size:11px;color:#dc2626;border-color:#fecaca;"
              onclick="deleteSel()">
              <i class="fa-solid fa-trash-can"></i> 接続を削除
            </button>
          </div>`;
      }
    }
  }

  const kpiHtml = `
    <div class="p-sec">
      <div class="p-sec-ttl"><i class="fa-solid fa-chart-bar"></i> 工程集計 (KPI)</div>
      ${getStatsHTML()}
    </div>`;

  const metaHtml = `
    <div class="p-sec">
      <div class="p-sec-ttl"><i class="fa-solid fa-file-lines"></i> 図面基礎情報</div>
      <div class="plbl">品番</div>
      <input class="pinp" value="${esc(S.meta.hb)}" placeholder="例: AL-1234" oninput="updateMeta('hb',this.value)">
      <div class="plbl">品名</div>
      <input class="pinp" value="${esc(S.meta.hm)}" placeholder="例: アルミコイル" oninput="updateMeta('hm',this.value)">
      <div class="plbl">作成者</div>
      <input class="pinp" value="${esc(S.meta.sk)}" placeholder="氏名" oninput="updateMeta('sk',this.value)">
      <div class="plbl">作成日</div>
      <input class="pinp" type="date" value="${esc(S.meta.dt)}" oninput="updateMeta('dt',this.value)">
    </div>`;

  pc.innerHTML = selHtml + kpiHtml + metaHtml;
}
