'use strict';

// ═══════════════════════════════════════════════
// CORE — 定数 / 状態 / Undo・Redo / ワークスペース
// ═══════════════════════════════════════════════

/** アプリバージョン（セマンティックバージョニング）。更新時は CHANGELOG.md も更新すること。 */
const APP_VERSION = '1.13.2';

const C = 20;

const isBase    = t => t === 'naisei' || t === 'gaisei';
const isNumType = t => t === 'kako'   || t.startsWith('kensa');

const GROUP_COLORS =[
  '#6366f1','#0891b2','#16a34a','#d97706','#dc2626',
  '#7c3aed','#db2777','#0284c7','#059669','#92400e',
];

const BADGES =[
  { id:'important', label:'重要工程',    color:'#dc2626', bg:'#fef2f2' },
  { id:'quality',   label:'品質チェック',color:'#16a34a', bg:'#f0fdf4' },
  { id:'kaizen',    label:'改善候補',    color:'#d97706', bg:'#fffbeb' },
  { id:'auto',      label:'自動化',      color:'#7c3aed', bg:'#f5f3ff' },
  { id:'outsource', label:'外注工程',    color:'#0891b2', bg:'#ecfeff' },
  { id:'pokayoke',  label:'ポカヨケ有',  color:'#db2777', bg:'#fdf2f8' },
  { id:'unit',      label:'流す単位',    color:'#475569', bg:'#f1f5f9', isSystem:true },
  { id:'comment',   label:'コメント',    color:'#374151', bg:'#f9fafb', isSystem:true },
];

function _hexToLightBg(hex) {
  if (!hex || hex.length < 7) return '#f8fafc';
  try {
    const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
    return `rgba(${r},${g},${b},0.1)`;
  } catch { return '#f8fafc'; }
}

function getEffBadgeColors(b, badgeColors, badgeColorEnabled) {
  const custom  = (badgeColors       || {})[b.id];
  const color   = custom || b.color;
  const enabled = (badgeColorEnabled || {})[b.id] !== false;
  const bg      = enabled ? (custom ? _hexToLightBg(custom) : b.bg) : 'transparent';
  return { color, bg };
}

const SYMS = {
  naisei:  { name:'内製',             desc:'自社で製造する工程の起点',                      grp:'kiten',  r:30, color:'#334155', cat:'base' },
  gaisei:  { name:'外製',             desc:'外注または購買品の工程起点',                    grp:'kiten',  r:30, color:'#334155', cat:'base' },
  kako: {
    name:'加工', desc:'対象物に意図的な変化を加える作業',
    detail:'「変質」「変形」「組立」「分解」の4種類に大別される付加価値作業。',
    subItems:[
      { lbl:'変質', ex:'焼き入れ、溶解、攪拌（混ぜる）' },
      { lbl:'変形', ex:'伸ばす、圧縮、曲げ、ねじる、切断、切削' },
      { lbl:'組立', ex:'組み立てる、混合（合わせる）' },
      { lbl:'分解', ex:'外す、緩める、分ける' },
    ],
    grp:'kako', r:20, color:'#16a34a', cat:'va',
  },
  kensa_q:  { name:'検査（質）',        shortName:'質',        desc:'品質特性を標準と比較して判定する',         grp:'kensa', r:20, color:'#2563eb', cat:'va'  },
  kensa_n:  { name:'検査（量）',        shortName:'量',        desc:'数量・重量などを標準と比較して判定する',   grp:'kensa', r:20, color:'#2563eb', cat:'va'  },
  kensa_qn: { name:'検査（質と量）',    shortName:'質と量',    desc:'品質と数量を同時に標準と比較して判定する', grp:'kensa', r:20, color:'#2563eb', cat:'va'  },
  unpan:    { name:'運搬',                                     desc:'物の位置が変化する状態',                   grp:'unpan',  r:10, color:'#ec4899', cat:'nva' },
  tt_s:     { name:'停滞（素材置場）',  shortName:'素材置場',  desc:'物の位置が変わらず時間だけが経過する状態', grp:'taitai', r:20, color:'#dc2626', cat:'nva' },
  tt_k:     { name:'停滞（完成品置場）',shortName:'完成品置場',desc:'物の位置が変わらず時間だけが経過する状態', grp:'taitai', r:20, color:'#dc2626', cat:'nva' },
  tt_p:     { name:'停滞（工程待ち）',  shortName:'工程待ち',  desc:'物の位置が変わらず時間だけが経過する状態', grp:'taitai', r:20, color:'#dc2626', cat:'nva' },
  tt_l:     { name:'停滞（ロット待ち）',shortName:'ロット待ち',desc:'物の位置が変わらず時間だけが経過する状態', grp:'taitai', r:20, color:'#dc2626', cat:'nva' },
};

const GROUPS =[
  { id:'kiten',  col:'bk', label:'起点',  sub:'素材の起点',   types:['naisei','gaisei']              },
  { id:'kako',   col:'gr', label:'加工',  sub:'付加価値',     types:['kako']                         },
  { id:'kensa',  col:'bl', label:'検査',  sub:'付加価値',     types:['kensa_q','kensa_n','kensa_qn'] },
  { id:'unpan',  col:'pk', label:'運搬',  sub:'非付加価値',   types:['unpan']                        },
  { id:'taitai', col:'rd', label:'停滞',  sub:'非付加価値',   types:['tt_s','tt_k','tt_p','tt_l']    },
];

// ── アプリケーション状態 ────────────────────────

const S = {
  meta:            { hb:'', hm:'', sk:'', dt: new Date().toISOString().split('T')[0] },
  nodes:[],
  edges:[],
  groups:[],
  sel:             null,
  vp:              { tx:400, ty:300, scale:1 },
  listOrder:[],
  merges:[],
  backboneGroupId: null,  // null = 一番長いライン（メインライン）を自動採用
  _undo:[],
  _redo:[],
};

let _uid = 1;
const uid = () => 'u' + (_uid++);

const N = id => S.nodes.find(n => n.id === id);
const E = id => S.edges.find(e => e.id === id);
const G = id => S.groups.find(g => g.id === id);

const snapV = v      => Math.round(v / C) * C;
const snapP = (x, y) => ({ x: snapV(x), y: snapV(y) });

let showNums       = true;
let showHiddenWire = false; // true: 起点(内製/外製)直後などの非表示配線を作成中に可視化する
let moveOnlyMode   = false; // true: ドラッグ移動時に配線の組み替え（挿入/抜き取り）を行わず位置だけ変更する
let showGroupBadge = true; // true: チャート上の工程記号に所属グループ名バッジを表示する
let currentView    = 'chart';
let graphErrors    = {};

function esc(s) {
  return String(s || '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function setStatus(t) {
  document.getElementById('stxt').textContent = t;
}

/** ステータスバーに加え、見落としにくいトースト通知を出す（接続不可などのエラー用） */
function showToast(msg, kind) {
  setStatus(msg);
  const host = document.getElementById('toast-host'); if (!host) return;
  const el = document.createElement('div');
  el.className = `toast toast-${kind === 'warn' ? 'warn' : 'error'}`;
  const icon = kind === 'warn' ? 'triangle-exclamation' : 'circle-exclamation';
  el.innerHTML = `<i class="fa-solid fa-${icon}"></i><span>${esc(msg)}</span>`;
  host.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 200);
  }, 2800);
}

// ── Undo / Redo ─────────────────────────────────

function ss() {
  return {
    meta:            JSON.parse(JSON.stringify(S.meta)),
    nodes:           JSON.parse(JSON.stringify(S.nodes)),
    edges:           JSON.parse(JSON.stringify(S.edges)),
    groups:          JSON.parse(JSON.stringify(S.groups ||[])),
    listOrder:[...S.listOrder],
    backboneGroupId: S.backboneGroupId || null,
  };
}

function pushUndo() {
  graphErrors = {};
  S._undo.push(ss());
  if (S._undo.length > 100) S._undo.shift();
  S._redo =[];
  rUB();
}

function undo() {
  if (!S._undo.length) return;
  S._redo.push(ss());
  applyState(S._undo.pop());
  rUB();
}

function redo() {
  if (!S._redo.length) return;
  S._undo.push(ss());
  applyState(S._redo.pop());
  rUB();
}

function applyState(s) {
  S.meta            = s.meta      || S.meta;
  S.nodes           = s.nodes;
  S.edges           = s.edges;
  S.groups          = s.groups    ||[];
  S.listOrder       = s.listOrder ||[];
  S.backboneGroupId = s.backboneGroupId || null;
  S.sel             = null;
  graphErrors       = {};
  redraw();
}

function rUB() {
  document.getElementById('bundo').disabled = !S._undo.length;
  document.getElementById('bredo').disabled = !S._redo.length;
}

// ═══════════════════════════════════════════════
// ワークスペース — 複数工程図管理
// ═══════════════════════════════════════════════

const W = {
  charts:   [],   //[{ id, name, backboneGroupId, meta, nodes, edges, groups, merges, listOrder }]
  activeId: null,
};

function getActiveChartName() {
  const c = W.charts.find(x => x.id === W.activeId);
  return c ? c.name : '工程図';
}

/**
 * 一番長いライン（＝メインライン）のグループIDを返す。
 * 「長さ」は通し番号の対象となる加工・検査記号の数で判定し、
 * 同数の場合は所属ノード総数 → グループ定義順で決定する。
 */
function findLongestLineGroupId(nodes, groups) {
  if (!groups || !groups.length) return null;
  let bestId = groups[0].id, bestNum = -1, bestLen = -1;
  for (const g of groups) {
    const members = (nodes || []).filter(n => n.groupId === g.id);
    const numCnt  = members.filter(n => isNumType(n.type)).length;
    if (numCnt > bestNum || (numCnt === bestNum && members.length > bestLen)) {
      bestId = g.id; bestNum = numCnt; bestLen = members.length;
    }
  }
  return bestId;
}

/**
 * 有効な背骨グループIDを返す。
 * S.backboneGroupId が設定済みで実在するグループなら採用、
 * そうでなければ一番長いライン（メインライン）を自動採用。
 */
function getBackboneGroupId() {
  const bid = S.backboneGroupId;
  if (bid && G(bid)) return bid;
  return findLongestLineGroupId(S.nodes, S.groups || []);
}

/** 背骨グループの通し番号付きノードを順序どおりに返す */
function getBackboneNodes() {
  const gid = getBackboneGroupId();
  if (!gid) return[];
  const nums = computeNums();
  return S.listOrder
    .map(id => N(id))
    .filter(n => n && n.groupId === gid && isNumType(n.type))
    .map(n => ({ ...n, seq: nums[n.id] ?? null }));
}

/**
 * アクティブ工程図の S 状態を W.charts に同期する。
 * chart.impVariants が存在する場合は現在の improvementMode のバリアントに保存。
 * meta はバリアント共通のチャートレベルで管理。
 */
function syncActiveChart() {
  if (!W.activeId) return;
  const idx = W.charts.findIndex(c => c.id === W.activeId);
  if (idx < 0) return;
  const chart = W.charts[idx];
  const variantData = {
    nodes:           JSON.parse(JSON.stringify(S.nodes)),
    edges:           JSON.parse(JSON.stringify(S.edges)),
    groups:          JSON.parse(JSON.stringify(S.groups ||[])),
    merges:          JSON.parse(JSON.stringify(S.merges ||[])),
    listOrder:       [...S.listOrder],
    backboneGroupId: S.backboneGroupId || null,
  };
  if (chart.impVariants) {
    // バリアントを持つ場合：現在モードのバリアントを更新、meta はチャート共通
    chart.impVariants[improvementMode] = variantData;
    W.charts[idx] = { ...chart, meta: JSON.parse(JSON.stringify(S.meta)) };
  } else {
    // 通常チャート：従来どおりメインデータを更新
    W.charts[idx] = {
      ...chart,
      meta: JSON.parse(JSON.stringify(S.meta)),
      ...variantData,
    };
  }
}

/**
 * チャートデータを S にロードする。
 * chart.impVariants が存在する場合は improvementMode に対応するバリアントを優先使用。
 * バリアントがない場合はチャートのメインデータをそのまま使用（後方互換）。
 */
function loadChartIntoS(chart) {
  const v    = chart.impVariants?.[improvementMode]; // 改善前/後バリアント
  const base = v || chart;                           // バリアントなければメインデータ
  S.meta            = chart.meta || { hb:'', hm:'', sk:'', dt: new Date().toISOString().split('T')[0] };
  S.nodes           = (base.nodes ||[]).map(n => ({
    listParentIds:[], badgeOffsets:{}, badgeBorders:{}, badgeColors:{}, badgeColorEnabled:{}, ...n
  }));
  S.edges           = base.edges           ||[];
  S.groups          = base.groups          ||[];
  S.merges          = base.merges          ||[];
  S.listOrder       = base.listOrder       ||[];
  S.backboneGroupId = (v ? v.backboneGroupId : null) ?? chart.backboneGroupId ?? null;
  S.sel             = null;
  S._undo           =[];
  S._redo           =[];
  graphErrors       = {};
}

/**
 * chart の現在 improvementMode に対応するデータスナップショットを返す。
 * impVariants を持つ場合は対応バリアントを、持たない場合はメインデータを返す。
 * 戻り値は { nodes, edges, groups, merges, listOrder, backboneGroupId }。
 */
function getChartData(chart) {
  const v = chart.impVariants?.[improvementMode];
  return {
    nodes:           (v?.nodes           ?? chart.nodes           ?? []).slice(),
    edges:           (v?.edges           ?? chart.edges           ?? []).slice(),
    groups:          (v?.groups          ?? chart.groups          ?? []).slice(),
    merges:          (v?.merges          ?? chart.merges          ?? []).slice(),
    listOrder:       (v?.listOrder       ?? chart.listOrder       ?? []).slice(),
    backboneGroupId: v?.backboneGroupId  ?? chart.backboneGroupId ?? null,
  };
}

/**
 * chart の現在モードに対応するノード配列への直接参照を返す（書き込み用）。
 * バリアントがあればそのバリアントの nodes を、なければ chart.nodes を返す。
 */
function getChartNodesRef(chart) {
  const v = chart.impVariants?.[improvementMode];
  if (v) { if (!v.nodes) v.nodes = []; return v.nodes; }
  if (!chart.nodes) chart.nodes = [];
  return chart.nodes;
}

/** 新しい工程図エントリを W.charts に追加してIDを返す */
function addChartEntry(name) {
  const id = uid();
  W.charts.push({
    id, name: name || '新規工程図',
    backboneGroupId: null,
    meta:      { hb:'', hm:'', sk:'', dt: new Date().toISOString().split('T')[0] },
    nodes: [], edges:[], groups: [], merges: [], listOrder:[],
  });
  return id;
}

/** 指定した工程図に切り替える */
function switchToChart(chartId) {
  if (W.activeId === chartId) return;
  syncActiveChart();
  W.activeId = chartId;
  const chart = W.charts.find(c => c.id === chartId);
  if (!chart) return;
  loadChartIntoS(chart);
  _updateActiveChartDisplay();
  rUB(); redraw(); fitView();
  setStatus(`「${chart.name}」に切り替えました`);
}

function _updateActiveChartDisplay() {
  const el = document.getElementById('active-chart-name-display');
  if (el) el.textContent = getActiveChartName();
}

/**
 * 工程図の背骨グループを設定する。
 * gid = null の場合は自動（一番長いライン）に戻す。
 *
 * 改善前/改善後バリアント(impVariants)を持つチャートは、getChartData() が
 * 「現在モードのバリアントの backboneGroupId」を優先して読むため、そちらにも
 * 書き込まないと非アクティブチャートで設定した内容が反映されない
 * （かつては c.backboneGroupId というトップレベルの互換フィールドにしか
 * 書き込んでおらず、バリアント側の値が古いまま残って「自動」に戻せなくなる
 * 不具合があった）。
 */
function setChartBackbone(cid, gid) {
  const c = W.charts.find(x => x.id === cid); if (!c) return;
  const bid = gid || null;
  if (c.impVariants) {
    if (!c.impVariants[improvementMode]) c.impVariants[improvementMode] = {};
    c.impVariants[improvementMode].backboneGroupId = bid;
  }
  c.backboneGroupId = bid; // トップレベル（バリアントなしチャート・互換フォールバック用）
  if (cid === W.activeId) S.backboneGroupId = bid;
  saveLS();
  if (currentView === 'list')     { _updateBackboneHint(); updateListPanel(); }
  if (currentView === 'routemap') updateRouteMap();
  setStatus(gid ? '背骨グループを設定しました' : '背骨グループを自動設定に戻しました');
}

// ── 工程経路図計算 ───────────────────────────────

/**
 * 指定した工程図IDリストから工程経路図データを計算する。
 * - 各工程図の背骨グループの isNumType ノードを収集
 * - トポロジカルマージでカラム順序を決定
 * - 戻り値: { rows: [{chartId, chartName, processes:[{label,seq}]}], columns: string[] }
 */
function computeRouteMap(chartIds, groupSel) {
  // S 状態を退避（一時書き換えから確実に復元するため）
  const sv = {
    nodes: S.nodes, edges: S.edges, groups: S.groups,
    merges: S.merges, listOrder: S.listOrder, backboneGroupId: S.backboneGroupId,
  };

  const rows =[];
  for (const cid of chartIds) {
    const chart = W.charts.find(c => c.id === cid); if (!chart) continue;

    if (cid !== W.activeId) {
      // 対象工程図の現在モードデータを一時的に S に展開して computeNums を利用
      const cd = getChartData(chart);
      S.nodes           = cd.nodes;
      S.edges           = cd.edges;
      S.groups          = cd.groups;
      S.merges          = cd.merges;
      S.listOrder       = cd.listOrder;
      S.backboneGroupId = cd.backboneGroupId;
    }

    const gid  = getBackboneGroupId();
    const nums = computeNums();

    // groupSel で明示指定があればそのグループ群、なければ背骨グループのみ
    const selGroups = groupSel?.get(cid);
    const useSelGroups = selGroups && selGroups.size > 0;

    const processes = S.listOrder
      .map(id => S.nodes.find(n => n.id === id))
      .filter(n => {
        if (!n || !isNumType(n.type)) return false;
        return useSelGroups ? selGroups.has(n.groupId) : n.groupId === gid;
      })
      .map(n => ({
        label: (n.label || '').trim() || (SYMS[n.type]?.name ?? n.type),
        seq:   nums[n.id] ?? null,
      }))
      .filter(p => p.seq !== null);

    // 同じ名前の工程が複数ある場合、マージ時の循環を防ぐためサフィックスで一意にする
    const seenCount = {};
    for (const p of processes) {
      seenCount[p.label] = (seenCount[p.label] || 0) + 1;
      if (seenCount[p.label] > 1) {
        p.label = `${p.label} (${seenCount[p.label]})`;
      }
    }

    rows.push({ chartId: cid, chartName: chart.name, processes });

    if (cid !== W.activeId) {
      // 一時展開したS状態を復元
      S.nodes = sv.nodes; S.edges = sv.edges; S.groups = sv.groups;
      S.merges = sv.merges; S.listOrder = sv.listOrder; S.backboneGroupId = sv.backboneGroupId;
    }
  }

  // 念のため完全復元
  S.nodes = sv.nodes; S.edges = sv.edges; S.groups = sv.groups;
  S.merges = sv.merges; S.listOrder = sv.listOrder; S.backboneGroupId = sv.backboneGroupId;

  const columns = _mergeOrderedSequences(rows.map(r => r.processes.map(p => p.label)));
  return { rows, columns };
}

/**
 * 複数の順序付きシーケンスをトポロジカルマージして列順序を決定する。
 * 順序制約が矛盾する場合（循環）は残余を末尾に追加する。
 */
function _mergeOrderedSequences(sequences) {
  const allLabels =[...new Set(sequences.flat())];
  if (!allLabels.length) return[];

  const adj   = new Map(allLabels.map(l => [l, new Set()]));
  const indeg = new Map(allLabels.map(l => [l, 0]));

  for (const seq of sequences) {
    for (let i = 0; i < seq.length - 1; i++) {
      const a = seq[i], b = seq[i + 1];
      if (a !== b && !adj.get(a)?.has(b)) {
        adj.get(a)?.add(b);
        indeg.set(b, (indeg.get(b) || 0) + 1);
      }
    }
  }

  const queue  = allLabels.filter(l => !indeg.get(l));
  const result =[];
  while (queue.length) {
    const l = queue.shift();
    result.push(l);
    for (const next of (adj.get(l) ||[])) {
      const d = (indeg.get(next) || 1) - 1;
      indeg.set(next, d);
      if (d === 0) queue.push(next);
    }
  }
  for (const l of allLabels) if (!result.includes(l)) result.push(l);
  return result;
}

/**
 * 工程経路図を複数テーブルに分割して計算する。
 *
 * allGroups=false（デフォルト）: computeRouteMap と同一の結果を1テーブルとして返す。
 * allGroups=true: 各チャートの全選択グループを(chartId×groupId)行として処理し、
 *   背骨グループどうしは工程名セットが1つでも共通すれば同じテーブルへ統合する
 *   （異なる工程図の背骨ラインを比較できるように）。枝葉グループ（サブライン・部品）は
 *   背骨や他の枝葉グループとは絶対に統合せず、常にグループごとの単独テーブルとして
 *   完全に分離して表示する（Union-Find法、統合対象を背骨どうしのペアに限定）。
 *
 * @param {string[]} chartIds
 * @param {Map<string,Set<string>>} groupSel  - chartId → Set<groupId>
 * @param {boolean}  allGroups
 * @returns {{ tables: Array<{label:string|null, rows:Array, columns:string[]}> }}
 */
function computeRouteMapTables(chartIds, groupSel, allGroups) {
  if (!allGroups) {
    const { rows, columns } = computeRouteMap(chartIds, groupSel);
    return { tables: columns.length ? [{ label: null, rows, columns }] : [] };
  }

  // ── 全グループモード: (chartId × groupId) ペアを行として収集 ──
  const sv = {
    nodes: S.nodes, edges: S.edges, groups: S.groups,
    merges: S.merges, listOrder: S.listOrder, backboneGroupId: S.backboneGroupId,
  };

  const rowItems = []; // { chartId, chartName, groupId, groupLabel, groupColor, isBb, processes }

  for (const cid of chartIds) {
    const chart = W.charts.find(c => c.id === cid); if (!chart) continue;

    if (cid !== W.activeId) {
      const cd = getChartData(chart);
      S.nodes = cd.nodes; S.edges = cd.edges; S.groups = cd.groups;
      S.merges = cd.merges; S.listOrder = cd.listOrder; S.backboneGroupId = cd.backboneGroupId;
    }

    const bbGid = getBackboneGroupId();
    const nums  = computeNums();

    // groupSel で明示指定があればその選択、なければ当該チャートの全グループ
    const selGroups = groupSel?.get(cid);
    const gids = (selGroups && selGroups.size > 0)
      ? [...selGroups]
      : S.groups.map(g => g.id);  // 未選択 → 全グループを対象

    for (const gid of gids) {
      const g = S.groups.find(x => x.id === gid);
      const processes = S.listOrder
        .map(id => S.nodes.find(n => n.id === id))
        .filter(n => n && isNumType(n.type) && n.groupId === gid)
        .map(n => ({
          label: (n.label || '').trim() || (SYMS[n.type]?.name ?? n.type),
          seq:   nums[n.id] ?? null,
        }))
        .filter(p => p.seq !== null);

      // 重複ラベルにサフィックス
      const seen = {};
      for (const p of processes) {
        seen[p.label] = (seen[p.label] || 0) + 1;
        if (seen[p.label] > 1) p.label = `${p.label} (${seen[p.label]})`;
      }

      // 加工・検査（通し番号付き工程）が1件も無いグループも、
      // 「表示対象が無い」ことが分かるよう行として残す（Union-Findでは
      // 共有ラベルが無いため他と統合されず単独テーブルになる）。
      rowItems.push({
        chartId: cid, chartName: chart.name,
        groupId: gid, groupLabel: g?.label ?? '', groupColor: g?.color ?? '#94a3b8',
        isBb: gid === bbGid, processes,
      });
    }

    if (cid !== W.activeId) {
      S.nodes = sv.nodes; S.edges = sv.edges; S.groups = sv.groups;
      S.merges = sv.merges; S.listOrder = sv.listOrder; S.backboneGroupId = sv.backboneGroupId;
    }
  }

  // 完全復元
  S.nodes = sv.nodes; S.edges = sv.edges; S.groups = sv.groups;
  S.merges = sv.merges; S.listOrder = sv.listOrder; S.backboneGroupId = sv.backboneGroupId;

  if (!rowItems.length) return { tables: [] };

  // ── Union-Find: 背骨どうしのペアに限り、工程名が1つでも共通する行を同じテーブルへ統合する。
  //    枝葉グループ（isBb=false）は統合対象から除外し、常に単独の連結成分（＝単独テーブル）
  //    のまま残す。
  const n = rowItems.length;
  const par = Array.from({ length: n }, (_, i) => i);
  const find = i => { if (par[i] !== i) par[i] = find(par[i]); return par[i]; };
  const unite = (i, j) => { par[find(i)] = find(j); };

  const labelSets = rowItems.map(r => new Set(r.processes.map(p => p.label)));
  for (let i = 0; i < n; i++) {
    if (!rowItems[i].isBb) continue;
    for (let j = i + 1; j < n; j++) {
      if (!rowItems[j].isBb) continue;
      if (find(i) !== find(j)) {
        for (const l of labelSets[i]) { if (labelSets[j].has(l)) { unite(i, j); break; } }
      }
    }
  }

  // 連結成分 → テーブル
  const compMap = new Map();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    if (!compMap.has(root)) compMap.set(root, []);
    compMap.get(root).push(rowItems[i]);
  }

  const tables = [];
  for (const [, items] of compMap) {
    const columns = _mergeOrderedSequences(items.map(r => r.processes.map(p => p.label)));
    const rows = items.map(item => ({
      chartId: item.chartId, chartName: item.chartName,
      groupId: item.groupId, groupLabel: item.groupLabel, groupColor: item.groupColor,
      isBb: item.isBb, processes: item.processes,
    }));

    // ── テーブルラベル生成 ──────────────────────────────────────
    // ・背骨グループ名を優先（「背骨」という文字列は省略）
    // ・背骨が1つだけで非背骨もある → "背骨名（枝葉A・枝葉B）"
    // ・背骨がなく非背骨のみ       → "枝葉A・枝葉B"（※背骨以外の部品ライン）
    // ・背骨が複数ある              → "背骨A / 背骨B"
    const bbLabels  = [...new Set(items.filter(r =>  r.isBb).map(r => r.groupLabel).filter(Boolean))];
    const subLabels = [...new Set(items.filter(r => !r.isBb).map(r => r.groupLabel).filter(Boolean))];
    let label;
    if (bbLabels.length === 0 && subLabels.length === 0) {
      label = null;
    } else if (bbLabels.length === 0) {
      label = subLabels.join('・');
    } else {
      label = bbLabels.join(' / ') + (subLabels.length ? `（${subLabels.join('・')}）` : '');
    }
    tables.push({ label: label || null, rows, columns, hasBranch: subLabels.length > 0 });
  }

  return { tables };
}

// ── LocalStorage 自動保存（V3 ワークスペース形式）────

const LS_KEY = 'nps_workspace_v3';

function saveLS() {
  try {
    syncActiveChart();
    localStorage.setItem(LS_KEY, JSON.stringify({
      charts: W.charts, activeId: W.activeId, uid: _uid,
    }));
  } catch (_) {}
}

function _loadLS() {
  let loaded = false;

  // V3: ワークスペース形式
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const d = JSON.parse(raw);
      if (Array.isArray(d.charts) && d.charts.length) {
        W.charts   = d.charts;
        W.activeId = d.activeId || d.charts[0].id;
        if (d.uid) _uid = Math.max(_uid, d.uid);
        const active = W.charts.find(c => c.id === W.activeId) || W.charts[0];
        W.activeId = active.id;
        loadChartIntoS(active);
        loaded = true;
      }
    }
  } catch (_) {}

  // V2: 単一工程図形式からマイグレーション
  if (!loaded) {
    try {
      const raw = localStorage.getItem('nps_chart_v2');
      if (raw) {
        const d = JSON.parse(raw);
        if (Array.isArray(d.nodes) && d.nodes.length) {
          const id = uid();
          W.charts   =[{
            id, name: d.meta?.hb || d.meta?.hm || '工程図1',
            backboneGroupId: null,
            meta: d.meta || {}, nodes: d.nodes || [], edges: d.edges || [],
            groups: d.groups || [], merges: d.merges ||[], listOrder: d.listOrder ||[],
          }];
          W.activeId = id;
          if (d.uid) _uid = Math.max(_uid, d.uid);
          loadChartIntoS(W.charts[0]);
          loaded = true;
        }
      }
    } catch (_) {}
  }

  // 初回起動またはロード失敗時: 空の工程図を1つ作成
  if (!loaded) {
    const id = uid();
    W.charts   =[{ id, name: '工程図1', backboneGroupId: null,
      meta: { hb:'', hm:'', sk:'', dt: new Date().toISOString().split('T')[0] },
      nodes: [], edges: [], groups: [], merges:[], listOrder:[] }];
    W.activeId = id;
    loadChartIntoS(W.charts[0]);
  }

  // データが実質的に空（すべての工程図でノードが0件）の場合は false を返す
  const hasData = W.charts.some(c => Array.isArray(c.nodes) && c.nodes.length > 0);
  return hasData;
}

let _lsTimer = null;
function _scheduleLS() {
  clearTimeout(_lsTimer);
  _lsTimer = setTimeout(saveLS, 600);
}

// ── 無名グループ（グループ未指定工程の受け皿）─────

/**
 * 無選択で作成された工程の受け皿となる「無名グループ」のIDを返す。
 * 存在しなければ自動生成する。グループに属させておくことで、
 * 作成後のグループ操作（名称変更・合流・背骨設定など）が容易になる。
 */
function ensureDefaultGroup() {
  let g = (S.groups || []).find(x => x.isDefault);
  if (!g) {
    g = {
      id:    uid(),
      label: '無名グループ',
      color: GROUP_COLORS[(S.groups || []).length % GROUP_COLORS.length],
      isDefault: true,
    };
    S.groups.push(g);
  }
  return g.id;
}

// ── リストOrder 挿入ヘルパー ──────────────────────

function _insertInListOrder(nodeId, afterId) {
  if (afterId) {
    const idx = S.listOrder.indexOf(afterId);
    if (idx >= 0) { S.listOrder.splice(idx + 1, 0, nodeId); return; }
  }
  S.listOrder.push(nodeId);
}

// ═══════════════════════════════════════════════
// 改善モード / 機械マスタ / 能力設定
// ═══════════════════════════════════════════════

let improvementMode = 'before'; // 'before' | 'after'

const capSettings = { operatingTime: 420, targetQty: 100, groupOverrides: {} };

let machineMaster = [];

const DEFAULT_MACHINE_MASTER = [
  { id:'m1', name:'CNC旋盤A',        manualTime:30,  autoTime:120, toolChangeTime:300, toolChangeFrequency:100 },
  { id:'m2', name:'マシニングセンタ',  manualTime:45,  autoTime:180, toolChangeTime:600, toolChangeFrequency:50  },
  { id:'m3', name:'ドリルプレス',     manualTime:20,  autoTime:60,  toolChangeTime:180, toolChangeFrequency:200 },
  { id:'m4', name:'研削盤',           manualTime:35,  autoTime:90,  toolChangeTime:240, toolChangeFrequency:150 },
  { id:'m5', name:'プレス機',         manualTime:15,  autoTime:45,  toolChangeTime:120, toolChangeFrequency:500 },
];

const IMP_KEY = 'nps_global_v1';

function getMachine(id) {
  return machineMaster.find(m => m.id === id) || null;
}

function newMachineId() {
  let n = machineMaster.length + 1;
  while (machineMaster.find(m => m.id === 'm' + n)) n++;
  return 'm' + n;
}

/** ノードの現在モード用改善データを返す（isNumType 以外は null） */
function getNodeImpData(node) {
  if (!node || !isNumType(node.type)) return null;
  // モーダル編集中はライブプレビューデータを優先
  const src = node._liveImpPreview || node.improvement || {};
  const d = src[improvementMode];
  return d
    ? { ...d }
    : { labelOverride:'', machineId:null, manualTime:0, autoTime:0, toolChangeTime:0, toolChangeFrequency:100 };
}

/** 現在モードを考慮した表示ラベルを返す */
function getEffectiveLabel(node) {
  if (!isNumType(node.type)) return node.label || '';
  const d = getNodeImpData(node);
  return (d && d.labelOverride) ? d.labelOverride : (node.label || '');
}

/**
 * 加工能力を計算する
 * @param {object} impData  - { manualTime, autoTime, toolChangeTime, toolChangeFrequency }（秒）
 * @param {number} opMin    - 稼働時間（分/日）
 * @returns {number|null} 能力（個/日）
 */
function calcCapacity(impData, opMin) {
  if (!impData) return null;
  const { manualTime=0, autoTime=0, toolChangeTime=0, toolChangeFrequency=100 } = impData;
  const freq = toolChangeFrequency > 0 ? toolChangeFrequency : 100;
  const cycleTime = manualTime + autoTime + toolChangeTime / freq;
  if (cycleTime <= 0) return null;
  return (opMin * 60) / cycleTime;
}

function setImprovementMode(mode) {
  const prev = improvementMode;

  // 同一モードならUIのみ更新（データ操作なし）
  if (mode === prev) {
    _saveGlobalSettings();
    document.querySelectorAll('.imp-mode-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.mode === mode));
    return;
  }

  // ── 現在のモードデータを保存してから切り替え ──
  syncActiveChart();
  improvementMode = mode;
  _saveGlobalSettings();

  // バリアントを持つチャートの場合、新モードのデータをロードしてキャンバスを更新
  if (W.activeId) {
    const chart = W.charts.find(c => c.id === W.activeId);
    if (chart?.impVariants) {
      loadChartIntoS(chart);
      S._undo = []; S._redo = [];
      rUB();
    }
  }

  // ボタン状態更新
  document.querySelectorAll('.imp-mode-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.mode === mode));

  redraw();
  if (currentView === 'list')     updateListPanel();
  if (currentView === 'capacity') updateCapacityView();
}

function _saveGlobalSettings() {
  try {
    localStorage.setItem(IMP_KEY, JSON.stringify({ improvementMode, machineMaster, capSettings }));
  } catch (_) {}
}

function _loadGlobalSettings() {
  try {
    const raw = localStorage.getItem(IMP_KEY);
    if (raw) {
      const d = JSON.parse(raw);
      if (d.improvementMode) improvementMode = d.improvementMode;
      if (Array.isArray(d.machineMaster) && d.machineMaster.length) machineMaster = d.machineMaster;
      if (d.capSettings) { capSettings.operatingTime = d.capSettings.operatingTime ?? capSettings.operatingTime; capSettings.targetQty = d.capSettings.targetQty ?? capSettings.targetQty; capSettings.groupOverrides = d.capSettings.groupOverrides ?? {}; }
    }
  } catch (_) {}
  if (!machineMaster.length) machineMaster = DEFAULT_MACHINE_MASTER.map(m => ({ ...m }));
}