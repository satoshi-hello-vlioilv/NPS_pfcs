'use strict';

// ═══════════════════════════════════════════════
// UI — 編集モーダル / リストパネル / パレット / アクション
// ═══════════════════════════════════════════════

// ── 編集モーダル ─────────────────────────────────

let editingNodeId  = null;
let editingNewType = null;
let _editLabelShow = true;  // 工程名表示ON/OFF

// 編集中の一時状態（Save時にノードへ書き込む）
let _editBadgeOffsets      = {};  // {badgeId: {dx, dy}}
let _editBadgeBorders      = {};  // {badgeId: boolean}  false = 枠なし
let _editBadgeColors       = {};  // {badgeId: string|null}  カスタムカラー
let _editBadgeColorEnabled = {};  // {badgeId: boolean}  false = 無色
let _editLabelBorder       = true;

// 改善データ（モーダル編集用）
const _IMP_DEF = () => ({ labelOverride:'', machineId:null, manualTime:0, autoTime:0, toolChangeTime:0, toolChangeFrequency:100 });
let _editImpBefore = _IMP_DEF();
let _editImpAfter  = _IMP_DEF();
let _editImpTab    = 'before'; // 改善データタブ
let _editModalTab  = 'basic';  // モーダル左タブ: 'basic'|'note'|'imp'

const UNIT_PRESETS =['個','枚','本','巻','kg','g','t','m','mm','m²','L','set','ロット'];

function openModal(nid) {
  const node = N(nid); if (!node) return;
  editingNodeId  = nid;
  editingNewType = node.type;
  _editBadgeOffsets      = JSON.parse(JSON.stringify(node.badgeOffsets      || {}));
  _editBadgeBorders      = JSON.parse(JSON.stringify(node.badgeBorders      || {}));
  _editBadgeColors       = JSON.parse(JSON.stringify(node.badgeColors       || {}));
  _editBadgeColorEnabled = JSON.parse(JSON.stringify(node.badgeColorEnabled || {}));
  _editLabelBorder       = node.labelBorder !== false;
  _editLabelShow         = node.labelShow   !== false;
  if (_editBadgeBorders['unit']    === undefined) _editBadgeBorders['unit']    = node.unitBorder    !== false;
  if (_editBadgeBorders['comment'] === undefined) _editBadgeBorders['comment'] = node.commentBorder === true;
  // 改善データの初期化
  if (isNumType(node.type)) {
    const imp = node.improvement || {};
    _editImpBefore = { ..._IMP_DEF(), ...(imp.before || {}) };
    _editImpAfter  = { ..._IMP_DEF(), ...(imp.after  || {}) };
    _editImpTab    = improvementMode; // 現在のモードを初期タブに
  }
  _editModalTab = 'basic'; // 左タブをリセット
  _buildModal(node);
  document.getElementById('edit-modal').classList.add('show');
  requestAnimationFrame(() => {
    const inp = document.getElementById('m-inp-label');
    if (inp) { inp.focus(); inp.select(); }
    _renderModalPreview();
  });
}

function closeModal() {
  document.getElementById('edit-modal').classList.remove('show');
  editingNodeId = editingNewType = null;
}

// ── モーダル本体 HTML 構築 ─────────────────────

function _buildModal(node) {
  const STATUS_IDS   = ['important','quality','kaizen','auto','outsource','pokayoke'];
  const activeBadges = node.badges ||[];
  const activeStatus = activeBadges.find(bid => STATUS_IDS.includes(bid)) || '';
  const commentOn    = activeBadges.includes('comment');
  const unitOn       = activeBadges.includes('unit');

  // ── 記号ピッカーバー（水平）──
  let pickerBarHTML = '<span class="m-picker-lbl"><i class="fa-solid fa-shapes"></i> 記号</span>';
  GROUPS.forEach((g, gi) => {
    if (gi > 0) pickerBarHTML += '<span class="m-picker-sep"></span>';
    g.types.forEach(t => {
      const sd = SYMS[t], act = t === node.type;
      const dispName = sd.shortName ?? sd.name;
      pickerBarHTML += `<button class="m-picker-btn${act ? ' active' : ''}" data-type="${t}"
        title="${sd.name}" style="--tc:${sd.color}" onclick="selectModalType('${t}')">
        <div class="m-picker-ico">${palIcoSVG(t, 20)}</div>
        <span class="m-picker-nm">${dispName}</span>
      </button>`;
    });
  });

  // ── 単位セクション ──
  const currentUnit = node.unit || '';
  const isPreset    = UNIT_PRESETS.includes(currentUnit);
  const isCustom    = currentUnit !== '' && !isPreset;
  const customUnit  = isCustom ? currentUnit : '';
  const selValue    = isPreset ? currentUnit : (isCustom ? '__custom__' : '');
  const hasUnit     = !!currentUnit;
  const previewTxt  = hasUnit ? (node.unitQty ? `[${node.unitQty}${currentUnit}]` : `[${currentUnit}]`) : '';
  const unitOptions = UNIT_PRESETS.map(u =>
    `<option value="${u}"${selValue === u ? ' selected' : ''}>${u}</option>`
  ).join('');

  // ── ラベル枠ボタン ──
  const borderBtn = (id, lbl, isOn) =>
    `<button class="m-border-btn${isOn ? ' on' : ''}" id="${id}"
      title="${lbl}枠 ${isOn ? 'あり → クリックで非表示' : 'なし → クリックで表示'}">
      <i class="fa-${isOn ? 'solid' : 'regular'} fa-square"></i>
      <span>${isOn ? '枠あり' : '枠なし'}</span>
    </button>`;

  // ── ラベル専用スタイル行（枠 + 色EN/OFF + カラーピッカー）──
  const labelDefaultColor  = SYMS[node.type]?.color || '#334155';
  const labelColorEnabled  = _editBadgeColorEnabled['label'] !== false;
  const labelColorVal      = _editBadgeColors['label'] || labelDefaultColor;
  const labelStyleRow = `<div class="m-badge-style-row" id="m-label-style"
      style="visibility:${_editLabelShow ? 'visible' : 'hidden'}">
    <button class="m-badge-border-btn${_editLabelBorder ? ' on' : ''}"
      onclick="toggleModalLabelBorder();_renderModalPreview();"
      title="ラベル枠 ${_editLabelBorder ? 'あり → クリックで非表示' : 'なし → クリックで表示'}">
      <i class="fa-${_editLabelBorder ? 'solid' : 'regular'} fa-square"></i>
    </button>
    <button class="m-badge-color-en-btn${labelColorEnabled ? ' on' : ''}" data-bid="label"
      onclick="toggleModalBadgeColorEnabled(this.dataset.bid);_renderModalPreview();"
      title="${labelColorEnabled ? '背景色あり → クリックで透明' : '背景透明 → クリックで有色'}">
      <i class="fa-solid fa-${labelColorEnabled ? 'palette' : 'circle-half-stroke'}"></i>
    </button>
    <input type="color" class="m-badge-color-inp" data-bid="label"
      value="${labelColorVal}" ${!labelColorEnabled ? 'disabled' : ''}
      oninput="updateModalBadgeColor(this.dataset.bid, this.value)"
      title="ラベル文字・枠色">
  </div>`;

  // ── バッジスタイル行ビルダー (枠・色ON/OFF・カラーピッカー) ──
  const styleRow = (bid, rowId, visible) => {
    const b            = BADGES.find(x => x.id === bid) || {};
    const hasBorder    = _editBadgeBorders[bid] !== false;
    const colorEnabled = _editBadgeColorEnabled[bid] !== false;
    const colorVal     = _editBadgeColors[bid] || b.color || '#6366f1';
    return `<div class="m-badge-style-row" id="${rowId}" style="visibility:${visible ? 'visible' : 'hidden'}">
      <button class="m-badge-border-btn${hasBorder ? ' on' : ''}" data-bid="${bid}"
        onclick="toggleModalBadgeBorder(this.dataset.bid);_renderModalPreview();"
        title="バッジ枠 ${hasBorder ? 'あり' : 'なし'}">
        <i class="fa-${hasBorder ? 'solid' : 'regular'} fa-square"></i>
      </button>
      <button class="m-badge-color-en-btn${colorEnabled ? ' on' : ''}" data-bid="${bid}"
        onclick="toggleModalBadgeColorEnabled(this.dataset.bid)"
        title="${colorEnabled ? '色あり → クリックで無色' : '色なし → クリックで有色'}">
        <i class="fa-solid fa-${colorEnabled ? 'palette' : 'circle-half-stroke'}"></i>
      </button>
      <input type="color" class="m-badge-color-inp" data-bid="${bid}"
        value="${colorVal}" ${!colorEnabled ? 'disabled' : ''}
        oninput="updateModalBadgeColor(this.dataset.bid, this.value)"
        title="バッジ色">
    </div>`;
  };

  // ── 状態バッジ プルダウン ──
  const statusBid = activeStatus || 'important'; // style row の data-bid 初期値
  const statusOptions = `<option value="">— なし —</option>` + STATUS_IDS.map(bid => {
      const b = BADGES.find(x => x.id === bid);
      return `<option value="${bid}"${activeStatus === bid ? ' selected' : ''}>${b.label}</option>`;
    }).join('');

  const hasImpTab = isNumType(node.type);
  document.getElementById('m-body').innerHTML = `

    <!-- ① 記号ピッカーバー（水平・全幅）-->
    <div class="m-picker-bar" id="mp-picker">${pickerBarHTML}</div>

    <!-- ② メインレイアウト（2カラム）-->
    <div class="m2-layout">

      <!-- フォームカラム（タブ構成）-->
      <div class="m2-form-col">

        <!-- 工程名（タブ外・常時表示）-->
        <div class="m-block m-block-sysbadge m-block-label">
          <div class="m-sysbadge-hdr">
            <div class="m-sysbadge-title">
              <button class="m-sysbadge-toggle${_editLabelShow ? ' active' : ''}" id="m-tog-label"
                onclick="toggleLabelShow()"
                title="${_editLabelShow ? '表示中 — クリックで非表示' : '非表示 — クリックで表示'}">
                <i class="fa-solid fa-eye${_editLabelShow ? '' : '-slash'}"></i>
                <span>表示</span>
              </button>
              <span class="m-sysbadge-lbl">
                <i class="fa-solid fa-tag"></i> 工程名
              </span>
            </div>
            ${labelStyleRow}
          </div>
          <input type="text" id="m-inp-label" class="m-inp m-inp-name"
            value="${esc(node.label)}" placeholder="例：スリッター加工"
            oninput="_renderModalPreview()" onkeydown="modalKeydown(event)">
        </div>

        <!-- タブバー -->
        <div class="m-left-tabs">
          <button class="m-left-tab${_editModalTab === 'basic' ? ' active' : ''}" onclick="switchModalTab('basic')">
            <i class="fa-solid fa-sliders"></i> 基本設定
          </button>
          <button class="m-left-tab${_editModalTab === 'note' ? ' active' : ''}" onclick="switchModalTab('note')">
            <i class="fa-regular fa-comment-dots"></i> 補足
          </button>
          ${hasImpTab ? `<button class="m-left-tab${_editModalTab === 'imp' ? ' active' : ''}" onclick="switchModalTab('imp')">
            <i class="fa-solid fa-arrow-trend-up"></i> 改善データ
          </button>` : ''}
        </div>

        <!-- タブコンテンツ -->
        <div class="m-left-tab-body">

          <!-- ── 基本設定タブ ── -->
          <div id="m-tab-basic" class="m-tab-pane${_editModalTab === 'basic' ? ' active' : ''}">
            <!-- 状態表示 + 流す単位（2列グリッド）-->
            <div class="m-status-unit-grid">

              <!-- 状態表示 -->
              <div class="m-block m-block-sysbadge m-block-status">
                <div class="m-sysbadge-hdr">
                  <div class="m-sysbadge-title">
                    <button class="m-sysbadge-toggle${activeStatus ? ' active' : ''}" id="m-tog-status"
                      onclick="toggleSysBadge('status')"
                      title="${activeStatus ? 'バッジ表示中 — クリックで非表示' : 'バッジ非表示 — クリックで表示'}">
                      <i class="fa-solid fa-eye${activeStatus ? '' : '-slash'}"></i>
                      <span>表示</span>
                    </button>
                    <span class="m-sysbadge-lbl">
                      <i class="fa-solid fa-flag"></i> 状態
                    </span>
                  </div>
                  ${styleRow(statusBid, 'm-status-style', !!activeStatus)}
                </div>
                <select id="m-sel-status" class="m-inp m-sel m-sel-status"
                  onchange="onStatusChange()">
                  ${statusOptions}
                </select>
              </div>

              <!-- 流す単位 -->
              <div class="m-block m-block-sysbadge m-block-unit">
                <div class="m-sysbadge-hdr">
                  <div class="m-sysbadge-title">
                    <button class="m-sysbadge-toggle${unitOn ? ' active' : ''}" id="m-tog-unit"
                      onclick="toggleSysBadge('unit')"
                      title="${unitOn ? 'バッジ表示中 — クリックで非表示' : 'バッジ非表示 — クリックで表示'}">
                      <i class="fa-solid fa-eye${unitOn ? '' : '-slash'}"></i>
                      <span>表示</span>
                    </button>
                    <span class="m-sysbadge-lbl">
                      <i class="fa-solid fa-box"></i> 単位
                    </span>
                  </div>
                  ${styleRow('unit', 'm-unit-style', unitOn)}
                </div>
                <div class="unit-section">
                  <select id="m-sel-unit" class="m-inp m-sel" onchange="onUnitSelectChange()">
                    <option value="">なし</option>
                    ${unitOptions}
                    <option value="__custom__"${selValue === '__custom__' ? ' selected' : ''}>その他...</option>
                  </select>
                  <div id="unit-custom-wrap" style="${isCustom ? '' : 'display:none'}">
                    <input type="text" id="m-inp-unit-custom" class="m-inp"
                      value="${esc(customUnit)}" placeholder="単位入力（例: 台）"
                      oninput="onUnitCustomInput(this.value)" onkeydown="modalKeydown(event)">
                  </div>
                  <div id="unit-qty-row" style="${hasUnit ? '' : 'display:none'}">
                    <div class="unit-qty-row">
                      <span class="unit-qty-lbl">数量</span>
                      <div class="stepper-wrap">
                        <button class="step-btn" type="button" onclick="stepQty(-1)">
                          <i class="fa-solid fa-minus"></i>
                        </button>
                        <input type="text" id="m-inp-unitqty" inputmode="decimal"
                          class="m-inp unit-qty-inp" value="${esc(node.unitQty || '')}"
                          placeholder="100" oninput="onUnitQtyInput()" onkeydown="modalKeydown(event)">
                        <button class="step-btn" type="button" onclick="stepQty(1)">
                          <i class="fa-solid fa-plus"></i>
                        </button>
                      </div>
                    </div>
                    <div class="unit-preview" id="unit-preview">${esc(previewTxt)}</div>
                  </div>
                </div>
              </div>

            </div><!-- /m-status-unit-grid -->
          </div><!-- /m-tab-basic -->

          <!-- ── 補足タブ ── -->
          <div id="m-tab-note" class="m-tab-pane${_editModalTab === 'note' ? ' active' : ''}">
            <div class="m-block m-block-sysbadge">
              <div class="m-sysbadge-hdr">
                <div class="m-sysbadge-title">
                  <button class="m-sysbadge-toggle${commentOn ? ' active' : ''}" id="m-tog-comment"
                    onclick="toggleSysBadge('comment')"
                    title="${commentOn ? 'バッジ表示中 — クリックで非表示' : 'バッジ非表示 — クリックで表示'}">
                    <i class="fa-solid fa-eye${commentOn ? '' : '-slash'}"></i>
                    <span>表示</span>
                  </button>
                  <span class="m-sysbadge-lbl">
                    <i class="fa-regular fa-comment-dots"></i> コメント
                  </span>
                </div>
                ${styleRow('comment', 'm-comment-style', commentOn)}
              </div>
              <textarea id="m-inp-comment" class="m-inp m-textarea m-textarea-comment m-textarea-tall"
                placeholder="詳細な説明・改善案・引き継ぎ情報など..."
                oninput="_renderModalPreview()">${esc(node.comment || '')}</textarea>
            </div>
          </div><!-- /m-tab-note -->

          <!-- ── 改善データタブ（isNumType のみ）── -->
          ${hasImpTab ? `<div id="m-tab-imp" class="m-tab-pane${_editModalTab === 'imp' ? ' active' : ''}">
            ${_buildImpSection()}
          </div>` : ''}

        </div><!-- /m-left-tab-body -->

      </div><!-- /m2-form-col -->

      <!-- プレビューカラム -->
      <div class="m2-preview-col">
        <div class="m3-preview-sticky">
          <div class="m3-preview-ttl">
            <i class="fa-solid fa-eye"></i> チャートプレビュー
            <span class="m3-preview-live">● LIVE</span>
          </div>
          <div class="m-preview-box" id="m-preview-box"></div>
          <div class="m-badge-dnd-hint" id="m-badge-dnd-hint" style="display:none">
            <i class="fa-solid fa-hand-pointer"></i>
            バッジをドラッグして位置を調整
          </div>
          <div class="m-badge-dnd-actions" id="m-badge-dnd-actions" style="display:none">
            <button class="m-badge-dnd-reset" onclick="resetAllBadgeOffsets()" title="全オフセットをリセット">
              <i class="fa-solid fa-rotate-left"></i> リセット
            </button>
          </div>
        </div>
        <div class="m3-preview-desc" id="mp-desc-box">
          ${_descHTML(node.type)}
        </div>
      </div><!-- /m2-preview-col -->

    </div><!-- /m2-layout -->
  `;

  document.getElementById('m-label-border-btn')?.addEventListener('click', () => { toggleModalLabelBorder(); _renderModalPreview(); });
}

// ── 記号説明 HTML ────────────────────────────────

function _descHTML(type) {
  const sd = SYMS[type]; if (!sd) return '';
  const catLabel = sd.cat === 'va' ? '付加価値' : sd.cat === 'nva' ? '非付加価値' : '起点';
  const catCls   = sd.cat === 'va' ? 'cat-va'  : sd.cat === 'nva' ? 'cat-nva'  : 'cat-base';
  const parenMatch = sd.name.match(/[（(]([^）)]+)[）)]/);
  const subLabel   = parenMatch ? parenMatch[1] : null;
  const isCompact  = type.startsWith('kensa') || type.startsWith('tt_');

  if (isCompact && subLabel) {
    return `
      <div class="mp-desc-inner mp-desc-compact" style="--dc:${sd.color}">
        <div class="mp-desc-head">
          <div class="mp-desc-ico">${palIcoSVG(type, 32)}</div>
          <div>
            <div class="mp-desc-nm" style="color:${sd.color}">
              ${sd.name.replace(/[（(][^）)]+[）)]/g, '')}
              <span class="mp-desc-sub-lbl" style="color:${sd.color}">（${subLabel}）</span>
            </div>
            <span class="mp-desc-cat ${catCls}">${catLabel}</span>
          </div>
        </div>
        <p class="mp-desc-txt">${sd.desc || ''}</p>
      </div>`;
  }

  const subHTML = sd.subItems ? `<div class="mp-sub-list">
    ${sd.subItems.map(s => `<div class="mp-sub-item">
      <span class="mp-sub-lbl" style="color:${sd.color}">${s.lbl}</span>
      <span class="mp-sub-ex">${s.ex}</span>
    </div>`).join('')}
  </div>` : '';

  return `
    <div class="mp-desc-inner" style="--dc:${sd.color}">
      <div class="mp-desc-head">
        <div class="mp-desc-ico">${palIcoSVG(type, 32)}</div>
        <div>
          <div class="mp-desc-nm" style="color:${sd.color}">${sd.name}</div>
          <span class="mp-desc-cat ${catCls}">${catLabel}</span>
        </div>
      </div>
      <p class="mp-desc-txt">${sd.desc || ''}</p>
      ${sd.detail ? `<p class="mp-desc-detail">${sd.detail}</p>` : ''}
      ${subHTML}
    </div>`;
}

// ── タブ切り替え（変更対象の切り替えボタン）──────

/** 左フォームカラム タブ切り替え */
function switchModalTab(tab) {
  _editModalTab = tab;
  const modal = document.getElementById('edit-modal');
  if (!modal) return;
  modal.querySelectorAll('.m-left-tab').forEach(b => {
    const isActive = (b.getAttribute('onclick') || '').includes(`'${tab}'`);
    b.classList.toggle('active', isActive);
  });
  modal.querySelectorAll('.m-tab-pane').forEach(p => {
    p.classList.toggle('active', p.id === `m-tab-${tab}`);
  });
}

/** 状態バッジ ドロップダウン変更ハンドラ */
function onStatusChange() {
  const sel = document.getElementById('m-sel-status');
  const val = sel ? sel.value : '';
  const row = document.getElementById('m-status-style');
  if (row) {
    row.style.visibility = val ? 'visible' : 'hidden';
    if (val) {
      // 全コントロールの data-bid を選択値に同期
      row.querySelectorAll('[data-bid]').forEach(el => el.dataset.bid = val);
      // カラーピッカーの初期値をセット
      const inp = row.querySelector('.m-badge-color-inp');
      if (inp) {
        const b = BADGES.find(x => x.id === val);
        inp.value = _editBadgeColors[val] || (b ? b.color : '#6366f1');
        inp.disabled = _editBadgeColorEnabled[val] === false;
      }
      // 枠ボタンの状態を反映
      const borderBtn2 = row.querySelector('.m-badge-border-btn');
      if (borderBtn2) {
        const hasBorder = _editBadgeBorders[val] !== false;
        borderBtn2.classList.toggle('on', hasBorder);
        borderBtn2.querySelector('i').className = `fa-${hasBorder ? 'solid' : 'regular'} fa-square`;
      }
      // 色ONボタンの状態を反映
      const colorEnBtn = row.querySelector('.m-badge-color-en-btn');
      if (colorEnBtn) {
        const colorEnabled = _editBadgeColorEnabled[val] !== false;
        colorEnBtn.classList.toggle('on', colorEnabled);
        colorEnBtn.querySelector('i').className = `fa-solid fa-${colorEnabled ? 'palette' : 'circle-half-stroke'}`;
      }
    }
  }
  _renderModalPreview();
}

/** 表示ON/OFF切り替え（status / comment / unit 共通）*/
function toggleSysBadge(bid) {
  const btn = document.getElementById(`m-tog-${bid}`);
  if (!btn) return;
  const wasActive = btn.classList.contains('active');
  const nowActive = !wasActive;
  btn.classList.toggle('active', nowActive);
  const icon = btn.querySelector('i');
  if (icon) icon.className = `fa-solid fa-eye${nowActive ? '' : '-slash'}`;
  const row = document.getElementById(`m-${bid}-style`);
  if (row) row.style.visibility = nowActive ? 'visible' : 'hidden';
  _renderModalPreview();
}

// ── 枠トグル ─────────────────────────────────────

function _setBorderBtn(id, isOn, label) {
  const btn = document.getElementById(id); if (!btn) return;
  btn.classList.toggle('on', isOn);
  btn.title = `${label}枠 ${isOn ? 'あり → クリックで非表示' : 'なし → クリックで表示'}`;
  btn.innerHTML = `<i class="fa-${isOn ? 'solid' : 'regular'} fa-square"></i><span>${isOn ? '枠あり' : '枠なし'}</span>`;
}

function toggleModalLabelBorder() {
  _editLabelBorder = !_editLabelBorder;
  // m-label-style 内の m-badge-border-btn を更新
  const btn = document.querySelector('#m-label-style .m-badge-border-btn');
  if (btn) {
    btn.classList.toggle('on', _editLabelBorder);
    btn.title = `ラベル枠 ${_editLabelBorder ? 'あり → クリックで非表示' : 'なし → クリックで表示'}`;
    const icon = btn.querySelector('i');
    if (icon) icon.className = `fa-${_editLabelBorder ? 'solid' : 'regular'} fa-square`;
  }
}

/** 工程名 表示ON/OFFトグル */
function toggleLabelShow() {
  _editLabelShow = !_editLabelShow;
  const btn = document.getElementById('m-tog-label');
  if (btn) {
    btn.classList.toggle('active', _editLabelShow);
    const icon = btn.querySelector('i');
    if (icon) icon.className = `fa-solid fa-eye${_editLabelShow ? '' : '-slash'}`;
  }
  // スタイル行の表示/非表示も同期
  const styleRow = document.getElementById('m-label-style');
  if (styleRow) styleRow.style.visibility = _editLabelShow ? 'visible' : 'hidden';
  _renderModalPreview();
}

function toggleModalBadgeBorder(bid) {
  _editBadgeBorders[bid] = (_editBadgeBorders[bid] !== false) ? false : true;
  const btn = document.querySelector(`.m-badge-border-btn[data-bid="${bid}"]`);
  if (btn) {
    const on = _editBadgeBorders[bid] !== false;
    btn.classList.toggle('on', on);
    btn.innerHTML = `<i class="fa-${on ? 'solid' : 'regular'} fa-square"></i>`;
  }
  _renderModalPreview();
}

/** バッジ色のON/OFF切り替え */
function toggleModalBadgeColorEnabled(bid) {
  _editBadgeColorEnabled[bid] = (_editBadgeColorEnabled[bid] !== false) ? false : true;
  const isOn = _editBadgeColorEnabled[bid] !== false;
  const btn  = document.querySelector(`.m-badge-color-en-btn[data-bid="${bid}"]`);
  const inp  = document.querySelector(`.m-badge-color-inp[data-bid="${bid}"]`);
  const tog  = document.querySelector(`.m-badge-toggle[data-bid="${bid}"]`);
  if (btn) {
    btn.classList.toggle('on', isOn);
    btn.title = isOn ? '色あり → クリックで無色' : '色なし → クリックで有色';
    btn.querySelector('i').className = `fa-solid fa-${isOn ? 'palette' : 'circle-half-stroke'}`;
  }
  if (inp) inp.disabled = !isOn;
  // トグルボタンの色も更新
  _updateBadgeToggleColor(bid, tog);
  _renderModalPreview();
}

/** バッジカスタムカラーを更新 */
function updateModalBadgeColor(bid, color) {
  _editBadgeColors[bid] = color;
  const tog = document.querySelector(`.m-badge-toggle[data-bid="${bid}"]`);
  _updateBadgeToggleColor(bid, tog);
  _renderModalPreview();
}

/** バッジトグルボタンの色をリフレッシュ */
function _updateBadgeToggleColor(bid, toggleBtn) {
  if (!toggleBtn) return;
  const b = BADGES.find(x => x.id === bid); if (!b) return;
  const { color, bg } = getEffBadgeColors(b, _editBadgeColors, _editBadgeColorEnabled);
  toggleBtn.style.setProperty('--bc', color);
  toggleBtn.style.setProperty('--bbg', bg);
  const dot = toggleBtn.querySelector('.m-badge-dot');
  if (dot) dot.style.background = color;
}

/** _updateBadgeCount: 旧API (no-op) */
function _updateBadgeCount() {}

// ── プレビューSVG バッジ ドラッグ操作 ─────────────────────────

/**
 * SVGプレビュー内の .preview-badge 要素にドラッグリスナーを設定する。
 * _renderModalPreview() の末尾で自動呼び出し。
 */
function _attachBadgeDragInPreview() {
  const box = document.getElementById('m-preview-box');
  const svg = box?.querySelector('svg');
  if (!svg) return;

  svg.querySelectorAll('.preview-badge[data-bid]').forEach(el => {
    // 重複登録防止
    el.removeEventListener('mousedown', _onPreviewBadgeMousedown);
    el.addEventListener('mousedown', _onPreviewBadgeMousedown);
  });

  // ヒント・リセットボタンの表示制御
  const activeBadges = _getActiveBadges();
  const hint    = document.getElementById('m-badge-dnd-hint');
  const actions = document.getElementById('m-badge-dnd-actions');
  if (hint)    hint.style.display    = activeBadges.length ? '' : 'none';
  if (actions) actions.style.display = _hasAnyBadgeOffset() ? '' : 'none';
}

/** アクティブなバッジのうち、いずれかにオフセットが設定されているか */
function _hasAnyBadgeOffset() {
  return _getActiveBadges().some(bid => {
    const off = _editBadgeOffsets[bid];
    return off && (off.dx !== 0 || off.dy !== 0);
  });
}

// ドラッグ状態
let _previewDragState = null;

function _onPreviewBadgeMousedown(ev) {
  if (ev.button !== 0) return;
  ev.preventDefault();
  ev.stopPropagation();

  const el  = ev.currentTarget;
  const bid = el.dataset.bid;
  const svg = el.closest('svg');
  if (!svg) return;

  if (!_editBadgeOffsets[bid]) _editBadgeOffsets[bid] = { dx: 0, dy: 0 };

  _previewDragState = {
    bid, el, svg,
    initDx:  _editBadgeOffsets[bid].dx,
    initDy:  _editBadgeOffsets[bid].dy,
    startX:  ev.clientX,
    startY:  ev.clientY,
    moved:   false,
  };

  // ドラッグ開始ビジュアル
  el.style.cursor = 'grabbing';
  el.querySelector('.preview-badge-pill')?.setAttribute('filter', 'url(#badge-drag-glow)');

  document.addEventListener('mousemove', _onPreviewBadgeMove);
  document.addEventListener('mouseup',   _onPreviewBadgeUp);
}

function _onPreviewBadgeMove(ev) {
  if (!_previewDragState) return;
  const { bid, el, svg, initDx, initDy, startX, startY } = _previewDragState;

  // クライアント座標 → SVGビューボックス座標系に変換
  const rect  = svg.getBoundingClientRect();
  const vb    = svg.viewBox.baseVal;
  const scale = rect.width > 0 ? (vb.width / rect.width) : 1;

  const dx = Math.round(initDx + (ev.clientX - startX) * scale);
  const dy = Math.round(initDy + (ev.clientY - startY) * scale);

  _editBadgeOffsets[bid].dx = dx;
  _editBadgeOffsets[bid].dy = dy;
  _previewDragState.moved = true;

  // transform をライブ更新（再レンダリングなし → 60fps で滑らか）
  el.setAttribute('transform', `translate(${dx},${dy})`);
}

function _onPreviewBadgeUp() {
  if (!_previewDragState) return;
  const { el, moved } = _previewDragState;

  // ビジュアルを元に戻す
  el.style.cursor = 'grab';
  el.querySelector('.preview-badge-pill')?.removeAttribute('filter');

  _previewDragState = null;
  document.removeEventListener('mousemove', _onPreviewBadgeMove);
  document.removeEventListener('mouseup',   _onPreviewBadgeUp);

  // 実際に動いた場合のみ再レンダリング（リセットボタン表示更新を含む）
  if (moved) _renderModalPreview();
}

/** 全バッジオフセットをリセットしてプレビューを更新 */
function resetAllBadgeOffsets() {
  _getActiveBadges().forEach(bid => {
    _editBadgeOffsets[bid] = { dx: 0, dy: 0 };
  });
  _renderModalPreview();
}

// ── 単位インタラクション ──────────────────────────

function onUnitSelectChange() {
  const sel = document.getElementById('m-sel-unit');
  const isCustom = sel?.value === '__custom__';
  const wrap = document.getElementById('unit-custom-wrap');
  if (wrap) wrap.style.display = isCustom ? '' : 'none';
  if (!isCustom) {
    const ci = document.getElementById('m-inp-unit-custom');
    if (ci) ci.value = '';
  }
  _updateUnitQtyVisibility();
  _updateUnitPreview();
  _renderModalPreview();
}

function onUnitCustomInput(val) {
  _updateUnitQtyVisibility();
  _updateUnitPreview();
  _renderModalPreview();
}

function onUnitQtyInput() {
  _updateUnitPreview();
  _renderModalPreview();
}

function stepQty(step) {
  const inp = document.getElementById('m-inp-unitqty'); if (!inp) return;
  const cur = parseFloat(inp.value) || 0;
  const decimals = inp.value.includes('.') ? inp.value.split('.')[1].length : 0;
  const delta = decimals > 0 ? Math.pow(10, -decimals) * (step > 0 ? 1 : -1) : step;
  const next  = Math.max(0, parseFloat((cur + delta).toFixed(decimals + 1)));
  inp.value = String(next % 1 === 0 ? Math.round(next) : next);
  _updateUnitPreview();
  _renderModalPreview();
}

function _getCurrentUnit() {
  const sel = document.getElementById('m-sel-unit');
  if (!sel) return '';
  if (sel.value === '__custom__') {
    return (document.getElementById('m-inp-unit-custom')?.value || '').trim();
  }
  return sel.value;
}

function _updateUnitQtyVisibility() {
  const unit = _getCurrentUnit();
  const row  = document.getElementById('unit-qty-row');
  if (row) row.style.display = unit ? '' : 'none';
  if (!unit) {
    const qtyInp = document.getElementById('m-inp-unitqty');
    if (qtyInp) qtyInp.value = '';
    const prev = document.getElementById('unit-preview');
    if (prev) prev.textContent = '';
  }
}

function _updateUnitPreview() {
  const unit = _getCurrentUnit();
  const qty  = (document.getElementById('m-inp-unitqty')?.value || '').trim();
  const prev = document.getElementById('unit-preview'); if (!prev) return;
  prev.textContent = unit ? (qty ? `[${qty}${unit}]` : `[${unit}]`) : '';
}

// ── モーダルプレビュー ──────────────────────────

function _renderModalPreview() {
  const box = document.getElementById('m-preview-box'); if (!box) return;
  const type = editingNewType || N(editingNodeId)?.type || 'kako';
  const svgStr = buildNodePreviewSVG({
    type,
    label:             (document.getElementById('m-inp-label')?.value || '').trim(),
    unit:              _getCurrentUnit(),
    unitQty:           (document.getElementById('m-inp-unitqty')?.value || '').trim(),
    badges:            _getActiveBadges(),
    comment:           document.getElementById('m-inp-comment')?.value || '',
    badgeOffsets:      _editBadgeOffsets,
    badgeBorders:      _editBadgeBorders,
    badgeColors:       _editBadgeColors,
    badgeColorEnabled: _editBadgeColorEnabled,
    labelBorder:       _editLabelBorder,
    labelShow:         _editLabelShow,
  });
  box.innerHTML = svgStr;
  _attachBadgeDragInPreview();
}

function selectModalType(type) {
  editingNewType = type;
  document.querySelectorAll('.m-picker-btn').forEach(btn =>
    btn.classList.toggle('active', btn.dataset.type === type)
  );
  const descBox = document.getElementById('mp-desc-box');
  if (descBox) descBox.innerHTML = _descHTML(type);
  _renderModalPreview();
}

/** アクティブなバッジIDの配列を返す（状態・comment・unit）*/
function _getActiveBadges() {
  const badges =[];
  // 状態: トグルON かつ 選択値が存在する場合のみ追加
  if (document.getElementById('m-tog-status')?.classList.contains('active')) {
    const status = document.getElementById('m-sel-status')?.value;
    if (status) badges.push(status);
  }
  if (document.getElementById('m-tog-comment')?.classList.contains('active')) badges.push('comment');
  if (document.getElementById('m-tog-unit')?.classList.contains('active')) badges.push('unit');
  return badges;
}

function saveModal() {
  if (!editingNodeId) return;
  const node = N(editingNodeId);
  if (!node) { closeModal(); return; }
  pushUndo();
  node.type              = editingNewType ?? node.type;
  node.label             = (document.getElementById('m-inp-label')?.value   ?? '').trim();
  node.comment           =  document.getElementById('m-inp-comment')?.value ?? '';
  node.unit              = _getCurrentUnit();
  node.unitQty           = (document.getElementById('m-inp-unitqty')?.value ?? '').trim();
  node.badges            = _getActiveBadges();
  node.badgeOffsets      = { ..._editBadgeOffsets };
  node.badgeBorders      = { ..._editBadgeBorders };
  node.badgeColors       = { ..._editBadgeColors };
  node.badgeColorEnabled = { ..._editBadgeColorEnabled };
  node.labelBorder       = _editLabelBorder;
  node.labelShow         = _editLabelShow;
  // 改善データを保存
  if (isNumType(node.type)) {
    _flushImpFields(); // 現在フォーカスが当たっているフィールドの値を確定
    node.improvement = { before: { ..._editImpBefore }, after: { ..._editImpAfter } };
  }
  redraw();
  closeModal();
}

function deleteFromModal() {
  if (!editingNodeId) return;
  const id = editingNodeId;
  closeModal();
  S.sel = { kind:'node', id };
  deleteSel();
}

function modalKeydown(ev) {
  if (ev.key === 'Enter' && ev.target.tagName !== 'TEXTAREA') { ev.preventDefault(); saveModal(); }
  if (ev.key === 'Escape') { ev.preventDefault(); closeModal(); }
}

// ═══════════════════════════════════════════════
// 改善データ モーダルセクション
// ═══════════════════════════════════════════════

function _buildImpSection() {
  const before = _editImpBefore, after = _editImpAfter;
  const tab    = _editImpTab;
  const d      = tab === 'before' ? before : after;
  const mOpts  = machineMaster.map(m =>
    `<option value="${m.id}"${d.machineId === m.id ? ' selected' : ''}>${esc(m.name)}</option>`
  ).join('');
  const ct     = _impCycleTime(d);
  const cap    = ct > 0 ? Math.floor((capSettings.operatingTime * 60) / ct) : null;

  return `
  <div class="m-imp-hdr-inline">
    <div class="m-imp-tabs">
      <button class="m-imp-tab${tab === 'before' ? ' active' : ''}" onclick="switchImpTab('before')">改善前</button>
      <button class="m-imp-tab${tab === 'after'  ? ' active' : ''}" onclick="switchImpTab('after')">改善後</button>
    </div>
  </div>
  <div class="m-imp-body" id="m-imp-body">
    <div class="m-imp-top2c">
      <div class="m-imp-row">
        <label class="m-imp-lbl">ラベル上書き</label>
        <input type="text" class="m-inp m-imp-inp" id="m-imp-labelOverride"
          value="${esc(d.labelOverride)}" placeholder="（空欄 = 工程名を使用）"
          oninput="onImpField('labelOverride', this.value)">
      </div>
      <div class="m-imp-row">
        <label class="m-imp-lbl">機械</label>
        <div class="m-imp-machine-row">
          <select class="m-inp m-sel m-imp-sel" id="m-imp-machineId"
            onchange="onImpMachineChange(this.value)">
            <option value="">（なし）</option>
            ${mOpts}
          </select>
          <button class="m-imp-apply-btn" onclick="applyMachineTimes()" title="機械マスタの時間を適用">
            <i class="fa-solid fa-download"></i>
          </button>
        </div>
      </div>
    </div>
    <div class="m-imp-times">
      <div class="m-imp-time-cell">
        <label class="m-imp-lbl">手作業<span class="m-imp-unit">秒</span></label>
        <input type="number" class="m-inp m-imp-num" id="m-imp-manualTime"
          value="${d.manualTime}" min="0" step="1"
          oninput="onImpField('manualTime', +this.value); _refreshImpCalc()">
      </div>
      <div class="m-imp-time-cell">
        <label class="m-imp-lbl">自動送り<span class="m-imp-unit">秒</span></label>
        <input type="number" class="m-inp m-imp-num" id="m-imp-autoTime"
          value="${d.autoTime}" min="0" step="1"
          oninput="onImpField('autoTime', +this.value); _refreshImpCalc()">
      </div>
      <div class="m-imp-time-cell">
        <label class="m-imp-lbl">段取時間<span class="m-imp-unit">秒</span></label>
        <input type="number" class="m-inp m-imp-num" id="m-imp-toolChangeTime"
          value="${d.toolChangeTime}" min="0" step="1"
          oninput="onImpField('toolChangeTime', +this.value); _refreshImpCalc()">
      </div>
      <div class="m-imp-time-cell">
        <label class="m-imp-lbl">段取頻度<span class="m-imp-unit">個毎</span></label>
        <input type="number" class="m-inp m-imp-num" id="m-imp-toolChangeFrequency"
          value="${d.toolChangeFrequency}" min="1" step="1"
          oninput="onImpField('toolChangeFrequency', +this.value); _refreshImpCalc()">
      </div>
    </div>
    <div class="m-imp-calc" id="m-imp-calc">
      ${_buildImpCalcHTML(d)}
    </div>
  </div>`;
}

function _impCycleTime(d) {
  const freq = (d.toolChangeFrequency || 0) > 0 ? d.toolChangeFrequency : 100;
  return (d.manualTime || 0) + (d.autoTime || 0) + (d.toolChangeTime || 0) / freq;
}

function _buildImpCalcHTML(d) {
  const ct  = _impCycleTime(d);
  const cap = ct > 0 ? Math.floor((capSettings.operatingTime * 60) / ct) : null;
  const tt  = capSettings.targetQty > 0 ? (capSettings.operatingTime * 60 / capSettings.targetQty).toFixed(1) : '—';
  const capStr = cap !== null ? `${cap}個/日` : '—';
  const ratio  = cap !== null && capSettings.targetQty > 0 ? (cap / capSettings.targetQty * 100).toFixed(0) : null;
  const ok     = ratio !== null && parseFloat(ratio) >= 100;
  return `<span class="m-imp-ct">サイクルタイム: <b>${ct > 0 ? ct.toFixed(1) + 's' : '—'}</b></span>
          <span class="m-imp-sep">|</span>
          <span class="m-imp-cap${ok ? ' ok' : (cap !== null ? ' ng' : '')}">加工能力: <b>${capStr}</b>${ratio ? ` (${ratio}%)` : ''}</span>
          <span class="m-imp-sep">|</span>
          <span class="m-imp-tt">TT目安: <b>${tt}s</b></span>`;
}

/** 改善フォームのフィールド変更 */
function onImpField(key, val) {
  if (_editImpTab === 'before') _editImpBefore[key] = val;
  else                          _editImpAfter[key]  = val;
}

/** 機械選択変更 */
function onImpMachineChange(mid) {
  if (_editImpTab === 'before') _editImpBefore.machineId = mid || null;
  else                          _editImpAfter.machineId  = mid || null;
}

/** 機械マスタの時間を適用 */
function applyMachineTimes() {
  const d   = _editImpTab === 'before' ? _editImpBefore : _editImpAfter;
  const mid = document.getElementById('m-imp-machineId')?.value;
  if (!mid) return;
  const m = getMachine(mid);
  if (!m) return;
  d.machineId           = mid;
  d.manualTime          = m.manualTime;
  d.autoTime            = m.autoTime;
  d.toolChangeTime      = m.toolChangeTime;
  d.toolChangeFrequency = m.toolChangeFrequency;
  // フィールドに反映
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
  set('m-imp-manualTime',          m.manualTime);
  set('m-imp-autoTime',            m.autoTime);
  set('m-imp-toolChangeTime',      m.toolChangeTime);
  set('m-imp-toolChangeFrequency', m.toolChangeFrequency);
  _refreshImpCalc();
}

/** 計算結果エリアを更新 */
function _refreshImpCalc() {
  const d   = _editImpTab === 'before' ? _editImpBefore : _editImpAfter;
  const el  = document.getElementById('m-imp-calc');
  if (el) el.innerHTML = _buildImpCalcHTML(d);
}

/** モーダル内タブ切り替え前にフィールド値を確定 */
function _flushImpFields() {
  const get = id => { const el = document.getElementById(id); return el ? el.value : null; };
  const d   = _editImpTab === 'before' ? _editImpBefore : _editImpAfter;
  const lo  = get('m-imp-labelOverride');
  const mid = get('m-imp-machineId');
  const mt  = get('m-imp-manualTime');
  const at  = get('m-imp-autoTime');
  const ct  = get('m-imp-toolChangeTime');
  const cf  = get('m-imp-toolChangeFrequency');
  if (lo  !== null) d.labelOverride        = lo;
  if (mid !== null) d.machineId            = mid || null;
  if (mt  !== null) d.manualTime           = +mt;
  if (at  !== null) d.autoTime             = +at;
  if (ct  !== null) d.toolChangeTime       = +ct;
  if (cf  !== null) d.toolChangeFrequency  = +cf || 100;
}

/** 改善タブ切り替え（モーダル内） */
function switchImpTab(tab) {
  _flushImpFields();
  _editImpTab = tab;
  document.querySelectorAll('.m-imp-tab').forEach(b => b.classList.toggle('active', b.textContent.trim() === (tab === 'before' ? '改善前' : '改善後')));
  const body = document.getElementById('m-imp-body');
  if (!body) return;
  const d     = tab === 'before' ? _editImpBefore : _editImpAfter;
  const mOpts = machineMaster.map(m =>
    `<option value="${m.id}"${d.machineId === m.id ? ' selected' : ''}>${esc(m.name)}</option>`
  ).join('');
  body.innerHTML = `
    <div class="m-imp-top2c">
      <div class="m-imp-row">
        <label class="m-imp-lbl">ラベル上書き</label>
        <input type="text" class="m-inp m-imp-inp" id="m-imp-labelOverride"
          value="${esc(d.labelOverride)}" placeholder="（空欄 = 工程名を使用）"
          oninput="onImpField('labelOverride', this.value)">
      </div>
      <div class="m-imp-row">
        <label class="m-imp-lbl">機械</label>
        <div class="m-imp-machine-row">
          <select class="m-inp m-sel m-imp-sel" id="m-imp-machineId"
            onchange="onImpMachineChange(this.value)">
            <option value="">（なし）</option>
            ${mOpts}
          </select>
          <button class="m-imp-apply-btn" onclick="applyMachineTimes()" title="機械マスタの時間を適用">
            <i class="fa-solid fa-download"></i>
          </button>
        </div>
      </div>
    </div>
    <div class="m-imp-times">
      <div class="m-imp-time-cell">
        <label class="m-imp-lbl">手作業<span class="m-imp-unit">秒</span></label>
        <input type="number" class="m-inp m-imp-num" id="m-imp-manualTime"
          value="${d.manualTime}" min="0" step="1"
          oninput="onImpField('manualTime', +this.value); _refreshImpCalc()">
      </div>
      <div class="m-imp-time-cell">
        <label class="m-imp-lbl">自動送り<span class="m-imp-unit">秒</span></label>
        <input type="number" class="m-inp m-imp-num" id="m-imp-autoTime"
          value="${d.autoTime}" min="0" step="1"
          oninput="onImpField('autoTime', +this.value); _refreshImpCalc()">
      </div>
      <div class="m-imp-time-cell">
        <label class="m-imp-lbl">段取時間<span class="m-imp-unit">秒</span></label>
        <input type="number" class="m-inp m-imp-num" id="m-imp-toolChangeTime"
          value="${d.toolChangeTime}" min="0" step="1"
          oninput="onImpField('toolChangeTime', +this.value); _refreshImpCalc()">
      </div>
      <div class="m-imp-time-cell">
        <label class="m-imp-lbl">段取頻度<span class="m-imp-unit">個毎</span></label>
        <input type="number" class="m-inp m-imp-num" id="m-imp-toolChangeFrequency"
          value="${d.toolChangeFrequency}" min="1" step="1"
          oninput="onImpField('toolChangeFrequency', +this.value); _refreshImpCalc()">
      </div>
    </div>
    <div class="m-imp-calc" id="m-imp-calc">
      ${_buildImpCalcHTML(d)}
    </div>`;
}

// ═══════════════════════════════════════════════
// 能力表ビュー
// ═══════════════════════════════════════════════

// ── 能力表: 選択状態 ──────────────────────────────
let _capSelChartId  = null;   // null = アクティブチャート
let _capSelGroupId  = null;   // null = 全グループ
let _capSideOpen    = new Set(); // 展開中チャートID

// ── サイドバー更新 ────────────────────────────────
function updateCapSidebar() {
  const el = document.getElementById('cap-chart-list');
  if (!el) return;
  if (!W.charts.length) {
    el.innerHTML = '<p style="padding:12px;font-size:11px;color:#94a3b8;text-align:center">工程図がありません</p>';
    return;
  }

  const activeCid = _capSelChartId || W.activeId;

  el.innerHTML = W.charts.map(c => {
    const isEdit   = c.id === W.activeId;
    const isSel    = c.id === activeCid;
    const isOpen   = _capSideOpen.has(c.id);
    let nodes, groups;
    if (isEdit) {
      nodes  = S.nodes;
      groups = S.groups;
    } else {
      const cd = getChartData(c);
      nodes  = cd.nodes;
      groups = cd.groups;
    }
    const numNodes = nodes.filter(n => isNumType(n.type)).length;

    const groupChips = groups.map(g => {
      const cnt  = nodes.filter(n => n.groupId === g.id && isNumType(n.type)).length;
      if (!cnt) return '';
      const gSel = isSel && _capSelGroupId === g.id;
      const gc   = g.color || '#94a3b8';
      const dotStyle = `background:${gc}${gSel ? `;box-shadow:0 0 0 2px #fff,0 0 0 3.5px ${gc}` : ''}`;
      const chipStyle = gSel ? `box-shadow:inset 3px 0 0 ${gc}` : '';
      return `<div class="cap-grp-chip${gSel ? ' selected' : ''}" style="${chipStyle}"
        onclick="event.stopPropagation();selectCapGroup('${c.id}','${g.id}')">
        <span class="cap-grp-dot" style="${dotStyle}"></span>
        <span class="cap-grp-lbl">${esc(g.label||'グループ')}</span>
        <span class="cap-grp-cnt${gSel ? ' sel' : ''}">${cnt}</span>
        ${gSel ? '<i class="fa-solid fa-eye cap-grp-sel-icon"></i>' : '<span class="cap-grp-sel-icon-ph"></span>'}
      </div>`;
    }).join('');

    return `<div class="cap-chart-item${isSel ? ' selected' : ''}${isEdit ? ' editing' : ''}">
      <div class="cap-chart-item-hdr" onclick="selectCapChart('${c.id}')">
        <span class="cap-chart-item-dot" style="background:${isEdit ? '#6366f1' : '#cbd5e1'}" title="${isEdit ? '編集中' : ''}"></span>
        <span class="cap-chart-item-name" title="${esc(c.name)}">${esc(c.name)}</span>
        <span class="cap-chart-item-cnt">${numNodes}</span>
        ${groups.length > 0 ? `<button class="cap-chart-item-chv"
          onclick="event.stopPropagation();toggleCapChartOpen('${c.id}')">
          <i class="fa-solid fa-chevron-${isOpen ? 'up' : 'down'}"></i>
        </button>` : ''}
      </div>
      ${isOpen && groupChips ? `<div class="cap-grp-chips">${groupChips}</div>` : ''}
    </div>`;
  }).join('');
}

function selectCapChart(cid) {
  _capSelChartId = cid;
  _capSelGroupId = null;
  updateCapacityView();
}
function selectCapGroup(cid, gid) {
  const wasSame = _capSelChartId === cid && _capSelGroupId === gid;
  _capSelChartId = cid;
  _capSelGroupId = wasSame ? null : gid;
  updateCapacityView();
}
function toggleCapChartOpen(cid) {
  if (_capSideOpen.has(cid)) _capSideOpen.delete(cid);
  else _capSideOpen.add(cid);
  updateCapSidebar();
}

// ── 能力表メイン更新 ──────────────────────────────
function updateCapacityView() {
  const el = document.getElementById('cap-view-body');
  if (!el) return;

  const opTime  = capSettings.operatingTime;
  const tgtQty  = capSettings.targetQty;
  const taktSec = tgtQty > 0 ? (opTime * 60 / tgtQty) : null;

  // 設定UI反映
  const elOp = document.getElementById('cap-input-optime');
  const elQt = document.getElementById('cap-input-tgtqty');
  const elTT = document.getElementById('cap-takt-val');
  if (elOp) elOp.value = opTime;
  if (elQt) elQt.value = tgtQty;
  if (elTT) elTT.textContent = taktSec !== null ? _capFmtSec(taktSec) + '/個' : '—';

  // 改善前後バッジ更新
  const mb = document.getElementById('cap-mode-badge');
  if (mb) {
    const isAfter = improvementMode === 'after';
    mb.textContent    = isAfter ? '改善後' : '改善前';
    mb.style.background  = isAfter ? '#dbeafe' : '#fef9c3';
    mb.style.color       = isAfter ? '#1d4ed8' : '#a16207';
    mb.style.borderColor = isAfter ? '#bfdbfe' : '#fde68a';
  }
  document.querySelectorAll('.imp-mode-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.mode === improvementMode)
  );

  // サイドバー更新
  updateCapSidebar();

  // 表示対象チャート
  const targetCid = _capSelChartId || W.activeId;
  const chart     = W.charts.find(c => c.id === targetCid);
  if (!chart) {
    el.innerHTML = '<div class="cap-empty"><i class="fa-solid fa-chart-simple"></i><p>工程図が選択されていません</p></div>';
    return;
  }

  const isActive  = chart.id === W.activeId;
  let nodes, listOrder, groups;
  if (isActive) {
    nodes     = S.nodes;
    listOrder = S.listOrder;
    groups    = S.groups;
  } else {
    const cd  = getChartData(chart);
    nodes     = cd.nodes;
    listOrder = cd.listOrder;
    groups    = cd.groups;
  }

  // seq番号計算（グループ単位でリセット — computeNums() と同じ方式）
  const numMap = {};
  if (groups.length > 0) {
    const grouped = new Set();
    for (const g of groups) {
      let cnt = 0;
      listOrder.forEach(id => {
        const n = nodes.find(x => x.id === id);
        if (n && n.groupId === g.id) {
          grouped.add(id);
          if (isNumType(n.type)) numMap[id] = ++cnt;
        }
      });
    }
    // グループ未所属ノード
    let cnt = 0;
    listOrder.forEach(id => {
      const n = nodes.find(x => x.id === id);
      if (n && !grouped.has(id) && isNumType(n.type)) numMap[id] = ++cnt;
    });
  } else {
    let cnt = 0;
    listOrder.forEach(id => {
      const n = nodes.find(x => x.id === id);
      if (n && isNumType(n.type)) numMap[id] = ++cnt;
    });
  }

  let dispGroups = groups.length ? groups : [{ id: null, label: 'グループなし', color: '#94a3b8' }];
  if (_capSelGroupId) dispGroups = dispGroups.filter(g => g.id === _capSelGroupId);

  // 全行から最大スケール決定（tgtQty * 3 をベースにキリの良い数値へ切り上げ）
  function _niceMax(raw) {
    if (raw <= 0) return 100;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    // mag 単位の「キリの良い」倍率：1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10
    for (const f of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) {
      const candidate = mag * f;
      if (candidate >= raw) return candidate;
    }
    return mag * 10;
  }
  // ── スケール基準：全グループの tgtQty の最大値で統一（比較しやすさ優先） ──
  const allGrpQty  = dispGroups.map(g => getGroupCapSettings(g.id).targetQty);
  const maxTgtQty  = Math.max(...allGrpQty, tgtQty);
  const maxScale   = _niceMax(maxTgtQty * 3);
  const tickStep   = maxTgtQty > 0 ? Math.ceil(maxTgtQty / 2 / 10) * 10 : 50;

  // 作業時間バー最大スケール（全グループのタクト・実測値から最大値算出）
  let wtMaxScale = taktSec ? taktSec * 2 : 300;
  for (const g of dispGroups) {
    const { operatingTime: gOT, targetQty: gQT } = getGroupCapSettings(g.id);
    const gTaktSec = gQT > 0 ? gOT * 60 / gQT : null;
    if (gTaktSec) wtMaxScale = Math.max(wtMaxScale, gTaktSec * 2);
    listOrder.map(id => nodes.find(n => n.id === id))
      .filter(n => n && n.groupId === g.id && isNumType(n.type))
      .forEach(n => {
        const imp = getNodeImpData(n);
        if (imp) wtMaxScale = Math.max(wtMaxScale, (imp.manualTime + imp.autoTime) * 1.3);
      });
  }

  // スケール目盛りHTML（グループ別 reqLinePct を引数で受け取る）
  function _makeScaleHTML(grpBottleneck, gReqLinePct, gTgtQty) {
    let tHTML = `<span class="cap-tick cap-tick-edge" style="left:0%">0</span>`;
    for (let v = tickStep; v < maxScale; v += tickStep) {
      const pct     = (v / maxScale * 100).toFixed(2);
      const nearReq = gTgtQty > 0 && Math.abs(v - gTgtQty) / maxScale < 0.06;
      const nearGrp = grpBottleneck !== null && Math.abs(v - grpBottleneck) / maxScale < 0.06;
      if (!nearReq && !nearGrp) tHTML += `<span class="cap-tick" style="left:${pct}%">${v}</span>`;
    }
    tHTML += `<span class="cap-tick cap-tick-edge" style="left:100%">${maxScale}</span>`;
    if (gReqLinePct) tHTML += `<span class="cap-tick cap-tick-req" style="left:${gReqLinePct}%"><span class="cap-tick-lbl">必要数</span>${gTgtQty}</span>`;
    if (grpBottleneck !== null && maxScale > 0 && grpBottleneck <= maxScale) {
      const grpPct = (grpBottleneck / maxScale * 100).toFixed(2);
      tHTML += `<span class="cap-tick cap-tick-grp-cap" style="left:${grpPct}%"><span class="cap-tick-lbl">加工能力</span>${grpBottleneck}</span>`;
    }
    return tHTML;
  }

  // グリッド線HTML（グループ別 reqLinePct を引数で受け取る）
  function _makeGridLinesHTML(grpBottleneck, gReqLinePct) {
    let g = '';
    for (let v = 0; v <= maxScale; v += tickStep) {
      const pct = (v / maxScale * 100).toFixed(2);
      g += `<div class="cap-grid-tick-line" style="left:${pct}%"></div>`;
    }
    if (gReqLinePct) g += `<div class="cap-grid-req-line" style="left:${gReqLinePct}%"></div>`;
    if (grpBottleneck !== null && maxScale > 0 && grpBottleneck <= maxScale) {
      const grpPct = (grpBottleneck / maxScale * 100).toFixed(2);
      g += `<div class="cap-grid-grp-cap-line" style="left:${grpPct}%"></div>`;
    }
    return g;
  }

  // ── グループ別行生成 ──
  let bodyHTML = '';
  for (const g of dispGroups) {
    const gNodes = listOrder
      .map(id => nodes.find(n => n.id === id))
      .filter(n => n && n.groupId === g.id && isNumType(n.type));
    if (!gNodes.length) continue;

    // ── グループ別設定（グローバルへのフォールバック付き） ──
    const gCfg        = getGroupCapSettings(g.id);
    const gOpTime     = gCfg.operatingTime;
    const gTgtQty     = gCfg.targetQty;
    const gTaktSec    = gTgtQty > 0 ? gOpTime * 60 / gTgtQty : null;
    const gReqLinePct = gTgtQty > 0 ? (gTgtQty / maxScale * 100).toFixed(2) : null;
    const gTaktLinePct= (gTaktSec && wtMaxScale > 0) ? (gTaktSec / wtMaxScale * 100).toFixed(2) : null;
    const gTaktStr    = gTaktSec !== null ? _capFmtSec(gTaktSec) + '/個' : '—';
    const hasOverride = gCfg.hasOpOverride || gCfg.hasQtyOverride;

    const machine = g.assignedMachineId ? getMachine(g.assignedMachineId) : null;

    // グループ単位ボトルネック計算（自動送りあり工程のみ）
    const grpCaps = gNodes.map(n => {
      const imp = getNodeImpData(n);
      if (!imp || imp.autoTime === 0) return null;  // 手作業のみは能力計算対象外
      if (imp.manualTime === 0 && imp.autoTime === 0) return null;
      return calcCapacity(imp, gOpTime);
    }).filter(c => c !== null);
    const grpBottleneck = grpCaps.length ? Math.floor(Math.min(...grpCaps)) : null;

    // グループ合計人工（全工程の人が作業する時間を合算）
    const totalManko = gNodes.reduce((sum, n) => {
      const v = _calcManko(getNodeImpData(n), gOpTime, gTgtQty);
      return sum + (v ?? 0);
    }, 0);
    const totalMankoStr = totalManko > 0 ? _fmtManko(totalManko) : null;

    // 合計人工バッジ（ヘッダーの能力列に表示）
    const mankoBadge = totalMankoStr
      ? `<span class="cap-grp-manko-total" title="全工程の手作業・刃具交換にかかる合計人工">
           合計 ${totalMankoStr} 人工
         </span>` : '';

    // グループ別設定UI（カード上部折り畳みパネル用）
    const gCfgPanelId = `cap-gcfg-${g.id}`;
    const gCfgPanel = g.id ? `
      <div class="cap-gcfg-panel${hasOverride ? ' cap-gs-overridden' : ''}" id="${gCfgPanelId}">
        <div class="cap-gcfg-inner">
          <div class="cap-gs-item${gCfg.hasOpOverride ? ' cap-gs-item-ov' : ''}">
            <label class="cap-gs-lbl"><i class="fa-solid fa-clock"></i>稼働時間</label>
            <input type="number" class="cap-gs-inp" value="${gOpTime}" min="1" step="1"
              onchange="onGroupCapSetting('${g.id}','operatingTime',this.value)"
              title="グループ別稼働時間（分/日）">
            <span class="cap-gs-unit">分/日</span>
          </div>
          <div class="cap-gs-item${gCfg.hasQtyOverride ? ' cap-gs-item-ov' : ''}">
            <label class="cap-gs-lbl"><i class="fa-solid fa-bullseye"></i>必要数</label>
            <input type="number" class="cap-gs-inp" value="${gTgtQty}" min="1" step="1"
              onchange="onGroupCapSetting('${g.id}','targetQty',this.value)"
              title="グループ別必要数（個/日）">
            <span class="cap-gs-unit">個/日</span>
          </div>
          <div class="cap-gs-takt">
            <i class="fa-solid fa-stopwatch"></i>
            <span class="cap-gs-takt-lbl">タクト</span>
            <span class="cap-gs-takt-val">${gTaktStr}</span>
          </div>
          ${hasOverride ? `<button class="cap-gs-reset" onclick="resetGroupCapSetting('${g.id}')" title="グローバル設定に戻す">
            <i class="fa-solid fa-rotate-left"></i> リセット
          </button>` : ''}
        </div>
      </div>` : '';

    // トグルボタン（グループ名の右横に配置）
    const gCfgToggle = g.id ? `
      <button class="cap-gcfg-toggle${hasOverride ? ' cap-gcfg-toggle-ov' : ''}"
        onclick="toggleCapGroupCfg('${g.id}')"
        title="グループ設定（稼働時間・必要数）を表示/非表示">
        <i class="fa-solid fa-sliders"></i>
        ${hasOverride ? '<span class="cap-gcfg-ov-dot"></span>' : ''}
      </button>` : '';

    bodyHTML += `<div class="cap-group-block">
      ${gCfgPanel}
      <div class="cap-group-hdr" style="box-shadow:inset 3px 0 0 ${g.color||'#94a3b8'}">
        <div class="cap-col-left cap-group-left">
          <div class="cap-group-info">
            <div class="cap-group-name" style="color:${g.color||'#94a3b8'}">
              <i class="fa-solid fa-layer-group"></i> ${esc(g.label || 'グループ')}
              ${gCfgToggle}
            </div>
            <div class="cap-group-machine">${machine
              ? `<i class="fa-solid fa-gears"></i> ${esc(machine.name)}`
              : '<span style="color:#94a3b8">機械未設定</span>'}</div>
          </div>
        </div>
        <div class="cap-col-metrics cap-group-metrics-hdr">
          <span class="cap-mhdr cap-mhdr-blue">加工時間</span>
          <span class="cap-mhdr cap-mhdr-orange">刃具/個</span>
          <span class="cap-mhdr cap-mhdr-purple">合計時間</span>
          <div class="cap-mhdr cap-mhdr-green cap-mhdr-cap-col">
            ${grpBottleneck !== null ? `<span class="cap-grp-bn-val">${grpBottleneck}個/日</span>` : ''}
            ${mankoBadge}
            <span class="cap-mhdr-lbl-text">${grpBottleneck !== null ? '加工能力' : '人工'}</span>
          </div>
        </div>
        <div class="cap-col-bar cap-group-bar-hdr">
          <div class="cap-bar-scale-row">
            <div class="cap-bar-scale">${_makeScaleHTML(grpBottleneck, gReqLinePct, gTgtQty)}</div>
          </div>
        </div>
        <div class="cap-col-wt cap-group-wt-hdr">
          <div class="cap-wt-hdr-lbl">
            <span class="cap-wt-hdr-main">作業時間</span>${gTaktLinePct ? `<span class="cap-wt-hdr-takt">タクト&nbsp;${_capFmtSec(gTaktSec)}</span>` : ''}
          </div>
        </div>
      </div>
      <div class="cap-group-rows">
        <div class="cap-group-grid" aria-hidden="true">${_makeGridLinesHTML(grpBottleneck, gReqLinePct)}</div>`;
    for (const node of gNodes) {
      bodyHTML += _capRowHTML(node, numMap[node.id] ?? '—', gOpTime, gTgtQty, maxScale, gTaktSec, wtMaxScale, targetCid);
    }
    bodyHTML += `</div></div>`;
  }

  if (!bodyHTML) {
    el.innerHTML = '<div class="cap-empty"><i class="fa-solid fa-chart-simple"></i><p>加工・検査工程がありません</p></div>';
    return;
  }

  el.innerHTML = `<div class="cap-tbl"><div class="cap-tbl-body">${bodyHTML}</div></div>`;
  // レンダリング後に実ピクセル座標でスケール目盛りをデータバーに厳密一致させる
  requestAnimationFrame(() => {
    _capAlignScaleToBars(el);
    _capSetupScaleObserver(el);
  });
}

// ── 能力表：スケール目盛りをデータバーにピクセル単位で厳密一致 ──────────
// フレックスレイアウトのサブピクセル丸め・画面スケール(125%等)によるズレを
// getBoundingClientRect() 実測値で補正する。
let _capScaleRO = null; // ResizeObserver インスタンス

function _capAlignScaleToBars(el) {
  el.querySelectorAll('.cap-group-block').forEach(block => {
    const scale    = block.querySelector('.cap-bar-scale');
    const barInner = block.querySelector('.cap-bar-inner');
    if (!scale || !barInner) return;

    const parent = scale.parentElement;          // cap-group-bar-hdr
    const pr = parent.getBoundingClientRect();
    const br = barInner.getBoundingClientRect();
    if (br.width < 1) return;

    // スケールの left/right をデータバーの実ピクセル位置に合わせる
    scale.style.left  = (br.left  - pr.left ) + 'px';
    scale.style.right = (pr.right - br.right) + 'px';
  });
}

function _capSetupScaleObserver(el) {
  if (_capScaleRO) _capScaleRO.disconnect();
  const tbl = el.querySelector('.cap-tbl');
  if (!tbl) return;
  _capScaleRO = new ResizeObserver(() => _capAlignScaleToBars(el));
  _capScaleRO.observe(tbl);
}

// 秒 → "2m30s" 表示
function _capFmtSec(sec) {
  if (!sec || sec <= 0) return '—';
  const s = Math.round(sec), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  return (h ? h + 'h' : '') + (m ? m + 'm' : '') + ((!h && ss) || (!h && !m) ? ss + 's' : '');
}

/**
 * 人工計算: 必要数を生産するために人が作業に費やす時間の割合（稼働時間=1人工）
 * @returns {number|null}
 */
function _calcManko(imp, opMin, tgtQty) {
  if (!imp || !tgtQty || !opMin) return null;
  const tcPerUnit = (imp.toolChangeTime || 0) / Math.max(imp.toolChangeFrequency || 100, 1);
  const humanSec  = (imp.manualTime || 0) + tcPerUnit;
  return humanSec > 0 ? (humanSec * tgtQty) / (opMin * 60) : null;
}

/** 人工値を "X.XX" 形式でフォーマット */
function _fmtManko(v) {
  if (v === null || v === undefined) return '—';
  if (v < 0.01) return '<0.01';
  return v.toFixed(2);
}

function _capRowHTML(node, seq, opTime, tgtQty, maxScale, taktSec, wtMaxScale, chartId) {
  const imp    = getNodeImpData(node);
  const lbl    = getEffectiveLabel(node) || SYMS[node.type]?.name || '';
  const noData = !imp || (imp.manualTime === 0 && imp.autoTime === 0 && imp.toolChangeTime === 0);

  // ── メトリクス計算 ──
  const manualTime  = imp ? (imp.manualTime  || 0) : 0;
  const autoTime    = imp ? (imp.autoTime    || 0) : 0;
  const tcTime      = imp ? (imp.toolChangeTime || 0) : 0;
  const tcFreq      = imp ? Math.max(imp.toolChangeFrequency || 100, 1) : 100;
  const tcPerUnit   = tcTime / tcFreq;
  const processingTime = manualTime + autoTime;
  const cycleTime   = processingTime + tcPerUnit;
  const hasAutoTime = autoTime > 0;

  // 加工能力（自動送りがある場合のみ有効）
  const cap   = (!noData && hasAutoTime && cycleTime > 0)
    ? Math.floor((opTime * 60) / cycleTime) : null;

  // 人工（人が作業する時間 / 稼働時間 × 必要数）
  const manko = _calcManko(imp, opTime, tgtQty);

  // ステータス判定（自動送りあり・加工能力ありのとき）
  const ratio = (cap !== null && tgtQty > 0) ? Math.round(cap / tgtQty * 100) : null;
  let statusCls = '', statusLbl = '';
  if (ratio !== null) {
    if      (ratio > 120) { statusCls = 'surplus'; statusLbl = '能力追剰'; }
    else if (ratio >= 100){ statusCls = 'ok';      statusLbl = '適正';    }
    else                  { statusCls = 'ng';      statusLbl = '能力不足'; }
  }

  // ── 能力バー（自動送りがある場合のみ描画）──
  let barContainerH = 16;
  let barInnerHTML  = '';

  if (!noData && hasAutoTime && cap !== null && maxScale > 0 && tgtQty > 0) {
    const reqPct = tgtQty / maxScale * 100;
    if (cap <= tgtQty) {
      const bw = (cap / maxScale * 100).toFixed(2);
      barInnerHTML = `<div class="cap-bar-blue" style="width:${bw}%;height:16px"></div>`;
    } else {
      const overflow      = cap - tgtQty;
      const overflowPerRow = (1 - reqPct / 100) * maxScale;
      const redBarCount   = overflowPerRow > 0 ? Math.ceil(overflow / overflowPerRow) : 1;
      const maxBars       = Math.min(1 + redBarCount, 6);
      if (redBarCount <= 2) {
        const BH = 16, GAP = 2;
        barInnerHTML += `<div class="cap-bar-blue" style="width:${reqPct.toFixed(2)}%;top:0;height:${BH}px"></div>`;
        let rem = overflow;
        for (let i = 0; i < redBarCount; i++) {
          const segCap = Math.min(rem, overflowPerRow);
          const sw     = (segCap / maxScale * 100).toFixed(2);
          const topPx  = i * (BH + GAP);
          barInnerHTML += `<div class="cap-bar-red" style="width:${sw}%;left:${reqPct.toFixed(2)}%;top:${topPx}px;height:${BH}px"></div>`;
          rem -= segCap; barContainerH = topPx + BH;
        }
      } else {
        const TOTAL_H = 44, SP = 1;
        const bh = Math.max(4, Math.floor((TOTAL_H - SP * (maxBars - 1)) / maxBars));
        barInnerHTML += `<div class="cap-bar-blue" style="width:${reqPct.toFixed(2)}%;top:0;height:${bh}px"></div>`;
        let rem = overflow;
        for (let i = 0; i < maxBars - 1 && rem > 0; i++) {
          const segCap = Math.min(rem, overflowPerRow);
          const sw     = (segCap / maxScale * 100).toFixed(2);
          const topPx  = i * (bh + SP);
          const op     = Math.max(0.7, 1 - i * 0.08).toFixed(2);
          barInnerHTML += `<div class="cap-bar-red" style="width:${sw}%;left:${reqPct.toFixed(2)}%;top:${topPx}px;height:${bh}px;opacity:${op}"></div>`;
          rem -= segCap; barContainerH = topPx + bh;
        }
        if (rem > 0) { barInnerHTML += `<span class="cap-bar-overflow-mark">…</span>`; barContainerH += 10; }
      }
    }
  }

  const barTall = barContainerH > 16;

  // ── 作業時間バー ──
  const wtScale     = wtMaxScale > 0 ? wtMaxScale : 300;
  const manualPct   = Math.min(manualTime / wtScale * 100, 100).toFixed(2);
  const autoPct     = Math.min(autoTime   / wtScale * 100, 100).toFixed(2);
  const autoOff     = Math.min(manualTime / wtScale * 100, 100).toFixed(2);
  const taktLinePct = (taktSec && wtScale > 0) ? (taktSec / wtScale * 100).toFixed(2) : null;

  // ── メトリクス表示値 ──
  const ptStr   = noData ? '—' : _capFmtSec(processingTime);
  const tcStr   = noData ? '—' : (tcPerUnit > 0 ? _capFmtSec(tcPerUnit) : '—');
  const tcRaw   = noData ? '' : (tcTime > 0 ? `(${_capFmtSec(tcTime)})` : '');
  const ctStr   = noData ? '—' : _capFmtSec(cycleTime);
  const capStr  = cap !== null ? `${cap}個/日` : null;
  const wtLbl   = noData ? '' : `手:${_capFmtSec(manualTime)} 自:${_capFmtSec(autoTime)}`;
  const ctSub   = cycleTime > 0 && !noData
    ? `CT:${_capFmtSec(cycleTime)}${tcFreq < 999 ? ` 交換:${tcFreq}個毎` : ''}` : '';

  // ── 能力列の表示内容（自動送りあり→能力、手作業のみ→人工）──
  let capCellHTML;
  if (noData) {
    capCellHTML = `<span class="cap-metric-val cap-mv-none">—</span>`;
  } else if (!hasAutoTime) {
    // 手作業のみ: 加工能力なし → 人工で表現
    const mankoStr = _fmtManko(manko);
    capCellHTML = `
      <span class="cap-metric-val cap-mv-manko">${mankoStr}</span>
      <span class="cap-manko-unit">人工</span>`;
  } else {
    // 自動送りあり: 加工能力（個/日）+ ステータス
    capCellHTML = `
      <span class="cap-metric-val cap-mv-green">${capStr ?? '—'}</span>
      ${statusLbl ? `<span class="cap-status-badge ${statusCls}">${statusLbl}</span>` : ''}`;
  }

  return `<div class="cap-row${!hasAutoTime && !noData ? ' cap-row-manual' : ''}"
    ondblclick="openCapImpModal('${node.id}','${chartId || ''}')"
    title="ダブルクリックして時間データを編集">
    <div class="cap-col-left">
      <span class="cap-seq">${seq}</span>
      <div class="cap-lbl-wrap">
        <span class="cap-lbl">${esc(lbl)}</span>
        ${ctSub ? `<span class="cap-sub">${esc(ctSub)}</span>` : ''}
      </div>
    </div>
    <div class="cap-col-metrics">
      <div class="cap-metric-cell">
        <span class="cap-metric-val cap-mv-blue">${ptStr}</span>
      </div>
      <div class="cap-metric-cell">
        <span class="cap-metric-val cap-mv-orange">${tcStr}</span>
        ${tcRaw ? `<span class="cap-metric-sub">${tcRaw}</span>` : ''}
      </div>
      <div class="cap-metric-cell">
        <span class="cap-metric-val cap-mv-purple">${ctStr}</span>
      </div>
      <div class="cap-metric-cell cap-metric-cap-cell">
        ${capCellHTML}
      </div>
    </div>
    <div class="${barTall ? 'cap-col-bar cap-col-bar--tall' : 'cap-col-bar'}">
      <div class="cap-bar-inner" style="height:${barContainerH}px">
        ${barInnerHTML}
      </div>
    </div>
    <div class="cap-col-wt">
      <div class="cap-wt-inner">
        <div class="cap-wt-lbl">${wtLbl}</div>
        <div class="cap-wt-track">
          ${taktLinePct ? `<div class="cap-wt-takt-line" style="left:${taktLinePct}%"></div>` : ''}
          ${+manualPct > 0 ? `<div class="cap-wt-manual" style="width:${manualPct}%"></div>` : ''}
          ${+autoPct   > 0 ? `<div class="cap-wt-auto"   style="width:${autoPct}%;left:${autoOff}%"></div>` : ''}
        </div>
      </div>
    </div>
  </div>`;
}
function onCapSetting(key, val) {
  capSettings[key] = parseFloat(val) || 0;
  _saveGlobalSettings();
  updateCapacityView();
}

// ── グループ別設定ヘルパー ────────────────────────────────
/** グループIDに対応する実効設定を返す（override > global のフォールバック） */
function getGroupCapSettings(groupId) {
  const ov = (groupId && capSettings.groupOverrides) ? capSettings.groupOverrides[groupId] : null;
  return {
    operatingTime: ov?.operatingTime ?? capSettings.operatingTime,
    targetQty:     ov?.targetQty     ?? capSettings.targetQty,
    hasOpOverride: ov?.operatingTime != null,
    hasQtyOverride: ov?.targetQty   != null,
  };
}

/** グループ別稼働時間・必要数の変更ハンドラ */
function onGroupCapSetting(groupId, key, val) {
  if (!groupId) return;
  if (!capSettings.groupOverrides) capSettings.groupOverrides = {};
  const numVal = parseFloat(val);
  if (!capSettings.groupOverrides[groupId]) capSettings.groupOverrides[groupId] = {};
  if (!isNaN(numVal) && numVal > 0) {
    capSettings.groupOverrides[groupId][key] = numVal;
  } else {
    delete capSettings.groupOverrides[groupId][key];
    if (!Object.keys(capSettings.groupOverrides[groupId]).length) delete capSettings.groupOverrides[groupId];
  }
  _saveGlobalSettings();
  updateCapacityView();
}

/** グループ別設定をグローバル値にリセット */
function resetGroupCapSetting(groupId) {
  if (!groupId || !capSettings.groupOverrides) return;
  delete capSettings.groupOverrides[groupId];
  _saveGlobalSettings();
  updateCapacityView();
}

/** グループ設定パネルの折り畳みトグル */
function toggleCapGroupCfg(groupId) {
  const panel = document.getElementById('cap-gcfg-' + groupId);
  if (!panel) return;
  const isOpen = panel.classList.toggle('open');
  // トグルボタンのアクティブ状態を同期
  const btn = panel.closest('.cap-group-block')?.querySelector('.cap-gcfg-toggle');
  if (btn) btn.classList.toggle('active', isOpen);
}

// ═══════════════════════════════════════════════
// 能力表専用データ入力モーダル
// ═══════════════════════════════════════════════

let _capImpNodeId  = null;
let _capImpChartId = null;
let _capImpTab     = 'before';
let _capImpBefore  = null;
let _capImpAfter   = null;

function openCapImpModal(nodeId, chartId) {
  // ノードを取得（アクティブチャートは S.nodes、それ以外は W.charts から）
  const isActive = !chartId || chartId === W.activeId;
  const nodeList = isActive ? S.nodes : (W.charts.find(c => c.id === chartId)?.nodes || []);
  const node     = nodeList.find(n => n.id === nodeId);
  if (!node || !isNumType(node.type)) return;

  _capImpNodeId  = nodeId;
  _capImpChartId = chartId || W.activeId;
  _capImpTab     = improvementMode;

  const imp = node.improvement || {};
  _capImpBefore = { ..._IMP_DEF(), ...(imp.before || {}) };
  _capImpAfter  = { ..._IMP_DEF(), ...(imp.after  || {}) };

  _renderCapImpModal(node);
  document.getElementById('cap-imp-modal').classList.add('show');
}

function closeCapImpModal() {
  document.getElementById('cap-imp-modal').classList.remove('show');
  _capImpNodeId = _capImpChartId = null;
  _clearLiveImpPreview();
  if (currentView === 'capacity') updateCapacityView();
}

function _renderCapImpModal(nodeArg) {
  const isActive = _capImpChartId === W.activeId;
  const nodeList = isActive ? S.nodes : (W.charts.find(c => c.id === _capImpChartId)?.nodes || []);
  const node     = nodeArg || nodeList.find(n => n.id === _capImpNodeId);
  if (!node) return;

  const lbl  = getEffectiveLabel(node) || SYMS[node.type]?.name || '';
  const tab  = _capImpTab;
  const d    = tab === 'before' ? _capImpBefore : _capImpAfter;

  // タイトル更新
  const ttl = document.getElementById('cap-imp-modal-title');
  if (ttl) ttl.textContent = lbl;

  // タブボタン更新
  document.querySelectorAll('.cap-imp-tab').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === tab)
  );

  const body = document.getElementById('cap-imp-modal-body');
  if (!body) return;

  const mOpts = machineMaster.map(m =>
    `<option value="${m.id}"${d.machineId === m.id ? ' selected' : ''}>${esc(m.name)}</option>`
  ).join('');

  const ct    = _impCycleTime(d);
  const cap   = ct > 0 ? Math.floor((capSettings.operatingTime * 60) / ct) : null;
  const tt    = capSettings.targetQty > 0 ? (capSettings.operatingTime * 60 / capSettings.targetQty).toFixed(1) : '—';
  const ratio = cap !== null && capSettings.targetQty > 0 ? Math.round(cap / capSettings.targetQty * 100) : null;
  const stCls = ratio === null ? '' : ratio > 120 ? 'surplus' : ratio >= 100 ? 'ok' : 'ng';
  const stLbl = ratio === null ? '' : ratio > 120 ? '能力追剰' : ratio >= 100 ? '適正' : '能力不足';

  body.innerHTML = `
    <div class="ci-machine-row">
      <label class="ci-lbl"><i class="fa-solid fa-gears"></i> 機械</label>
      <div class="ci-machine-inp">
        <select class="m-inp m-sel ci-sel" id="ci-machineId" onchange="onCapImpMachineChange(this.value)">
          <option value="">（なし）</option>
          ${mOpts}
        </select>
        <button class="m-imp-apply-btn" onclick="applyCapImpMachine()" title="機械マスタの時間を適用">
          <i class="fa-solid fa-download"></i>
        </button>
      </div>
    </div>
    <div class="ci-times">
      <div class="ci-time-cell">
        <label class="ci-lbl"><i class="fa-solid fa-hand" style="color:#334155"></i> 手作業</label>
        <div class="ci-time-inp-wrap">
          <input type="number" class="m-inp ci-num" id="ci-manualTime"
            value="${d.manualTime}" min="0" step="1"
            oninput="onCapImpField('manualTime',+this.value);refreshCapImpCalc()">
          <span class="ci-unit">秒</span>
        </div>
      </div>
      <div class="ci-time-cell">
        <label class="ci-lbl"><i class="fa-solid fa-robot" style="color:#6366f1"></i> 自動送り</label>
        <div class="ci-time-inp-wrap">
          <input type="number" class="m-inp ci-num" id="ci-autoTime"
            value="${d.autoTime}" min="0" step="1"
            oninput="onCapImpField('autoTime',+this.value);refreshCapImpCalc()">
          <span class="ci-unit">秒</span>
        </div>
      </div>
      <div class="ci-time-cell">
        <label class="ci-lbl"><i class="fa-solid fa-screwdriver-wrench" style="color:#d97706"></i> 段取時間</label>
        <div class="ci-time-inp-wrap">
          <input type="number" class="m-inp ci-num" id="ci-toolChangeTime"
            value="${d.toolChangeTime}" min="0" step="1"
            oninput="onCapImpField('toolChangeTime',+this.value);refreshCapImpCalc()">
          <span class="ci-unit">秒</span>
        </div>
      </div>
      <div class="ci-time-cell">
        <label class="ci-lbl"><i class="fa-solid fa-rotate" style="color:#0891b2"></i> 段取頻度</label>
        <div class="ci-time-inp-wrap">
          <input type="number" class="m-inp ci-num" id="ci-toolChangeFrequency"
            value="${d.toolChangeFrequency}" min="1" step="1"
            oninput="onCapImpField('toolChangeFrequency',+this.value);refreshCapImpCalc()">
          <span class="ci-unit">個毎</span>
        </div>
      </div>
    </div>
    <div class="ci-calc" id="ci-calc">
      <div class="ci-calc-row">
        <span class="ci-calc-lbl">サイクルタイム</span>
        <span class="ci-calc-val" id="ci-ct">${ct > 0 ? ct.toFixed(1) + 's' : '—'}</span>
      </div>
      <div class="ci-calc-row">
        <span class="ci-calc-lbl">加工能力</span>
        <span class="ci-calc-val" id="ci-cap">${cap !== null ? cap + '個/日' : '—'}</span>
      </div>
      <div class="ci-calc-row">
        <span class="ci-calc-lbl">TT目安</span>
        <span class="ci-calc-val">${tt}s</span>
      </div>
      <div class="ci-calc-row">
        <span class="ci-calc-lbl">判定</span>
        <span class="cap-status-badge ${stCls}" id="ci-status">${stLbl || '—'}</span>
      </div>
    </div>`;
}

function _flushCapImpFields() {
  const d = _capImpTab === 'before' ? _capImpBefore : _capImpAfter;
  const g = id => { const el = document.getElementById(id); return el ? el.value : null; };
  const mid = g('ci-machineId'); if (mid !== null) d.machineId = mid || null;
  const mt  = g('ci-manualTime');          if (mt  !== null) d.manualTime          = +mt;
  const at  = g('ci-autoTime');            if (at  !== null) d.autoTime            = +at;
  const ct  = g('ci-toolChangeTime');      if (ct  !== null) d.toolChangeTime      = +ct;
  const cf  = g('ci-toolChangeFrequency'); if (cf  !== null) d.toolChangeFrequency = +cf || 100;
}

function switchCapImpTab(tab) {
  _flushCapImpFields();
  _capImpTab = tab;
  _renderCapImpModal();
}

function onCapImpField(key, val) {
  const d = _capImpTab === 'before' ? _capImpBefore : _capImpAfter;
  d[key] = val;
}

function onCapImpMachineChange(mid) {
  const d = _capImpTab === 'before' ? _capImpBefore : _capImpAfter;
  d.machineId = mid || null;
}

function applyCapImpMachine() {
  const mid = document.getElementById('ci-machineId')?.value;
  if (!mid) return;
  const m = getMachine(mid);
  if (!m) return;
  const d = _capImpTab === 'before' ? _capImpBefore : _capImpAfter;
  d.machineId = mid; d.manualTime = m.manualTime; d.autoTime = m.autoTime;
  d.toolChangeTime = m.toolChangeTime; d.toolChangeFrequency = m.toolChangeFrequency;
  ['manualTime','autoTime','toolChangeTime','toolChangeFrequency'].forEach(k => {
    const el = document.getElementById('ci-' + k); if (el) el.value = d[k];
  });
  refreshCapImpCalc();
}

// モーダル編集中のライブプレビューをノードに適用
function _applyLiveImpPreview() {
  if (!_capImpNodeId) return;
  const isActive = _capImpChartId === W.activeId;
  const nodeList = isActive ? S.nodes : (W.charts.find(c => c.id === _capImpChartId)?.nodes || []);
  const node = nodeList.find(n => n.id === _capImpNodeId);
  if (node) {
    node._liveImpPreview = { before: { ..._capImpBefore }, after: { ..._capImpAfter } };
  }
}

// ライブプレビューを全ノードからクリア
function _clearLiveImpPreview() {
  const clearFromList = list => list.forEach(n => { delete n._liveImpPreview; });
  clearFromList(S.nodes);
  W.charts.forEach(c => clearFromList(c.nodes || []));
}

function refreshCapImpCalc() {
  const d   = _capImpTab === 'before' ? _capImpBefore : _capImpAfter;
  const ct  = _impCycleTime(d);
  const cap = ct > 0 ? Math.floor((capSettings.operatingTime * 60) / ct) : null;
  const ratio = cap !== null && capSettings.targetQty > 0 ? Math.round(cap / capSettings.targetQty * 100) : null;
  const stCls = ratio === null ? '' : ratio > 120 ? 'surplus' : ratio >= 100 ? 'ok' : 'ng';
  const stLbl = ratio === null ? '—' : ratio > 120 ? '能力追剰' : ratio >= 100 ? '適正' : '能力不足';
  const elCt = document.getElementById('ci-ct');
  const elCap = document.getElementById('ci-cap');
  const elSt  = document.getElementById('ci-status');
  if (elCt)  elCt.textContent  = ct > 0 ? ct.toFixed(1) + 's' : '—';
  if (elCap) elCap.textContent = cap !== null ? cap + '個/日' : '—';
  if (elSt)  { elSt.textContent = stLbl; elSt.className = `cap-status-badge ${stCls}`; }
  // 能力表のデータバーをリアルタイム更新
  if (currentView === 'capacity') {
    _applyLiveImpPreview();
    updateCapacityView();
  }
}

function saveCapImpModal() {
  if (!_capImpNodeId) return;
  _flushCapImpFields();

  const isActive = _capImpChartId === W.activeId;
  if (isActive) {
    // アクティブチャート → S.nodes を直接更新
    const node = N(_capImpNodeId);
    if (node) {
      pushUndo();
      node.improvement = { before: { ..._capImpBefore }, after: { ..._capImpAfter } };
      redraw();
    }
  } else {
    // 非アクティブチャート → 現在モードのバリアントノードを直接更新
    const chart = W.charts.find(c => c.id === _capImpChartId);
    if (chart) {
      const node = getChartNodesRef(chart).find(n => n.id === _capImpNodeId);
      if (node) node.improvement = { before: { ..._capImpBefore }, after: { ..._capImpAfter } };
    }
  }
  saveLS();
  updateCapacityView();
  closeCapImpModal();
}



// ═══════════════════════════════════════════════
// 機械マスタ モーダル
// ═══════════════════════════════════════════════

function openMachineMasterModal() {
  _renderMachineTable();
  document.getElementById('machine-master-modal').classList.add('show');
}

function closeMachineMasterModal() {
  document.getElementById('machine-master-modal').classList.remove('show');
  _saveGlobalSettings();
  if (currentView === 'capacity') updateCapacityView();
}

function _renderMachineTable() {
  const tbody = document.getElementById('mm-tbody');
  if (!tbody) return;
  tbody.innerHTML = machineMaster.map(m => `
    <tr>
      <td><input class="mm-inp" value="${esc(m.name)}" onchange="updateMachine('${m.id}','name',this.value)"></td>
      <td><input class="mm-inp mm-num" type="number" min="0" value="${m.manualTime}" onchange="updateMachine('${m.id}','manualTime',+this.value)"></td>
      <td><input class="mm-inp mm-num" type="number" min="0" value="${m.autoTime}" onchange="updateMachine('${m.id}','autoTime',+this.value)"></td>
      <td><input class="mm-inp mm-num" type="number" min="0" value="${m.toolChangeTime}" onchange="updateMachine('${m.id}','toolChangeTime',+this.value)"></td>
      <td><input class="mm-inp mm-num" type="number" min="1" value="${m.toolChangeFrequency}" onchange="updateMachine('${m.id}','toolChangeFrequency',+this.value)"></td>
      <td>
        <button class="mm-del-btn" onclick="deleteMachine('${m.id}')" title="削除">
          <i class="fa-solid fa-trash-can"></i>
        </button>
      </td>
    </tr>`).join('');
}

function addMachine() {
  machineMaster.push({
    id: newMachineId(), name: '新規機械',
    manualTime: 30, autoTime: 60, toolChangeTime: 180, toolChangeFrequency: 100,
  });
  _renderMachineTable();
  _saveGlobalSettings();
}

function updateMachine(id, key, val) {
  const m = getMachine(id); if (!m) return;
  m[key] = val;
  _saveGlobalSettings();
}

function deleteMachine(id) {
  if (machineMaster.length <= 1) return;
  machineMaster = machineMaster.filter(m => m.id !== id);
  // グループの assignedMachineId をクリア
  for (const c of W.charts) {
    for (const g of (c.groups || [])) {
      if (g.assignedMachineId === id) g.assignedMachineId = null;
    }
  }
  for (const g of (S.groups || [])) {
    if (g.assignedMachineId === id) g.assignedMachineId = null;
  }
  _renderMachineTable();
  _saveGlobalSettings();
  saveLS();
}

// ═══════════════════════════════════════════════
// グループマスタ モーダル（機械割り当て）
// ═══════════════════════════════════════════════

function openGroupMasterModal() {
  _renderGroupTable();
  document.getElementById('group-master-modal').classList.add('show');
}

function closeGroupMasterModal() {
  document.getElementById('group-master-modal').classList.remove('show');
  saveLS();
  if (currentView === 'capacity') updateCapacityView();
}

function _renderGroupTable() {
  const tbody = document.getElementById('gm-tbody');
  if (!tbody) return;
  const groups = S.groups;
  if (!groups.length) {
    tbody.innerHTML = `<tr><td colspan="3" style="text-align:center;color:#94a3b8;padding:20px">グループがありません。チャートにグループを追加してください。</td></tr>`;
    return;
  }
  const mOpts = `<option value="">（なし）</option>` +
    machineMaster.map(m => `<option value="${m.id}">${esc(m.name)}</option>`).join('');

  tbody.innerHTML = groups.map(g => {
    const sel = mOpts.replace(
      g.assignedMachineId ? `value="${g.assignedMachineId}"` : 'value=""',
      `$& selected`
    );
    return `<tr>
      <td><span class="gm-color-dot" style="background:${g.color || '#94a3b8'}"></span>${esc(g.label || 'グループ')}</td>
      <td>
        <select class="mm-inp mm-sel" onchange="assignMachineToGroup('${g.id}', this.value)">
          ${sel}
        </select>
      </td>
      <td style="text-align:center">${S.listOrder.filter(id => { const n = N(id); return n && n.groupId === g.id && isNumType(n.type); }).length}工程</td>
    </tr>`;
  }).join('');
}

function assignMachineToGroup(gid, mid) {
  const g = G(gid); if (!g) return;
  g.assignedMachineId = mid || null;
  // W.charts の対応グループも更新
  const ci = W.charts.findIndex(c => c.id === W.activeId);
  if (ci >= 0) {
    const cg = (W.charts[ci].groups || []).find(x => x.id === gid);
    if (cg) cg.assignedMachineId = mid || null;
  }
  saveLS();
}

// ═══════════════════════════════════════════════
//
// データモデル：
//   node.groupId = フォルダへの所属 (null = グループなし)
//   S.listOrder  = フォルダ内の表示順序
//
// 表示構造：
//   📁 グループA（折りたたみ可）
//      ├ 工程1
//      ├ 工程2
//      └ 工程3
//   📁 グループB
//   📥 グループなし
//
// 操作：
//   クリック        → ノード選択
//   ダブルクリック  → 詳細編集モーダル
//   ドラッグ        → 並び替え / グループ間移動
// ═══════════════════════════════════════════════

let _lpCollapsed      = new Set(); // 折りたたみ中の gid (${cid}::${gid} or gid)
let _lpChartCollapsed = new Set(); // 折りたたみ中の chart id
let _lpChartInitDone  = false;     // 非アクティブチャートの初期折りたたみ済みフラグ
let _lfMetaOpen       = new Set(); // メタ情報フォームを開いている chart id

// ── アイテム行 HTML生成 ─────────────────────────

function _lfItemHTML(node, nums) {
  const sd    = SYMS[node.type];
  const num   = isNumType(node.type) ? (nums[node.id] ?? '—') : '—';
  const isSel = S.sel?.kind === 'node' && S.sel.id === node.id;
  const dispName = sd.shortName ?? sd.name;

  const dots = (node.badges ||[]).slice(0, 3).map(bid => {
    const b = BADGES.find(x => x.id === bid);
    return b ? `<span class="lf-bdot" style="background:${b.color}" title="${b.label}"></span>` : '';
  }).join('');

  const errBadge = graphErrors[node.id]
    ? `<span class="lf-err" title="${esc(graphErrors[node.id].join('\n'))}">
        <i class="fa-solid fa-triangle-exclamation"></i>
       </span>` : '';

  const noteHtml = node.note
    ? `<span class="lf-note" title="${esc(node.note)}">${esc(node.note)}</span>` : '';

  return `
<div class="lf-item${isSel ? ' lf-sel' : ''}"
  data-nid="${node.id}" data-gid="${node.groupId || ''}">
  <div class="lf-item-inner">
    <i class="fa-solid fa-grip-vertical lf-grip" title="ドラッグして並び替え・グループ移動"></i>
    <span class="lf-num${isNumType(node.type) ? ' lf-num-act' : ''}">${num}</span>
    <span class="lf-ico">${palIcoSVG(node.type, 22)}</span>
    <div class="lf-name-wrap">
      <input class="lf-name-inp" value="${esc(node.label)}"
        placeholder="${esc(dispName)}" style="color:${sd.color}"
        oninput="syncLabel('${node.id}',this.value)"
        onchange="setTimeout(updateListPanel,0)"
        onkeydown="if(event.key==='Enter')this.blur()"
        onclick="event.stopPropagation()"
        title="クリックで工程名を編集 / ダブルクリックで詳細編集">
      ${noteHtml}
    </div>
    <span class="lf-type" style="color:${sd.color}">${dispName}</span>
    <span class="lf-bdots">${dots}</span>
    ${errBadge}
    <div class="lf-acts">
      <button class="l-act-btn" title="バッジ設定"
        onclick="event.stopPropagation();openBadgePop('${node.id}',this)">
        <i class="fa-solid fa-tag"></i>
      </button>
      <button class="l-act-btn" title="グループ変更"
        onclick="event.stopPropagation();openGroupPop('${node.id}',this)">
        <i class="fa-solid fa-folder-tree"></i>
      </button>
      <button class="l-act-btn" title="詳細編集（ダブルクリックでも可）"
        onclick="event.stopPropagation();openModal('${node.id}')">
        <i class="fa-solid fa-pen-to-square"></i>
      </button>
      <button class="l-act-btn" title="チャートでフォーカス"
        onclick="event.stopPropagation();focusNode('${node.id}')">
        <i class="fa-solid fa-magnifying-glass"></i>
      </button>
      <button class="l-act-btn" title="この工程を複製"
        onclick="event.stopPropagation();duplicateNode('${node.id}')">
        <i class="fa-solid fa-copy"></i>
      </button>
      <button class="l-act-btn lf-del-btn" title="削除"
        onclick="event.stopPropagation();_lfDeleteNode('${node.id}')">
        <i class="fa-solid fa-trash-can"></i>
      </button>
    </div>
  </div>
</div>`;
}

function _lfDeleteNode(nid) {
  pushUndo();
  S.nodes     = S.nodes.filter(n => n.id !== nid);
  S.edges     = S.edges.filter(e => e.from !== nid && e.to !== nid);
  S.listOrder = S.listOrder.filter(i => i !== nid);
  if (S.sel?.id === nid) S.sel = null;
  redraw();
}

// ── メインパネル更新 ─────────────────────────────

function updateListPanel() {
  if (currentView !== 'list') return;
  const body = document.getElementById('lp-body'); if (!body) return;

  const pal = document.getElementById('lp-palette');
  if (pal && !pal.dataset.built) { buildListPalette(); pal.dataset.built = '1'; }

  // アクティブチャートを最新に同期してから listOrder を正規化
  syncActiveChart();
  syncListOrder();

  // 非アクティブチャートの初期折りたたみ（初回のみ）
  if (!_lpChartInitDone && W.charts.length > 1) {
    _lpChartInitDone = true;
    W.charts.forEach(c => { if (c.id !== W.activeId) _lpChartCollapsed.add(c.id); });
  }

  const totalNodes = W.charts.reduce((sum, c) => sum + (c.nodes?.length || 0), 0);
  const cntEl = document.getElementById('lp-cnt');

  let html = '';
  for (const chart of W.charts) {
    html += _lfChartSectionHTML(chart, chart.id === W.activeId);
  }

  body.innerHTML = html || `<div class="lp-empty">
    <i class="fa-solid fa-diagram-project"></i>
    <p>上のパレットから記号を追加するか、<br>チャートビューで記号を配置してください</p>
  </div>`;

  if (cntEl) {
    cntEl.textContent = W.charts.length > 1
      ? `${S.nodes.length}件（全 ${W.charts.length} 工程図）`
      : `${S.nodes.length}件`;
  }
  _bindLfEvents(body);
  _updateSlistInfo();
}

// ── チャートセクション HTML 生成 ────────────────────────────

function _lfChartSectionHTML(chart, isActive) {
  const isCollapsed = _lpChartCollapsed.has(chart.id);
  const isMetaOpen  = _lfMetaOpen.has(chart.id);
  const _cd         = isActive ? null : getChartData(chart); // 非アクティブ時のバリアントデータ
  const nodeCount   = isActive ? S.nodes.length : (_cd.nodes.length);
  const meta        = isActive ? S.meta : (chart.meta || {});

  // ── メタ編集フォーム（品番・品名・作成者・作成日） ──
  let metaFormHTML = '';
  if (isMetaOpen) {
    const q = (s) => esc(s || '');
    const cid = chart.id;
    const ia  = String(isActive);
    metaFormHTML = '<div class="lf-meta-form" data-cid="' + cid + '" onclick="event.stopPropagation()">' +
      '<div class="lf-meta-row">' +
        '<label class="lf-meta-lbl"><i class="fa-solid fa-hashtag"></i>品番</label>' +
        '<input class="lf-meta-inp" value="' + q(meta.hb) + '" placeholder="例: AL-1234"' +
        ' oninput="_lfUpdateMeta(\'' + cid + '\',\'' + ia + '\',\'hb\',this.value)">' +
      '</div>' +
      '<div class="lf-meta-row">' +
        '<label class="lf-meta-lbl"><i class="fa-solid fa-tag"></i>品名</label>' +
        '<input class="lf-meta-inp" value="' + q(meta.hm) + '" placeholder="例: アルミコイル"' +
        ' oninput="_lfUpdateMeta(\'' + cid + '\',\'' + ia + '\',\'hm\',this.value)">' +
      '</div>' +
      '<div class="lf-meta-row">' +
        '<label class="lf-meta-lbl"><i class="fa-solid fa-user"></i>作成者</label>' +
        '<input class="lf-meta-inp" value="' + q(meta.sk) + '" placeholder="氏名"' +
        ' oninput="_lfUpdateMeta(\'' + cid + '\',\'' + ia + '\',\'sk\',this.value)">' +
      '</div>' +
      '<div class="lf-meta-row">' +
        '<label class="lf-meta-lbl"><i class="fa-regular fa-calendar"></i>作成日</label>' +
        '<input class="lf-meta-inp" type="date" value="' + q(meta.dt) + '"' +
        ' oninput="_lfUpdateMeta(\'' + cid + '\',\'' + ia + '\',\'dt\',this.value)">' +
      '</div>' +
    '</div>';
  }

  const metaBtnCls = isMetaOpen
    ? 'l-act-btn lf-meta-btn lf-meta-btn-active'
    : 'l-act-btn lf-meta-btn';

  // ── ヘッダー ──
  let hdr;
  if (isActive) {
    const gidBB = getBackboneGroupId();
    const bbG   = gidBB ? G(gidBB) : null;
    const bbBadge = bbG
      ? `<span class="lf-chart-bb lf-chart-bb-active" style="border-color:${bbG.color};color:${bbG.color}" title="背骨: ${esc(bbG.label)}"><i class="fa-solid fa-bone"></i></span>`
      : '';
    hdr = `<div class="lf-chart-hdr lf-chart-hdr-active" data-cid="${chart.id}">
      <i class="fa-solid fa-chevron-${isCollapsed ? 'right' : 'down'} lf-chv"></i>
      <span class="lf-chart-active-badge"><i class="fa-solid fa-circle-dot"></i></span>
      <span class="lf-chart-title lf-chart-title-active"
        ondblclick="event.stopPropagation();_lfRenameChart('${chart.id}',this)"
        title="ダブルクリックで名前変更">${esc(chart.name)}</span>
      <span class="lf-chart-cnt">${nodeCount}件</span>
      ${bbBadge}
      <div class="lf-chart-acts-row">
        <button class="${metaBtnCls}" title="図面基礎情報を編集"
          onclick="event.stopPropagation();_lfToggleMeta('${chart.id}')">
          <i class="fa-solid fa-file-lines"></i>
        </button>
        <button class="l-act-btn" title="背骨グループ設定"
          onclick="event.stopPropagation();openChartBackbonePop('${chart.id}',this)">
          <i class="fa-solid fa-bone" style="color:#d97706"></i>
        </button>
        <button class="l-act-btn" title="グループを追加"
          onclick="event.stopPropagation();showAddGroupForm()">
          <i class="fa-solid fa-layer-group"></i>
        </button>
        <button class="l-act-btn lf-chart-act-primary" title="チャートに反映（リストからレイアウト生成）"
          onclick="event.stopPropagation();buildChartFromList()">
          <i class="fa-solid fa-wand-magic-sparkles"></i>
        </button>
      </div>
    </div>` + metaFormHTML;
  } else {
    const explicitBB = _cd.groups.some(g => g.id === _cd.backboneGroupId) ? _cd.backboneGroupId : null;
    const gidBB = explicitBB || findLongestLineGroupId(_cd.nodes, _cd.groups);
    const bbG   = gidBB ? _cd.groups.find(g => g.id === gidBB) : null;
    const bbBadge = bbG
      ? `<span class="lf-chart-bb" style="border-color:${bbG.color};color:${bbG.color}" title="背骨: ${esc(bbG.label)}"><i class="fa-solid fa-bone"></i></span>`
      : '';
    hdr = `<div class="lf-chart-hdr" data-cid="${chart.id}">
      <i class="fa-solid fa-chevron-${isCollapsed ? 'right' : 'down'} lf-chv"></i>
      <i class="fa-solid fa-diagram-project lf-chart-ico"></i>
      <span class="lf-chart-title"
        ondblclick="event.stopPropagation();_lfRenameChart('${chart.id}',this)"
        title="ダブルクリックで名前変更">${esc(chart.name)}</span>
      <span class="lf-chart-cnt">${nodeCount}件</span>
      ${bbBadge}
      <div class="lf-chart-acts-row">
        <button class="${metaBtnCls}" title="図面基礎情報を編集"
          onclick="event.stopPropagation();_lfToggleMeta('${chart.id}')">
          <i class="fa-solid fa-file-lines"></i>
        </button>
        <button class="l-act-btn lf-chart-switch-btn" title="この工程図に切り替えて編集"
          onclick="event.stopPropagation();_switchChartFromList('${chart.id}')">
          <i class="fa-solid fa-arrow-right-to-bracket"></i><span>開く</span>
        </button>
        <button class="l-act-btn lf-del-btn" title="削除" ${W.charts.length <= 1 ? 'disabled' : ''}
          onclick="event.stopPropagation();deleteChart('${chart.id}')">
          <i class="fa-solid fa-trash-can"></i>
        </button>
      </div>
    </div>` + metaFormHTML;
  }

  // ── ボディ ──
  let bodyHTML = '';
  if (!isCollapsed) {
    if (isActive) {
      bodyHTML = `<div class="lf-chart-body lf-chart-body-active" data-cid="${chart.id}">
        ${_lfActiveGroupsHTML()}
      </div>`;
    } else {
      const nums    = _computeNumsForChart(chart);
      const listOrd = _cd.listOrder;
      const nodes   = _cd.nodes;
      const items   = listOrd.map(id => nodes.find(n => n.id === id)).filter(Boolean)
        .map(n => _lfItemHTMLCompact(n, nums, chart.id)).join('');
      bodyHTML = `<div class="lf-chart-body" data-cid="${chart.id}">
        <div class="lf-cross-drop-zone" data-cid="${chart.id}">
          <i class="fa-solid fa-arrow-down-to-line"></i>
          ここにドロップして「${esc(chart.name)}」に転送
        </div>
        ${items || '<div class="lp-empty-chart"><i class="fa-solid fa-inbox"></i> 空の工程図</div>'}
      </div>`;
    }
  }

  const cls = isActive ? 'lf-chart-section lf-chart-section-active' : 'lf-chart-section';
  return `<div class="${cls}" data-cid="${chart.id}">${hdr}${bodyHTML}</div>`;
}

// アクティブチャートのグループ/アイテム HTML（S 状態を使用）
function _lfActiveGroupsHTML() {
  const nums = computeNums();
  let html = '';

  for (const g of (S.groups || [])) {
    const members = S.listOrder.map(id => N(id)).filter(n => n && n.groupId === g.id);
    const isCol   = _lpCollapsed.has(g.id);
    const isBB    = g.id === getBackboneGroupId();

    const merge       = getMergeBySubGroup(g.id);
    const mergeTgt    = merge ? N(merge.targetNodeId) : null;
    const mergeTgtGrp = mergeTgt ? ((S.groups||[]).find(x => x.id === mergeTgt.groupId) || null) : null;
    const mergeHtml   = merge && mergeTgt ? `
<div class="lf-merge-indicator" data-mid="${merge.id}">
  <span class="lf-merge-line"></span>
  <span class="lf-merge-label">
    <i class="fa-solid fa-code-merge"></i>
    ${mergeTgtGrp ? `<span class="lf-merge-grp" style="color:${mergeTgtGrp.color}">${esc(mergeTgtGrp.label)}</span> /` : ''}
    「${esc(mergeTgt.label || SYMS[mergeTgt.type].name)}」に合流
  </span>
  <button class="lf-merge-del l-act-btn" title="合流接続を削除"
    onclick="event.stopPropagation();deleteMerge('${merge.id}')">
    <i class="fa-solid fa-times"></i>
  </button>
</div>` : '';

    html += `
<div class="lf-group" data-gid="${g.id}">
  <div class="lf-ghdr" data-gid="${g.id}" style="border-left:3px solid ${g.color}">
    <i class="fa-solid fa-grip-vertical lf-ghdr-grip" title="ドラッグして別グループの工程に合流接続"></i>
    <i class="fa-solid fa-chevron-${isCol ? 'right' : 'down'} lf-chv"></i>
    <span class="lf-gclr" style="background:${g.color}"></span>
    <i class="fa-solid fa-folder${isCol ? '' : '-open'} lf-gico" style="color:${g.color}"></i>
    <span class="lf-glbl">${esc(g.label)}</span>
    <span class="lf-gcnt">${members.length}件</span>
    ${isBB ? `<span class="bb-badge" title="背骨グループ"><i class="fa-solid fa-bone"></i></span>` : ''}
    <div class="lf-gacts">
      <button class="l-act-btn" title="グループ名を変更"
        onclick="event.stopPropagation();_lfRenameGroup('${g.id}',this)">
        <i class="fa-solid fa-pen"></i>
      </button>
      <button class="l-act-btn" title="グループ全体を複製（起点・内部の接続線を含む）"
        onclick="event.stopPropagation();duplicateGroup('${g.id}')">
        <i class="fa-solid fa-clone"></i>
      </button>
      <button class="l-act-btn lf-del-btn" title="グループを削除"
        onclick="event.stopPropagation();deleteGroup('${g.id}')">
        <i class="fa-solid fa-trash-can"></i>
      </button>
    </div>
  </div>
  ${isCol ? '' : `<div class="lf-gitems" data-gid="${g.id}">
    ${members.length
      ? members.map(n => _lfItemHTML(n, nums)).join('')
      : '<div class="lf-empty-folder"><i class="fa-solid fa-inbox"></i> このグループはまだ空です</div>'
    }
    <div class="lf-drop-hint" data-gid="${g.id}">
      <i class="fa-solid fa-arrow-turn-down"></i>
      ここにドロップして「${esc(g.label)}」に追加
    </div>
  </div>`}
  ${mergeHtml}
</div>`;
  }

  // グループなし
  const ungrouped = S.listOrder.map(id => N(id)).filter(n => n && (!n.groupId || !G(n.groupId)));
  const ugCol = _lpCollapsed.has('__ug__');
  html += `
<div class="lf-group lf-ungrouped" data-gid="__ug__">
  <div class="lf-ghdr lf-ghdr-ug" data-gid="__ug__">
    <i class="fa-solid fa-chevron-${ugCol ? 'right' : 'down'} lf-chv"></i>
    <i class="fa-solid fa-inbox lf-gico lf-gico-ug"></i>
    <span class="lf-glbl lf-glbl-ug">グループなし</span>
    <span class="lf-gcnt">${ungrouped.length}件</span>
  </div>
  ${ugCol ? '' : `<div class="lf-gitems" data-gid="__ug__">
    ${ungrouped.map(n => _lfItemHTML(n, nums)).join('')}
    <div class="lf-drop-hint" data-gid="__ug__">
      <i class="fa-solid fa-inbox"></i> ここにドロップしてグループ解除
    </div>
  </div>`}
</div>`;

  return html;
}

// 非アクティブチャート用 コンパクトアイテム行
function _lfItemHTMLCompact(node, nums, cid) {
  const sd   = SYMS[node.type];
  const num  = isNumType(node.type) ? (nums[node.id] ?? '—') : '—';
  const name = sd.shortName ?? sd.name;
  const dots = (node.badges || []).slice(0, 2).map(bid => {
    const b = BADGES.find(x => x.id === bid);
    return b ? `<span class="lf-bdot" style="background:${b.color}" title="${b.label}"></span>` : '';
  }).join('');
  return `
<div class="lf-item lf-item-readonly" data-nid="${node.id}" data-cid="${cid}">
  <div class="lf-item-inner">
    <span class="lf-num${isNumType(node.type) ? ' lf-num-act' : ''}">${num}</span>
    <span class="lf-ico">${palIcoSVG(node.type, 20)}</span>
    <div class="lf-name-wrap">
      <span class="lf-name-readonly" style="color:${sd.color}">${esc(node.label || name)}</span>
    </div>
    <span class="lf-type" style="color:${sd.color}">${name}</span>
    <span class="lf-bdots">${dots}</span>
  </div>
</div>`;
}

// 非アクティブチャートの番号計算（現在モードのバリアントを参照）
function _computeNumsForChart(chart) {
  const cd        = getChartData(chart);
  const nodes     = cd.nodes;
  const listOrder = cd.listOrder;
  const groups    = cd.groups;
  const findN     = id => nodes.find(n => n.id === id);

  const nums = {};
  if (groups.length > 0) {
    const grouped = new Set();
    for (const g of groups) {
      const members = listOrder.map(id => findN(id)).filter(n => n && n.groupId === g.id);
      let c = 0;
      for (const node of members) {
        if (isNumType(node.type)) { c++; nums[node.id] = c; }
        grouped.add(node.id);
      }
    }
    let c = 0;
    for (const id of listOrder) {
      const n = findN(id);
      if (!n || grouped.has(id)) continue;
      if (isNumType(n.type)) { c++; nums[id] = c; }
    }
  } else {
    let c = 0;
    for (const id of listOrder) {
      const n = findN(id);
      if (n && isNumType(n.type)) { c++; nums[id] = c; }
    }
  }
  return nums;
}

// ── チャート操作（リストビュー用）──────────────────────────

/** 非アクティブチャートに切り替え */
function _switchChartFromList(cid) {
  if (cid === W.activeId) return;
  const prevId = W.activeId;
  switchToChart(cid);
  // 旧アクティブを折りたたみ、新アクティブを展開
  if (prevId) _lpChartCollapsed.add(prevId);
  _lpChartCollapsed.delete(cid);
  updateListPanel();
}

/** リストビューから新規工程図を追加 */
function addNewChartFromList() {
  const prevId = W.activeId;
  syncActiveChart();
  const id = addChartEntry('新規工程図 ' + W.charts.length);
  W.activeId = id;
  loadChartIntoS(W.charts[W.charts.length - 1]);
  _updateActiveChartDisplay();
  if (prevId) _lpChartCollapsed.add(prevId);
  _lpChartCollapsed.delete(id);
  _lpChartInitDone = true;
  rUB(); saveLS();
  updateListPanel();
  setStatus('新規工程図を作成しました');
}

/** リストビュー：図面基礎情報フォームの表示/非表示 */
function _lfToggleMeta(cid) {
  if (_lfMetaOpen.has(cid)) _lfMetaOpen.delete(cid);
  else _lfMetaOpen.add(cid);
  updateListPanel();
}

/** リストビュー：図面基礎情報の更新（アクティブ/非アクティブ両対応） */
function _lfUpdateMeta(cid, isActiveStr, key, value) {
  const isActive = isActiveStr === 'true';
  if (isActive) {
    // アクティブチャートは S.meta を直接更新（updateMetaと同等）
    S.meta[key] = value;
    // ドロワーが開いていれば同期
    if (_drawerOpen) updateProps();
  } else {
    // 非アクティブチャートはW.chartsの該当エントリを更新
    const c = W.charts.find(x => x.id === cid); if (!c) return;
    c.meta = c.meta || {};
    c.meta[key] = value;
  }
  saveLS();
}

/** リストビューのチャート名インライン変更 */
function _lfRenameChart(cid, el) {
  const c = W.charts.find(x => x.id === cid); if (!c) return;
  const inp = document.createElement('input');
  inp.className = 'lf-rename-inp';
  inp.value = c.name;
  el.replaceWith(inp);
  inp.focus(); inp.select();
  const commit = () => {
    const v = inp.value.trim();
    if (v && v !== c.name) {
      c.name = v;
      if (cid === W.activeId) _updateActiveChartDisplay();
      saveLS();
    }
    updateListPanel();
  };
  inp.addEventListener('blur', commit);
  inp.addEventListener('keydown', ev => {
    if (ev.key === 'Enter')  { ev.preventDefault(); inp.blur(); }
    if (ev.key === 'Escape') { inp.value = c.name; inp.blur(); }
    ev.stopPropagation();
  });
}

/** サイドバーの工程図数バッジを更新 */
function _updateSlistInfo() {
  const el = document.getElementById('slist-chart-cnt');
  if (el) el.textContent = W.charts.length + ' 工程図';
}

// ── クロスチャート転送 ───────────────────────────────────

/**
 * アクティブチャート（S状態）から nodeId を取り出し、
 * targetChartId の工程図末尾に転送する。
 * 前後ノードはブリッジ接続（中継エッジ）で補完する。
 */
function _crossChartTransfer(nodeId, targetChartId) {
  const node = N(nodeId);
  if (!node || targetChartId === W.activeId) return;
  const tgt = W.charts.find(c => c.id === targetChartId);
  if (!tgt) return;

  pushUndo();

  // 前後ノードをブリッジ接続（A→node→B ⇒ A→B）
  const inEdges  = S.edges.filter(e => e.to   === nodeId);
  const outEdges = S.edges.filter(e => e.from === nodeId);
  for (const ie of inEdges) {
    for (const oe of outEdges) {
      if (!S.edges.some(e => e.from === ie.from && e.to === oe.to)) {
        S.edges.push({ id: uid(), from: ie.from, fromPort: 'r', to: oe.to, toPort: 'l', hidden: false });
      }
    }
  }

  // ソースチャートから削除
  const transferNode       = JSON.parse(JSON.stringify(node));
  transferNode.groupId     = null; // 転送先にはグループなしで追加
  S.edges    = S.edges.filter(e => e.from !== nodeId && e.to !== nodeId);
  S.nodes    = S.nodes.filter(n => n.id !== nodeId);
  S.listOrder = S.listOrder.filter(id => id !== nodeId);
  if (S.sel?.id === nodeId) S.sel = null;

  // ターゲットチャートに追加
  tgt.nodes     = [...(tgt.nodes     || []), transferNode];
  tgt.listOrder = [...(tgt.listOrder || []), nodeId];

  syncActiveChart();
  saveLS();
  redraw();
  updateListPanel();
  setStatus(`「${esc(node.label || SYMS[node.type]?.name || '')}」を「${esc(tgt.name)}」に転送しました`);
}

// ── イベントバインド ─────────────────────────────

function _bindLfEvents(body) {
  // ── チャートセクションヘッダー → 折りたたみトグル ──
  body.querySelectorAll('.lf-chart-hdr').forEach(chartHdr => {
    chartHdr.addEventListener('click', ev => {
      if (ev.target.closest('.l-act-btn,.lf-rename-inp,.lf-chart-title')) return;
      const cid = chartHdr.dataset.cid;
      if (!cid) return;
      if (_lpChartCollapsed.has(cid)) _lpChartCollapsed.delete(cid);
      else _lpChartCollapsed.add(cid);
      updateListPanel();
    });
  });

  // グループヘッダー → クリックで折りたたみトグル / グリップDnDで合流接続
  body.querySelectorAll('.lf-ghdr').forEach(ghdr => {
    ghdr.addEventListener('click', ev => {
      if (ev.target.closest('.l-act-btn,.lf-rename-inp,.lf-ghdr-grip')) return;
      const gid = ghdr.dataset.gid;
      if (_lpCollapsed.has(gid)) _lpCollapsed.delete(gid);
      else _lpCollapsed.add(gid);
      updateListPanel();
    });

    // グリップ → グループDnD（合流接続）
    const grip = ghdr.querySelector('.lf-ghdr-grip');
    if (!grip) return;
    grip.addEventListener('mousedown', ev => {
      if (ev.button !== 0) return;
      ev.preventDefault(); ev.stopPropagation();
      const gid = ghdr.dataset.gid;
      if (!gid || gid === '__ug__') return;
      const sx = ev.clientX, sy = ev.clientY;
      let moved = false;
      const cleanup = () => {
        document.removeEventListener('mousemove', onM);
        document.removeEventListener('mouseup',   onU);
      };
      const onM = mv => {
        if (!moved && Math.hypot(mv.clientX - sx, mv.clientY - sy) > 5) {
          moved = true; cleanup();
          _startGroupMergeDnd({ clientX: sx, clientY: sy }, gid);
        }
      };
      const onU = () => cleanup();
      document.addEventListener('mousemove', onM);
      document.addEventListener('mouseup',   onU);
    });
  });

  // アクティブチャートのアイテム行 → 5px閾値でクリック選択/ドラッグ分岐
  body.querySelectorAll('.lf-item:not(.lf-item-readonly)').forEach(item => {
    item.addEventListener('mousedown', ev => {
      if (ev.button !== 0) return;
      if (ev.target.closest('.l-act-btn,input,textarea')) return;

      const nodeId = item.dataset.nid;
      const sx = ev.clientX, sy = ev.clientY;
      let moved = false;

      ev.preventDefault();

      const cleanup = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup',   onUp);
      };

      const onMove = mv => {
        if (!moved && Math.hypot(mv.clientX - sx, mv.clientY - sy) > 5) {
          moved = true;
          cleanup();
          _startLfDnd({ clientX: sx, clientY: sy }, nodeId);
        }
      };

      const onUp = () => {
        cleanup();
        if (!moved) {
          S.sel = { kind: 'node', id: nodeId };
          redraw();
        }
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup',   onUp);
    });

    // ダブルクリック → 詳細編集モーダル
    item.addEventListener('dblclick', ev => {
      if (ev.target.closest('input,textarea,.l-act-btn')) return;
      openModal(item.dataset.nid);
    });
  });

  // 非アクティブチャートのアイテム行 → ダブルクリックで切替 + モーダル
  body.querySelectorAll('.lf-item-readonly').forEach(item => {
    item.addEventListener('dblclick', ev => {
      const cid = item.dataset.cid;
      const nid = item.dataset.nid;
      if (!cid || !nid || cid === W.activeId) return;
      _switchChartFromList(cid);
      requestAnimationFrame(() => openModal(nid));
    });
  });
}


// ── グループ合流DnD ─────────────────────────────
// グループヘッダーグリップ → 別グループのノードへドロップ → 合流接続生成

let _grpMergeDnd = { active: false, subGroupId: null };

function _startGroupMergeDnd(ev, subGroupId) {
  const g = (S.groups ||[]).find(x => x.id === subGroupId);
  _grpMergeDnd = { active: true, subGroupId };

  const ghost = document.getElementById('dnd-ghost');
  ghost.innerHTML = g
    ? `<i class="fa-solid fa-code-merge" style="color:${g.color};font-size:14px"></i>
       <span>${esc(g.label)} → 合流先を選択</span>` : '';
  ghost.style.top  = (ev.clientY - 15) + 'px';
  ghost.style.left = (ev.clientX + 14) + 'px';
  ghost.classList.add('show');
  document.body.classList.add('lf-merge-dnd-active');

  document.addEventListener('mousemove', _onGrpMergeMove);
  document.addEventListener('mouseup',   _onGrpMergeEnd);
}

function _onGrpMergeMove(ev) {
  if (!_grpMergeDnd.active) return;
  const ghost = document.getElementById('dnd-ghost');
  ghost.style.top  = (ev.clientY - 15) + 'px';
  ghost.style.left = (ev.clientX + 14) + 'px';

  // 前のハイライト解除
  document.querySelectorAll('.lf-merge-target-over')
    .forEach(el => el.classList.remove('lf-merge-target-over'));

  // 自グループ以外のアイテム行をハイライト
  const elems   = document.elementsFromPoint(ev.clientX, ev.clientY);
  const itemEl  = elems.find(el => el.classList?.contains('lf-item'));
  if (itemEl) {
    const nid  = itemEl.dataset.nid;
    const n    = N(nid); if (!n) return;
    if (n.groupId !== _grpMergeDnd.subGroupId) {
      itemEl.classList.add('lf-merge-target-over');
    }
  }
}

function _onGrpMergeEnd(ev) {
  if (!_grpMergeDnd.active) return;
  _grpMergeDnd.active = false;
  document.getElementById('dnd-ghost').classList.remove('show');
  document.body.classList.remove('lf-merge-dnd-active');
  document.querySelectorAll('.lf-merge-target-over')
    .forEach(el => el.classList.remove('lf-merge-target-over'));
  document.removeEventListener('mousemove', _onGrpMergeMove);
  document.removeEventListener('mouseup',   _onGrpMergeEnd);

  const elems  = document.elementsFromPoint(ev.clientX, ev.clientY);
  const itemEl = elems.find(el => el.classList?.contains('lf-item'));
  if (!itemEl) return;

  const targetNodeId = itemEl.dataset.nid;
  const tgtNode = N(targetNodeId); if (!tgtNode) return;

  // 自グループへのドロップは無効
  if (tgtNode.groupId === _grpMergeDnd.subGroupId) return;

  // 既存の合流接続が同じサブグループから存在する場合は上書き確認
  const existing = getMergeBySubGroup(_grpMergeDnd.subGroupId);
  if (existing) {
    if (!confirm('このグループにはすでに合流接続があります。上書きしますか？')) return;
    pushUndo();
    S.merges = (S.merges ||[]).filter(m => m.id !== existing.id);
  } else {
    pushUndo();
  }

  S.merges = S.merges ||[];
  S.merges.push({ id: uid(), subGroupId: _grpMergeDnd.subGroupId, targetNodeId });
  if (S.sel?.kind === 'merge') S.sel = null;
  // 合流接続作成 → 即座に再レイアウト
  syncChartFromListOrder();
  redraw();
  fitView();
}

// ── フォルダツリー DnD ─────────────────────────

let _lfDnd = {
  active: false, nodeId: null,
  sourceCid: null,       // ドラッグ元チャートID
  mode: null,            // 'before'|'after'|'group'|'group-end'|'cross-chart'
  targetNid: null, targetGid: null,
  targetChartId: null,   // クロスチャートドロップ先
};

function _startLfDnd(ev, nodeId) {
  const node = N(nodeId);
  _lfDnd = { active: true, nodeId, sourceCid: W.activeId, mode: null,
             targetNid: null, targetGid: null, targetChartId: null };

  const ghost = document.getElementById('dnd-ghost');
  ghost.innerHTML = node
    ? `${palIcoSVG(node.type, 18)}<span>${esc(node.label || SYMS[node.type].name)}</span>` : '';
  ghost.style.top  = (ev.clientY - 15) + 'px';
  ghost.style.left = (ev.clientX + 14) + 'px';
  ghost.classList.add('show');
  document.body.classList.add('lf-dnd-active');

  document.addEventListener('mousemove', _onLfMove);
  document.addEventListener('mouseup',   _onLfEnd);
}

function _clearLfIndicators() {
  document.querySelectorAll('.lf-dnd-before,.lf-dnd-after')
    .forEach(el => el.classList.remove('lf-dnd-before', 'lf-dnd-after'));
  document.querySelectorAll('.lf-dnd-gover')
    .forEach(el => el.classList.remove('lf-dnd-gover'));
  document.querySelectorAll('.lf-dz-over')
    .forEach(el => el.classList.remove('lf-dz-over'));
  document.querySelectorAll('.lf-cross-drop-hover')
    .forEach(el => el.classList.remove('lf-cross-drop-hover'));
  document.querySelectorAll('.lf-chart-drop-over')
    .forEach(el => el.classList.remove('lf-chart-drop-over'));
}

function _onLfMove(ev) {
  if (!_lfDnd.active) return;
  const ghost = document.getElementById('dnd-ghost');
  ghost.style.top  = (ev.clientY - 15) + 'px';
  ghost.style.left = (ev.clientX + 14) + 'px';
  _clearLfIndicators();
  _lfDnd.mode = null; _lfDnd.targetNid = null; _lfDnd.targetGid = null; _lfDnd.targetChartId = null;

  const elems = document.elementsFromPoint(ev.clientX, ev.clientY);

  // ① クロスチャートドロップゾーン（非アクティブチャートのドロップ帯）を最優先
  const crossZone = elems.find(el => el.classList?.contains('lf-cross-drop-zone'));
  if (crossZone && crossZone.dataset.cid !== W.activeId) {
    crossZone.classList.add('lf-cross-drop-hover');
    _lfDnd.mode          = 'cross-chart';
    _lfDnd.targetChartId = crossZone.dataset.cid;
    return;
  }

  // ② 折りたたまれた非アクティブチャートヘッダーへのドロップ
  const inactiveHdr = elems.find(el =>
    el.classList?.contains('lf-chart-hdr') &&
    el.dataset.cid && el.dataset.cid !== W.activeId
  );
  if (inactiveHdr) {
    inactiveHdr.classList.add('lf-chart-drop-over');
    _lfDnd.mode          = 'cross-chart';
    _lfDnd.targetChartId = inactiveHdr.dataset.cid;
    return;
  }

  // ③ ドロップヒント帯（アクティブチャートのグループ末尾）
  const hint = elems.find(el => el.classList?.contains('lf-drop-hint'));
  if (hint) {
    hint.classList.add('lf-dz-over');
    _lfDnd.mode      = 'group-end';
    _lfDnd.targetGid = hint.dataset.gid;
    return;
  }

  // ④ アクティブチャートのアイテム行（上半分/下半分で before/after）
  const itemEl = elems.find(el =>
    el.classList?.contains('lf-item') && !el.classList?.contains('lf-item-readonly')
  );
  if (itemEl && itemEl.dataset.nid !== _lfDnd.nodeId) {
    const rect = itemEl.getBoundingClientRect();
    const mode = (ev.clientY - rect.top) / rect.height < 0.5 ? 'before' : 'after';
    itemEl.classList.add(`lf-dnd-${mode}`);
    _lfDnd.mode      = mode;
    _lfDnd.targetNid = itemEl.dataset.nid;
    _lfDnd.targetGid = itemEl.dataset.gid;
    return;
  }

  // ⑤ グループヘッダー（アクティブチャート内）
  const ghdr = elems.find(el => el.classList?.contains('lf-ghdr'));
  if (ghdr) {
    ghdr.classList.add('lf-dnd-gover');
    _lfDnd.mode      = 'group';
    _lfDnd.targetGid = ghdr.dataset.gid;
    return;
  }

  // ⑥ .lf-gitems コンテナフォールバック
  const gitemsEl = elems.find(el => el.classList?.contains('lf-gitems') && el.dataset.gid);
  if (gitemsEl) {
    _lfDnd.mode      = 'group-end';
    _lfDnd.targetGid = gitemsEl.dataset.gid;
    const dh = gitemsEl.querySelector('.lf-drop-hint');
    if (dh) dh.classList.add('lf-dz-over');
  }
}

function _onLfEnd() {
  if (!_lfDnd.active) return;
  _lfDnd.active = false;
  document.getElementById('dnd-ghost').classList.remove('show');
  document.body.classList.remove('lf-dnd-active');
  _clearLfIndicators();
  document.removeEventListener('mousemove', _onLfMove);
  document.removeEventListener('mouseup',   _onLfEnd);

  const { nodeId, mode, targetNid, targetGid, targetChartId } = _lfDnd;
  if (!mode || !nodeId) return;

  // ─ クロスチャート転送 ─
  if (mode === 'cross-chart') {
    if (targetChartId && targetChartId !== W.activeId) {
      _crossChartTransfer(nodeId, targetChartId);
    }
    return;
  }

  const node = N(nodeId); if (!node) return;

  pushUndo();

  // 新groupId確定（__ug__ or 空 = グループなし）
  const newGid = (targetGid === '__ug__' || !targetGid) ? null
    : (G(targetGid) ? targetGid : null);
  node.groupId = newGid;

  // listOrder 更新
  const fromIdx = S.listOrder.indexOf(nodeId);
  if (fromIdx >= 0) S.listOrder.splice(fromIdx, 1);

  if (mode === 'group' || mode === 'group-end') {
    const sameGroup = S.listOrder.filter(id => {
      const n = N(id);
      return n && n.groupId === newGid;
    });
    const last = sameGroup[sameGroup.length - 1];
    const ins  = last ? S.listOrder.indexOf(last) + 1 : S.listOrder.length;
    S.listOrder.splice(ins, 0, nodeId);
  } else {
    let toIdx = S.listOrder.indexOf(targetNid);
    if (mode === 'after') toIdx++;
    S.listOrder.splice(Math.max(0, toIdx), 0, nodeId);
  }

  syncChartFromListOrder();
  redraw();
}

// ── グループインライン名変更 ─────────────────────

function _lfRenameGroup(gid, btn) {
  const g = G(gid); if (!g) return;
  const ghdr = btn.closest('.lf-ghdr');
  const lbl  = ghdr?.querySelector('.lf-glbl');
  if (!lbl) return;

  const inp = document.createElement('input');
  inp.className = 'lf-rename-inp';
  inp.value = g.label;
  lbl.replaceWith(inp);
  inp.focus(); inp.select();

  const commit = () => {
    const v = inp.value.trim();
    updateGroup(gid, { label: v || g.label });
  };
  inp.addEventListener('blur', commit);
  inp.addEventListener('keydown', ev => {
    if (ev.key === 'Enter')  { ev.preventDefault(); inp.blur(); }
    if (ev.key === 'Escape') { inp.value = g.label; inp.blur(); }
    ev.stopPropagation();
  });
}

// ── グループ追加フォーム ─────────────────────────

function showAddGroupForm() {
  const existing = document.getElementById('_agf');
  if (existing) { existing.remove(); return; }
  const defColor = GROUP_COLORS[S.groups.length % GROUP_COLORS.length];
  const form = document.createElement('div');
  form.id = '_agf'; form.className = 'add-group-form';
  form.innerHTML = `<div class="agf-inner">
    <i class="fa-solid fa-layer-group agf-ico"></i>
    <input id="agf-inp" class="agf-inp" placeholder="グループ名を入力..." maxlength="30">
    <div class="agf-colors">
      ${GROUP_COLORS.map(c =>
        `<button class="agf-c${c===defColor?' sel':''}" style="background:${c}" data-c="${c}"
          onclick="(function(b){b.parentNode.querySelectorAll('.agf-c').forEach(x=>x.classList.remove('sel'));b.classList.add('sel');})(this)"></button>`
      ).join('')}
    </div>
    <button class="btn bp agf-ok" onclick="submitAddGroup()">
      <i class="fa-solid fa-plus"></i> 追加
    </button>
    <button class="tbtn agf-cancel" onclick="document.getElementById('_agf')?.remove()">
      <i class="fa-solid fa-xmark"></i>
    </button>
  </div>`;
  const body = document.querySelector('.lf-chart-body-active') || document.getElementById('lp-body');
  body.insertBefore(form, body.firstChild);
  const inp = document.getElementById('agf-inp');
  inp?.focus();
  inp?.addEventListener('keydown', ev => {
    if (ev.key === 'Enter') submitAddGroup();
    if (ev.key === 'Escape') form.remove();
  });
}

function submitAddGroup() {
  const label  = document.getElementById('agf-inp')?.value.trim() || '新規グループ';
  const selBtn = document.querySelector('.agf-c.sel');
  const color  = selBtn ? selBtn.dataset.c : GROUP_COLORS[S.groups.length % GROUP_COLORS.length];
  document.getElementById('_agf')?.remove();
  addGroup(label, color);
}

// ── リストパレット ───────────────────────────────

function shortType(t) {
  const sd = SYMS[t];
  return sd ? (sd.shortName ?? sd.name) : t;
}

function buildListPalette() {
  const wrap = document.getElementById('lp-palette'); if (!wrap) return;
  let html = '<span class="lpal-lbl"><i class="fa-solid fa-plus"></i> 記号追加</span>';
  GROUPS.forEach((g, gi) => {
    if (gi > 0) html += '<span class="lpal-sep"></span>';
    g.types.forEach(t => {
      html += `<button class="lpal-btn" title="${SYMS[t].name}（選択グループの末尾に追加）"
        onclick="addNodeFromList('${t}')">${palIcoSVG(t, 22)}</button>`;
    });
  });
  wrap.innerHTML = html;
}

function addNodeFromList(type) {
  pushUndo();

  // 選択中ノードまたは最後のノードのグループを引き継ぐ
  // （参照ノードがない＝最初の工程は無名グループに所属させる）
  const refNode   = S.sel?.kind === 'node' ? N(S.sel.id)
    : (S.listOrder.length ? N(S.listOrder[S.listOrder.length - 1]) : null);
  const groupId   = refNode ? (refNode.groupId || null) : ensureDefaultGroup();
  const prevSelId = S.sel?.kind === 'node' ? S.sel.id : (refNode?.id || null);

  // チャート上位置
  let x = 0, y = 0;
  if (refNode) {
    x = refNode.x + SYMS[refNode.type].r + SYMS[type].r + C * 3;
    y = refNode.y;
  }

  const node   = mkNode(type, snapV(x), snapV(y));
  node.groupId = groupId;
  S.nodes.push(node);

  // 同グループ末尾に挿入
  if (groupId) {
    const sameGroup = S.listOrder.filter(id => N(id)?.groupId === groupId);
    const last = sameGroup[sameGroup.length - 1];
    S.listOrder.splice(
      last ? S.listOrder.indexOf(last) + 1 : S.listOrder.length,
      0, node.id
    );
  } else {
    S.listOrder.push(node.id);
  }

  autoConnect(node, prevSelId);
  S.sel = { kind:'node', id:node.id };
  redraw();
}

// ─── バッジポップオーバー ────────────────────────

let _bpopNid = null;

function openBadgePop(nid, btn) {
  _closeFloatingPop('_badge_pop');
  if (_bpopNid === nid) { _bpopNid = null; return; }
  _bpopNid = nid;
  const node = N(nid); if (!node) return;

  const pop = document.createElement('div');
  pop.id = '_badge_pop'; pop.className = 'fl-pop badge-pop'; pop.dataset.nid = nid;
  pop.innerHTML = `
    <div class="fl-pop-hdr"><i class="fa-solid fa-tags"></i> バッジ設定</div>
    <div class="badge-pop-grid">
      ${BADGES.map(b => {
        const active = (node.badges ||[]).includes(b.id);
        return `<button class="bpop-btn${active?' active':''}" data-bid="${b.id}"
          style="--bc:${b.color};--bbg:${b.bg}">
          <span class="bpop-dot" style="background:${b.color}"></span>${b.label}
        </button>`;
      }).join('')}
    </div>`;
  document.body.appendChild(pop);
  _positionPop(pop, btn);

  pop.querySelectorAll('.bpop-btn').forEach(bBtn => {
    bBtn.addEventListener('click', ev => {
      ev.stopPropagation();
      const n = N(nid); if (!n) return;
      n.badges = n.badges ||[];
      const idx = n.badges.indexOf(bBtn.dataset.bid);
      if (idx >= 0) n.badges.splice(idx, 1); else n.badges.push(bBtn.dataset.bid);
      bBtn.classList.toggle('active', n.badges.includes(bBtn.dataset.bid));
      redraw();
    });
  });
  _attachPopOutsideClose(pop, () => { _bpopNid = null; });
}

// ─── グループポップオーバー ──────────────────────

function openGroupPop(nid, btn) {
  _closeFloatingPop('_group_pop');
  const node = N(nid); if (!node) return;
  const pop = document.createElement('div');
  pop.id = '_group_pop'; pop.className = 'fl-pop group-pop'; pop.dataset.nid = nid;
  const options =[
    { id:null, label:'グループなし', color:'#94a3b8' },
    ...(S.groups || []).map(g => ({ id:g.id, label:g.label, color:g.color })),
  ];
  pop.innerHTML = `
    <div class="fl-pop-hdr"><i class="fa-solid fa-folder-tree"></i> グループ割り当て</div>
    <p class="gpop-desc">「チャートに反映」時の行配置に使用されます</p>
    ${options.map(opt => {
      const active = node.groupId === opt.id;
      return `<button class="gpop-item${active?' active':''}" data-gid="${opt.id||''}">
        <span class="gpop-color" style="background:${opt.color}"></span>
        <span class="gpop-label">${esc(opt.label)}</span>
        ${active ? '<i class="fa-solid fa-check gpop-check"></i>' : ''}
      </button>`;
    }).join('')}
    ${!S.groups.length
      ? `<p class="gpop-hint"><i class="fa-solid fa-circle-info"></i> 先にグループを追加してください</p>`
      : ''}`;
  document.body.appendChild(pop);
  _positionPop(pop, btn);
  pop.querySelectorAll('.gpop-item').forEach(item => {
    item.addEventListener('click', ev => {
      ev.stopPropagation();
      setNodeGroup(nid, item.dataset.gid || null);
      pop.remove();
    });
  });
  _attachPopOutsideClose(pop);
}

// ─── チャートフォーカス ──────────────────────────

// ═══════════════════════════════════════════════
// ウェルカム画面
// ═══════════════════════════════════════════════

function showWelcome() {
  document.getElementById('welcome-modal').classList.add('show');
}

function closeWelcome() {
  document.getElementById('welcome-modal').classList.remove('show');
  setStatus('準備完了 — 左パレットの記号をクリックして配置を開始');
}

/** ウェルカム画面を閉じ、操作ガイドモーダルを開く */
function openGuideFromWelcome() {
  closeWelcome();
  document.getElementById('guide-modal').classList.add('show');
}

/** 操作ガイドモーダルを閉じる */
function closeGuideModal() {
  document.getElementById('guide-modal').classList.remove('show');
}

/** サンプルデータを読み込んでウェルカム画面を閉じる */
function loadSampleData() {
  // ══════════════════════════════════════════════════════════
  // サンプルデータ仕様
  // ─ C=20 grid / buildChartFromList と同一レイアウト規則 ─
  // ─ LEFT_MARGIN=60, グループ間 yi+=C*14=280 ──────────────
  //
  // 改善前後バリアント (impVariants) を持つ 2 工程図
  //
  // Chart 1: アルミコイル（スリット品） — 内製 (naisei) スタート
  //   改善前: sg1 スリット工程(背骨) + sg2 品質管理サブグループ
  //   改善後: sg2 廃止・外注依存排除、自動外観検査に集約
  //
  // Chart 2: アルミ板（プレス品） — 外製 (gaisei) スタート
  //   改善前: gaisei→tt_s→kako→kensa_n→tt_k（独立寸法検査あり）
  //   改善後: 寸法検査をインライン化し工程短縮（kensa 削除）
  // ══════════════════════════════════════════════════════════

  const today = new Date().toISOString().split('T')[0];

  // ── ノードファクトリ ──────────────────────────
  const _N = (id, type, x, y, label, groupId, note, comment, unit, unitQty, badges, improvement) => ({
    id, type, x, y, label, groupId, note, comment, unit, unitQty,
    badges, badgePos: 'top',
    badgeOffsets: {}, badgeBorders: {}, badgeColors: {}, badgeColorEnabled: {},
    listParentIds: [],
    ...(improvement ? { improvement } : {}),
  });
  const _imp = (b, a) => ({ before: b, after: a });
  const _d   = (lo, mt, at, ct, cf) => ({ labelOverride: lo, machineId: null, manualTime: mt, autoTime: at, toolChangeTime: ct, toolChangeFrequency: cf });

  // ══ Chart 1 ── 改善前バリアント ══════════════════════════
  // Layout: sg1 y=0, sg2 y=280
  //   sg1: naisei(100) → tt_s(180) → kako(240) → kensa_q(300) → tt_k(360)
  //   sg2: gaisei(180) → kensa_n(240) ──merge──> sn4(kensa_q)
  const c1Before = {
    nodes: [
      _N('sn1','naisei',  100, 0,   '素材投入',   'sg1', '', 'アルミコイル原反を投入する起点', '巻', '1',  [], null),
      _N('sn2','tt_s',    180, 0,   '素材置場',   'sg1', '', '', '', '', [], null),
      _N('sn3','kako',    240, 0,   'スリッター', 'sg1',
        '縦切断加工',
        '幅・枚数を指定して縦方向に切断する付加価値作業（変形）。',
        '枚', '', ['important', 'kaizen'],
        _imp(
          _d('', 45, 180, 600,  50),   // 改善前：段取頻度 50個
          _d('', 30, 120, 600, 100)    // 改善後：段取頻度改善 100個
        )
      ),
      _N('sn4','kensa_q', 300, 0,   '外観検査',   'sg1',
        '外観・寸法',
        '品質特性を標準と比較して合否判定を行う付加価値作業。',
        '', '', ['quality'],
        _imp(
          _d('',          60,  0, 0, 100),
          _d('自動外観検査', 15, 30, 0, 100)
        )
      ),
      _N('sn5','tt_k',    360, 0,   '完成品置場', 'sg1', '', '', '', '', [], null),
      _N('sn6','gaisei',   50, 280, '外注品受入', 'sg2', '', '検査用標準サンプルの外注品起点', '', '', [], null),
      _N('sn8','tt_s',    120, 280, '素材置場',   'sg2', '', '', '', '', [], null),
      _N('sn7','kensa_n', 180, 280, '重量検査',   'sg2',
        '重量・数量',
        '数量・重量を標準と比較して判定する付加価値作業。',
        '', '', ['quality'],
        _imp(
          _d('', 30, 0, 0, 100),
          _d('', 20, 0, 0, 100)
        )
      ),
      _N('sn9','tt_k',    240, 280, '完成品置場', 'sg2', '', '', '', '', [], null),
    ],
    edges: [
      { id:'se1', from:'sn1', fromPort:'r', to:'sn2', toPort:'l', hidden:true  },
      { id:'se2', from:'sn2', fromPort:'r', to:'sn3', toPort:'l', hidden:false },
      { id:'se3', from:'sn3', fromPort:'r', to:'sn4', toPort:'l', hidden:false },
      { id:'se4', from:'sn4', fromPort:'r', to:'sn5', toPort:'l', hidden:false },
      { id:'se5', from:'sn6', fromPort:'r', to:'sn8', toPort:'l', hidden:true  },
      { id:'se6', from:'sn8', fromPort:'r', to:'sn7', toPort:'l', hidden:false },
      { id:'se7', from:'sn7', fromPort:'r', to:'sn9', toPort:'l', hidden:false },
    ],
    groups:          [{ id:'sg1', label:'スリット工程', color:'#6366f1' }, { id:'sg2', label:'品質管理', color:'#0891b2' }],
    merges:          [{ id:'sm1', subGroupId:'sg2', targetNodeId:'sn4' }],
    listOrder:       ['sn1','sn2','sn3','sn4','sn5','sn6','sn8','sn7','sn9'],
    backboneGroupId: 'sg1',
  };

  // ══ Chart 1 ── 改善後バリアント ══════════════════════════
  // 改善内容: 外注依存サブグループ(sg2)廃止、自動外観検査に集約
  // Layout: sg1 のみ y=0
  //   naisei(100) → tt_s(180) → kako(240) → kensa_q(自動)(300) → tt_k(360)
  const c1After = {
    nodes: [
      _N('an1','naisei',  100, 0, '素材投入',   'sg1', '', 'アルミコイル原反を投入する起点', '巻', '1', [], null),
      _N('an2','tt_s',    180, 0, '素材置場',   'sg1', '', '', '', '', [], null),
      _N('an3','kako',    240, 0, 'スリッター', 'sg1',
        '縦切断加工',
        '幅・枚数を指定して縦方向に切断する付加価値作業（変形）。段取改善済。',
        '枚', '', ['important'],
        _imp(
          _d('', 30, 120, 600, 100),
          _d('', 30, 120, 600, 100)
        )
      ),
      _N('an4','kensa_q', 300, 0, '自動外観検査', 'sg1',
        '外観・寸法（自動化）',
        '自動検査装置により高速判定。外注依存の品質管理フローを廃止して内製化。',
        '', '', ['quality', 'auto'],
        _imp(
          _d('自動外観検査', 15, 30, 0, 100),
          _d('自動外観検査', 15, 30, 0, 100)
        )
      ),
      _N('an5','tt_k',    360, 0, '完成品置場', 'sg1', '', '', '', '', [], null),
    ],
    edges: [
      { id:'ae1', from:'an1', fromPort:'r', to:'an2', toPort:'l', hidden:true  },
      { id:'ae2', from:'an2', fromPort:'r', to:'an3', toPort:'l', hidden:false },
      { id:'ae3', from:'an3', fromPort:'r', to:'an4', toPort:'l', hidden:false },
      { id:'ae4', from:'an4', fromPort:'r', to:'an5', toPort:'l', hidden:false },
    ],
    groups:          [{ id:'sg1', label:'スリット工程', color:'#6366f1' }],
    merges:          [],
    listOrder:       ['an1','an2','an3','an4','an5'],
    backboneGroupId: 'sg1',
  };

  // ══ Chart 2 ── 改善前バリアント ══════════════════════════
  // 外製(gaisei)スタート。独立した寸法検査工程あり
  // Layout: ungrouped y=0
  //   gaisei(100) → tt_s(180) → kako(240) → kensa_n(300) → tt_k(360)
  const c2Before = {
    nodes: [
      _N('sp1','gaisei', 100, 0, '外注品受入', null, '', 'アルミ板材の外注品起点', '枚', '1', [], null),
      _N('sp2','tt_s',   180, 0, '素材置場',   null, '', '', '', '', [], null),
      _N('sp3','kako',   240, 0, 'プレス加工', null,
        '打ち抜き・成形',
        '金型を使い変形を加える付加価値作業。',
        '個', '', ['important'],
        _imp(
          _d('', 15, 45, 120, 500),
          _d('', 10, 30, 120, 500)
        )
      ),
      _N('sp4','kensa_n', 300, 0, '寸法検査',  null,
        '寸法・公差',
        '寸法が規格内に収まっているか判定する付加価値作業。',
        '', '', ['quality'],
        _imp(
          _d('', 25, 0, 0, 100),
          _d('', 20, 0, 0, 100)
        )
      ),
      _N('sp5','tt_k',   360, 0, '完成品置場', null, '', '', '', '', [], null),
    ],
    edges: [
      { id:'sp_e1', from:'sp1', fromPort:'r', to:'sp2', toPort:'l', hidden:true  },
      { id:'sp_e2', from:'sp2', fromPort:'r', to:'sp3', toPort:'l', hidden:false },
      { id:'sp_e3', from:'sp3', fromPort:'r', to:'sp4', toPort:'l', hidden:false },
      { id:'sp_e4', from:'sp4', fromPort:'r', to:'sp5', toPort:'l', hidden:false },
    ],
    groups:          [],
    merges:          [],
    listOrder:       ['sp1','sp2','sp3','sp4','sp5'],
    backboneGroupId: null,
  };

  // ══ Chart 2 ── 改善後バリアント ══════════════════════════
  // 改善内容: 寸法検査をプレス工程にインライン統合し工程短縮
  // Layout: ungrouped y=0
  //   gaisei(100) → tt_s(180) → kako(検査一体)(240) → tt_k(300)
  const c2After = {
    nodes: [
      _N('qa1','gaisei', 100, 0, '外注品受入',        null, '', 'アルミ板材の外注品起点', '枚', '1', [], null),
      _N('qa2','tt_s',   180, 0, '素材置場',          null, '', '', '', '', [], null),
      _N('qa3','kako',   240, 0, 'プレス（検査一体）', null,
        '打ち抜き・成形＋インライン検査',
        '金型変形と同時にインライン寸法確認を実施。後工程の独立検査工程を廃止。',
        '個', '', ['important', 'kaizen'],
        _imp(
          _d('', 10, 30, 120, 500),
          _d('プレス（検査一体）', 10, 30, 120, 500)
        )
      ),
      _N('qa4','tt_k',   300, 0, '完成品置場',        null, '', '', '', '', [], null),
    ],
    edges: [
      { id:'qe1', from:'qa1', fromPort:'r', to:'qa2', toPort:'l', hidden:true  },
      { id:'qe2', from:'qa2', fromPort:'r', to:'qa3', toPort:'l', hidden:false },
      { id:'qe3', from:'qa3', fromPort:'r', to:'qa4', toPort:'l', hidden:false },
    ],
    groups:          [],
    merges:          [],
    listOrder:       ['qa1','qa2','qa3','qa4'],
    backboneGroupId: null,
  };

  // ── チャートオブジェクト組み立て ──────────────
  // impVariants に前後バリアントを格納。
  // nodes/edges 等のトップレベルフィールドは「改善前」を設定（保存JSON の互換フォールバック用）。
  const chart1 = {
    id: 'sc1', name: 'アルミコイル（スリット品）',
    meta: { hb: 'AL-1234', hm: 'アルミコイル（スリット品）', sk: 'サンプル', dt: today },
    impVariants:     { before: c1Before, after: c1After },
    nodes:           c1Before.nodes,
    edges:           c1Before.edges,
    groups:          c1Before.groups,
    merges:          c1Before.merges,
    listOrder:       c1Before.listOrder,
    backboneGroupId: c1Before.backboneGroupId,
  };

  const chart2 = {
    id: 'sc2', name: 'アルミ板（プレス品）',
    meta: { hb: 'AL-5678', hm: 'アルミ板（プレス品）', sk: 'サンプル', dt: today },
    impVariants:     { before: c2Before, after: c2After },
    nodes:           c2Before.nodes,
    edges:           c2Before.edges,
    groups:          c2Before.groups,
    merges:          c2Before.merges,
    listOrder:       c2Before.listOrder,
    backboneGroupId: c2Before.backboneGroupId,
  };

  // ── ワークスペースを差し替え ──────────────────
  W.charts   = [chart1, chart2];
  W.activeId = 'sc1';
  _uid       = Math.max(_uid, 500);

  // ── 能力表設定（グループ別オーバーライド込み）──
  capSettings.operatingTime  = 420;
  capSettings.targetQty      = 100;
  capSettings.groupOverrides = {
    sg1: { operatingTime: 420, targetQty: 100 },
    sg2: { operatingTime: 480, targetQty:  80 },
  };

  loadChartIntoS(chart1); // improvementMode に基づいて適切なバリアントをロード
  syncChartFromListOrder();  // 合流サブグループ座標を _layoutRows() で正確に再計算してから描画
  graphErrors = {};
  rUB();
  _updateActiveChartDisplay();
  closeWelcome();
  redraw();
  resetView();
  _saveGlobalSettings();
  saveLS();
  setStatus('サンプルを読み込みました — 右上「改善前/改善後」で工程図の構造変化を確認できます');
}

// ─── チャートフォーカス ──────────────────────────

function focusNode(nid) {
  switchView('chart');
  const node = N(nid); if (!node) return;
  S.sel = { kind:'node', id:nid };
  const wr = document.getElementById('cwrap').getBoundingClientRect();
  S.vp.tx = wr.width  / 2 - node.x * S.vp.scale;
  S.vp.ty = wr.height / 2 - node.y * S.vp.scale;
  applyVP(); redraw();
}

// ─── ポップオーバー共通 ──────────────────────────

function _closeFloatingPop(id) { document.getElementById(id)?.remove(); }

function _positionPop(pop, btn) {
  const rect = btn.getBoundingClientRect();
  const pw = pop.offsetWidth || 200, ph = pop.offsetHeight || 150;
  let left = rect.left - 4, top = rect.bottom + 6;
  if (left + pw > window.innerWidth  - 10) left = window.innerWidth  - pw - 10;
  if (top  + ph > window.innerHeight - 10) top  = rect.top - ph - 6;
  if (left < 8) left = 8;
  pop.style.top = top + 'px'; pop.style.left = left + 'px';
}

function _attachPopOutsideClose(pop, onClose) {
  requestAnimationFrame(() => {
    const handler = ev => {
      if (!pop.contains(ev.target)) {
        pop.remove();
        document.removeEventListener('click', handler);
        if (onClose) onClose();
      }
    };
    document.addEventListener('click', handler);
  });
}


// ═══════════════════════════════════════════════
// パレット・配置モード
// ═══════════════════════════════════════════════

let placeType = null;

function buildPalette() {
  let html = '';
  for (const g of GROUPS) {
    html += `<div class="acc closed" data-c="${g.col}" data-gid="${g.id}">
      <div class="acc-hdr" onclick="toggleAcc('${g.id}')">
        <div class="acc-info">
          <div class="acc-lbl">${g.label}</div>
          <div class="acc-sub">${g.sub} · ${g.types.length}種</div>
        </div>
        <span class="acc-chv">›</span>
      </div>
      <div class="acc-body">
        <div class="acc-items">
          ${g.types.map(t => {
            const sd = SYMS[t];
            const dispName = sd.shortName ?? sd.name;
            return `<div class="pi" data-type="${t}" title="${sd.desc || sd.name}">
              <div class="pi-ico">${palIcoSVG(t, 16)}</div>
              <span class="pi-nm">${dispName}</span>
            </div>`;
          }).join('')}
        </div>
      </div>
    </div>`;
  }
  document.getElementById('pal-acc').innerHTML = html;

  document.querySelectorAll('.pi').forEach(el => {
    el.addEventListener('click', () => setPlaceMode(el.dataset.type));
    el.addEventListener('mousedown', ev => {
      if (ev.button !== 0) return;
      const sx = ev.clientX, sy = ev.clientY;
      let dragging = false;
      const type = el.dataset.type;
      const prevSelId = S.sel?.kind === 'node' ? S.sel.id : null;

      const onM = mv => {
        if (!dragging && Math.hypot(mv.clientX - sx, mv.clientY - sy) > 8) {
          dragging = true; placeType = type;
          document.querySelectorAll('.pi').forEach(e => e.classList.remove('placing'));
          el.classList.add('placing');
          document.getElementById('pmbar').classList.add('on');
          document.getElementById('cvs').classList.add('placing');
        }
      };
      const onU = uev => {
        window.removeEventListener('mousemove', onM);
        window.removeEventListener('mouseup',   onU);
        if (dragging && placeType) {
          const r = document.getElementById('cvs').getBoundingClientRect();
          if (uev.clientX >= r.left && uev.clientX <= r.right &&
              uev.clientY >= r.top  && uev.clientY <= r.bottom) {
            const w = c2w(uev.clientX, uev.clientY);
            // フロー線・記号上へのドロップは挿入、それ以外は自動接続配置
            placeSymbolAt(placeType, w.x, w.y, prevSelId);
          }
          cancelPlace(); redraw();
        }
      };
      window.addEventListener('mousemove', onM);
      window.addEventListener('mouseup',   onU);
    });
  });

  document.querySelector('.acc[data-gid="kako"]')?.classList.remove('closed');
  document.querySelector('.acc[data-gid="kiten"]')?.classList.remove('closed');
}

function toggleAcc(gid) {
  document.querySelector(`.acc[data-gid="${gid}"]`)?.classList.toggle('closed');
}

// ═══════════════════════════════════════════════
// チャートビュー用パレットバー
// クリック → setPlaceMode トグル
// ドラッグ → キャンバスへ直接ドロップ配置
// ═══════════════════════════════════════════════

function buildChartPalBar() {
  const bar = document.getElementById('chart-pal-bar'); if (!bar) return;
  let html = '<span class="cpal-lbl"><i class="fa-solid fa-plus"></i> 記号追加</span>';
  GROUPS.forEach((g, gi) => {
    if (gi > 0) html += '<span class="cpal-sep"></span>';
    g.types.forEach(t => {
      const sd = SYMS[t];
      const dispName = sd.shortName ?? sd.name;
      html += `<button class="lpal-btn cpal-btn" data-type="${t}"
        title="${sd.name}｜クリック: 配置モード切替 / ドラッグ: 直接配置">${palIcoSVG(t, 22)}<span class="cpal-nm">${dispName}</span></button>`;
    });
  });
  bar.innerHTML = html;

  bar.querySelectorAll('.cpal-btn').forEach(el => {
    const type = el.dataset.type;

    // クリック → 配置モードトグル
    el.addEventListener('click', () => {
      setPlaceMode(type); // 内部で _syncChartPalBar を呼ぶ
    });

    // ドラッグ → キャンバスへの直接配置
    el.addEventListener('mousedown', ev => {
      if (ev.button !== 0) return;
      const sx = ev.clientX, sy = ev.clientY;
      let dragging = false;
      const prevSelId = S.sel?.kind === 'node' ? S.sel.id : null;

      const onM = mv => {
        if (!dragging && Math.hypot(mv.clientX - sx, mv.clientY - sy) > 8) {
          dragging = true;
          placeType = type;
          _syncChartPalBar();
          document.getElementById('pmbar').classList.add('on');
          document.getElementById('cvs').classList.add('placing');
        }
      };
      const onU = uev => {
        window.removeEventListener('mousemove', onM);
        window.removeEventListener('mouseup',   onU);
        if (dragging && placeType) {
          const r = document.getElementById('cvs').getBoundingClientRect();
          if (uev.clientX >= r.left && uev.clientX <= r.right &&
              uev.clientY >= r.top  && uev.clientY <= r.bottom) {
            const w = c2w(uev.clientX, uev.clientY);
            // フロー線・記号上へのドロップは挿入、それ以外は自動接続配置
            placeSymbolAt(placeType, w.x, w.y, prevSelId);
          }
          cancelPlace(); // 内部で _syncChartPalBar を呼ぶ
          redraw();
        }
      };
      window.addEventListener('mousemove', onM);
      window.addEventListener('mouseup',   onU);
    });
  });
}

/** チャートパレットバーのアクティブ状態を placeType に同期 */
function _syncChartPalBar() {
  document.querySelectorAll('.cpal-btn').forEach(btn => {
    btn.classList.toggle('cpal-placing', btn.dataset.type === placeType);
  });
}

function setPlaceMode(type) {
  placeType = (placeType === type) ? null : type;
  document.querySelectorAll('.pi').forEach(el => el.classList.toggle('placing', el.dataset.type === placeType));
  document.getElementById('pmbar').classList.toggle('on', !!placeType);
  document.getElementById('cvs').classList.toggle('placing', !!placeType);
  if (!placeType) document.getElementById('TL').innerHTML = '';
  _syncChartPalBar();
  setStatus(placeType ? `「${SYMS[placeType].name}」を配置モード — キャンバスをクリック` : '準備完了');
}

function cancelPlace() {
  placeType = null; IA = null;
  document.querySelectorAll('.pi').forEach(el => el.classList.remove('placing'));
  document.getElementById('pmbar').classList.remove('on');
  document.getElementById('cvs').classList.remove('placing');
  document.getElementById('cvs').style.cursor = '';
  document.getElementById('TL').innerHTML = '';
  _syncChartPalBar();
  setStatus('準備完了');
}

function showGhost(wx, wy) {
  if (!placeType) { document.getElementById('TL').innerHTML = ''; return; }
  const sp = snapP(wx, wy);
  // 挿入候補（フロー線・記号）の検出はグリッド吸着前の実ポインタ位置で行う
  const probe  = { id: '__ghost__', type: placeType, x: wx, y: wy };
  const target = _findInsertTarget(probe);
  _renderGhostAndHint(probe, sp.x, sp.y, target);
}

// ═══════════════════════════════════════════════
// アクション
// ═══════════════════════════════════════════════

function switchView(view) {
  currentView = view;
  ['chart','list','routemap','capacity'].forEach(v => {
    document.getElementById(`view-${v}`)?.classList.toggle('active', v === view);
    document.getElementById(`tab-${v}`)?.classList.toggle('active', v === view);
  });
  const isChart   = view === 'chart';
  const isDocView = view === 'chart' || view === 'list';

  // ビュー操作ツールバー: チャート/リスト（編集系ビュー）でのみ表示。
  // チャート専用の操作グループ（ズーム・表示切替・整列など）はチャート時のみ。
  const vtb = document.getElementById('view-toolbar');
  if (vtb) vtb.style.display = isDocView ? 'flex' : 'none';
  document.getElementById('chart-tools').style.display = isChart ? 'flex' : 'none';

  document.getElementById('pmbar').style.display         = isChart ? '' : 'none';
  document.getElementById('pal-scroll').style.display    = isChart ? '' : 'none';
  document.getElementById('sid-list').style.display      = view === 'list'     ? 'flex' : 'none';
  document.getElementById('sid-routemap').style.display  = view === 'routemap' ? 'flex' : 'none';
  document.getElementById('sid-capacity').style.display  = view === 'capacity' ? 'flex' : 'none';

  // チャート・リスト時以外はプロパティパネル(右ドロワー)を非表示にし、開いている場合は閉じる
  const rpPull = document.getElementById('rp-pull');
  const rpToggle = document.getElementById('rp-toggle-btn');
  if (rpPull) rpPull.style.display = isDocView ? '' : 'none';
  if (rpToggle) rpToggle.style.display = isDocView ? '' : 'none';
  if (!isDocView && typeof closeDrawer === 'function') {
    closeDrawer();
  }

  if (view === 'list')     { updateListPanel(); _updateBackboneHint(); _updateSlistInfo(); }
  if (view === 'routemap') {
    if (!_routemapSelected.size) W.charts.forEach(c => _routemapSelected.add(c.id));
    _syncRoutemapButtons();
    updateRouteMap();
  }
  if (view === 'capacity') {
    // アクティブチャートをサイドバーで自動展開
    if (W.activeId) _capSideOpen.add(W.activeId);
    updateCapacityView();
  }
}

function deleteSel() {
  if (S.sel?.kind === 'merge') { deleteMerge(S.sel.id); return; }
  if (S.sel?.kind === 'multi') {
    pushUndo();
    const ids = S.sel.ids;
    S.nodes     = S.nodes.filter(n => !ids.includes(n.id));
    S.edges     = S.edges.filter(e => !ids.includes(e.from) && !ids.includes(e.to));
    S.listOrder = S.listOrder.filter(id => !ids.includes(id));
    for (const g of (S.groups ||[])) {
      if (g.nodeOrder) g.nodeOrder = g.nodeOrder.filter(id => !ids.includes(id));
    }
    S.merges = (S.merges ||[]).filter(m => {
      const last = getGroupLastNode(m.subGroupId);
      return last && !ids.includes(m.targetNodeId);
    });
    S.sel = null; redraw(); return;
  }

  if (!S.sel) return;
  pushUndo();
  if (S.sel.kind === 'node') {
    const id    = S.sel.id;
    S.nodes     = S.nodes.filter(n => n.id !== id);
    S.edges     = S.edges.filter(e => e.from !== id && e.to !== id);
    S.listOrder = S.listOrder.filter(i => i !== id);
  } else {
    S.edges = S.edges.filter(e => e.id !== S.sel.id);
  }
  S.sel = null;
  redraw();
}

function clearAll() {
  if (!confirm('全データをクリアしますか？')) return;
  pushUndo();
  const newId    = uid();
  const emptyMeta = { hb:'', hm:'', sk:'', dt: new Date().toISOString().split('T')[0] };
  W.charts  = [{ id: newId, name: '工程図1', backboneGroupId: null,
    meta: { ...emptyMeta }, nodes: [], edges: [], groups: [], merges: [], listOrder: [] }];
  W.activeId        = newId;
  S.meta            = { ...emptyMeta };
  S.nodes           = []; S.edges = []; S.groups = []; S.listOrder = []; S.sel = null;
  S.backboneGroupId = null;
  _lpCollapsed.clear();
  _lpChartCollapsed.clear();
  _lpChartInitDone  = false;
  _routemapSelected.clear(); // 経路図の選択状態もリセット
  _routemapGroupSel.clear();
  _routemapExpanded.clear();
  _updateActiveChartDisplay();
  saveLS();
  redraw();
  showWelcome();
}

function toggleNums() {
  showNums = !showNums;
  document.getElementById('btn-nums').classList.toggle('on', showNums);
  redraw();
}

/** 起点直後などの非表示配線（最終出力では隠れる線）を作成中だけ可視化するモードを切り替える */
function toggleHiddenWire() {
  showHiddenWire = !showHiddenWire;
  document.getElementById('btn-hidden-wire').classList.toggle('on', showHiddenWire);
  renderEdges();
  setStatus(showHiddenWire
    ? '非表示配線を表示中 — 最終出力（印刷・画像保存）では引き続き非表示です'
    : '非表示配線の表示をオフにしました');
}

/** ドラッグ移動時の挙動を切り替える: ON=配線を保持したまま位置だけ調整 / OFF=線・記号への挿入 */
function toggleMoveOnlyMode() {
  moveOnlyMode = !moveOnlyMode;
  document.getElementById('btn-move-only').classList.toggle('on', moveOnlyMode);
  setStatus(moveOnlyMode
    ? '配置調整モード ON — ドラッグしても配線は切れず、位置だけ動かせます'
    : '配置調整モード OFF — ドラッグで線・記号への挿入ができます');
}

/** チャート上の工程記号に所属グループ名バッジを表示するかどうかを切り替える */
function toggleGroupBadge() {
  showGroupBadge = !showGroupBadge;
  document.getElementById('btn-group-badge').classList.toggle('on', showGroupBadge);
  renderNodes();
  setStatus(showGroupBadge ? 'グループ名バッジを表示中' : 'グループ名バッジの表示をオフにしました');
}

// 右ドロワー
let _drawerOpen = false;

function toggleDrawer() { _drawerOpen ? closeDrawer() : openDrawer(); }

function openDrawer() {
  _drawerOpen = true;
  document.getElementById('rp').classList.add('open');
  document.getElementById('rp-pull').classList.add('open');
  document.getElementById('rp-toggle-btn').classList.add('on');
  updateProps();
}

function closeDrawer() {
  _drawerOpen = false;
  document.getElementById('rp').classList.remove('open');
  document.getElementById('rp-pull').classList.remove('open');
  document.getElementById('rp-toggle-btn').classList.remove('on');
}

// グループ管理

function deleteMerge(mid) {
  pushUndo();
  S.merges = (S.merges ||[]).filter(m => m.id !== mid);
  if (S.sel?.kind === 'merge' && S.sel.id === mid) S.sel = null;
  syncChartFromListOrder();
  redraw();
}


function addGroup(label, color) {
  pushUndo();
  const g = {
    id:    uid(),
    label: label || '新規グループ',
    color: color || GROUP_COLORS[S.groups.length % GROUP_COLORS.length],
  };
  S.groups.push(g);
  redraw();
  return g.id;
}

function updateGroup(gid, patch) {
  const g = G(gid); if (!g) return;
  Object.assign(g, patch);
  redraw();
}

function deleteGroup(gid) {
  const g = G(gid); if (!g) return;
  const members = S.nodes.filter(n => n.groupId === gid).length;
  if (members > 0) {
    if (!confirm(`グループ「${g.label}」を削除しますか？\n所属する ${members} 件の記号はグループなしになります。`)) return;
  }
  pushUndo();
  S.nodes.forEach(n => { if (n.groupId === gid) n.groupId = null; });
  S.groups = S.groups.filter(x => x.id !== gid);
  redraw();
}

function setNodeGroup(nid, gid) {
  const node = N(nid); if (!node) return;
  pushUndo();
  node.groupId = gid || null;
  redraw();
}

/** 工程記号を1件複製する（リスト/チャート/プロパティパネル共通）。
 *  複製はどの線にも繋がっていない状態で追加され、ドラッグで好きな位置に挿入できる。 */
function duplicateNode(nid) {
  const src = N(nid); if (!src) return null;
  pushUndo();
  const copy = JSON.parse(JSON.stringify(src));
  copy.id = uid();
  if (copy.label) copy.label += ' (コピー)';
  copy.y = src.y + C * 3; // 3マス分下にずらして元の記号と重ならないようにする
  S.nodes.push(copy);
  _insertInListOrder(copy.id, src.id);
  S.sel = { kind:'node', id: copy.id };
  redraw();
  setStatus(`「${getEffectiveLabel(src) || SYMS[src.type].name}」を複製しました — 線や記号にドラッグすると挿入できます`);
  return copy;
}

/** グループ全体（起点・内部の接続線を含む）を複製し、他と重ならない位置に独立コピーとして追加する。
 *  外部への接続（合流・別グループからの入力）は複製されない。 */
function duplicateGroup(gid) {
  const g = G(gid); if (!g) return null;
  const members = S.nodes.filter(n => n.groupId === gid);
  if (!members.length) { setStatus('空のグループは複製できません'); return null; }
  pushUndo();

  const newG = { ...JSON.parse(JSON.stringify(g)), id: uid(), label: g.label + ' (コピー)', isDefault: false };
  S.groups.push(newG);

  const minY    = Math.min(...members.map(n => n.y));
  const allMaxY = S.nodes.length ? Math.max(...S.nodes.map(n => n.y)) : 0;
  const dy      = (allMaxY - minY) + 140; // 既存の全記号より下へまとめて配置

  const nidMap = {};
  const copies = members.map(n => {
    const c = JSON.parse(JSON.stringify(n));
    nidMap[n.id] = c.id = uid();
    c.groupId = newG.id;
    c.y += dy;
    return c;
  });
  S.nodes.push(...copies);

  const memberIds = new Set(members.map(n => n.id));
  const newEdges = S.edges
    .filter(e => memberIds.has(e.from) && memberIds.has(e.to))
    .map(e => ({ ...e, id: uid(), from: nidMap[e.from], to: nidMap[e.to] }));
  S.edges.push(...newEdges);

  S.listOrder.push(...copies.map(c => c.id));
  _syncListOrderFromGraph();

  S.sel = { kind:'node', id: copies[0]?.id ?? null };
  redraw();
  setStatus(`グループ「${g.label}」を複製しました（${copies.length}件）— 図の下部に配置されています`);
  return newG;
}

function toggleNodeBadge(nid, bid) {
  const node = N(nid); if (!node) return;
  node.badges = node.badges ||[];
  const idx = node.badges.indexOf(bid);
  if (idx >= 0) node.badges.splice(idx, 1); else node.badges.push(bid);
  redraw();
}

// ── フローティングガイド ─────────────────────────
function toggleGuide() {
  document.getElementById('guide-float').classList.toggle('gf-hidden');
}


// ═══════════════════════════════════════════════
// 工程図一覧パネル
// ═══════════════════════════════════════════════

function updateChartsPanel() {
  if (currentView !== 'routemap') return;

  const countEl = document.getElementById('charts-count');
  if (countEl) countEl.textContent = `${W.charts.length} 件`;

  const body = document.getElementById('rm-chart-sel'); if (!body) return;

  if (!W.charts.length) {
    body.innerHTML = '<div class="rm-empty-msg"><i class="fa-solid fa-folder-open"></i><p>工程図がありません</p></div>';
    return;
  }

  body.innerHTML = W.charts.map(c => {
    const isActive  = c.id === W.activeId;
    const isSel     = _routemapSelected.has(c.id);
    const cd        = isActive
      ? { nodes: S.nodes, groups: S.groups, backboneGroupId: S.backboneGroupId }
      : getChartData(c);
    const gidBB     = (cd.groups.some(g => g.id === cd.backboneGroupId) ? cd.backboneGroupId : null)
      || findLongestLineGroupId(cd.nodes, cd.groups);
    const bbGroup   = gidBB ? cd.groups.find(g => g.id === gidBB) : null;
    const isAuto    = !cd.backboneGroupId && bbGroup;
    const nodeCount = cd.nodes.length;
    const numCount  = cd.nodes.filter(n => isNumType(n.type)).length;

    return `
<div class="rm-chart-card${isSel ? ' rm-card-selected' : ''}${isActive ? ' rm-card-active' : ''}" data-cid="${c.id}"
  onclick="onRmCardClick(event, '${c.id}')" title="クリックして経路図に含める/除外">
  <div class="rm-card-top">
    <label class="rm-card-check-wrap" title="${isSel ? '経路図から除外' : '経路図に含める'}">
      <input type="checkbox" ${isSel ? 'checked' : ''} onchange="toggleRoutemapChart('${c.id}', this.checked); this.closest('.rm-chart-card').classList.toggle('rm-card-selected', this.checked)">
    </label>
    <span class="rm-card-name" data-cid="${c.id}"
      ondblclick="startRenameChart('${c.id}', this)"
      title="ダブルクリックで名前変更">${esc(c.name)}</span>
    ${isActive ? '<span class="rm-card-active-dot" title="編集中"><i class="fa-solid fa-circle-dot"></i></span>' : ''}
  </div>
  <div class="rm-card-info">
    <span class="rm-card-bb${bbGroup ? '' : ' rm-no-bb'}" style="${bbGroup ? `color:${bbGroup.color}` : ''}">
      <i class="fa-solid fa-${bbGroup ? 'bone' : 'circle-exclamation'}"></i>
      ${bbGroup
        ? `${isAuto ? '<small class="rm-auto-lbl">自動</small>' : ''}${esc(bbGroup.label)}`
        : '背骨未設定'
      }
    </span>
    <span class="rm-card-nodes" title="${nodeCount}工程 / ${numCount}番号">
      <i class="fa-solid fa-circle-nodes"></i>${nodeCount}
      <i class="fa-solid fa-list-ol" style="margin-left:4px"></i>${numCount}
    </span>
  </div>
  <div class="rm-card-acts">
    ${!isActive
      ? `<button class="btn bp rm-card-open-btn"
           onclick="switchToChart('${c.id}');switchView('chart')" title="開いて編集">
           <i class="fa-solid fa-arrow-right-to-bracket"></i> 開く
         </button>`
      : `<button class="btn rm-card-open-btn rm-card-editing-btn"
           onclick="switchView('chart')" title="チャートビューへ">
           <i class="fa-solid fa-diagram-project"></i> 編集中
         </button>`
    }
    <button class="tbtn rm-card-act-btn" onclick="openChartBackbonePop('${c.id}', this)" title="背骨グループを設定">
      <i class="fa-solid fa-bone"></i>
    </button>
    <button class="tbtn rm-card-act-btn" onclick="duplicateChart('${c.id}')" title="複製">
      <i class="fa-solid fa-copy"></i>
    </button>
    <button class="tbtn rm-card-act-btn danger" onclick="deleteChart('${c.id}')" title="削除"
      ${W.charts.length <= 1 ? 'disabled' : ''}>
      <i class="fa-solid fa-trash-can"></i>
    </button>
  </div>
</div>`;
  }).join('');
}

function startRenameChart(cid, el) {
  const c = W.charts.find(x => x.id === cid); if (!c) return;
  const inp = document.createElement('input');
  inp.className = 'chart-rename-inp';
  inp.value = c.name;
  el.replaceWith(inp);
  inp.focus(); inp.select();
  const commit = () => {
    const v = inp.value.trim();
    if (v && v !== c.name) { 
      c.name = v; 
      if (cid === W.activeId) _updateActiveChartDisplay(); 
      saveLS(); 
    }
    // 各ビューでデータ連動（経路図の表示更新）
    if (currentView === 'routemap') updateRouteMap();
  };
  inp.addEventListener('blur', commit);
  inp.addEventListener('keydown', ev => {
    if (ev.key === 'Enter')  { ev.preventDefault(); inp.blur(); }
    if (ev.key === 'Escape') { inp.value = c.name; inp.blur(); }
    ev.stopPropagation();
  });
}

function addNewChart() {
  syncActiveChart();
  const id = addChartEntry('新規工程図 ' + W.charts.length);
  W.activeId = id;
  loadChartIntoS(W.charts[W.charts.length - 1]);
  _updateActiveChartDisplay();
  _routemapSelected.add(id);  // 新規工程図は経路図に自動追加
  rUB(); saveLS();
  updateChartsPanel();
  // 名前変更モードを自動起動（ルートマップサイドバーのカード名要素）
  requestAnimationFrame(() => {
    const el = document.querySelector(`.rm-card-name[data-cid="${id}"]`);
    if (el) startRenameChart(id, el);
  });
  setStatus('新規工程図を作成しました');
}

function duplicateChart(cid) {
  const src = cid === W.activeId ? W.charts.find(c => c.id === cid) : W.charts.find(c => c.id === cid);
  if (!src) return;
  if (cid === W.activeId) syncActiveChart();

  const newId  = uid();
  const copy   = JSON.parse(JSON.stringify(src));
  copy.id      = newId;
  copy.name    = src.name + ' (コピー)';

  const nidMap = {}, gidMap = {};
  copy.nodes.forEach(n => { nidMap[n.id] = uid(); n.id = nidMap[n.id]; });
  copy.groups.forEach(g => { gidMap[g.id] = uid(); g.id = gidMap[g.id]; });
  copy.edges.forEach(e => {
    e.id = uid();
    e.from = nidMap[e.from] || e.from;
    e.to   = nidMap[e.to]   || e.to;
  });
  copy.nodes.forEach(n => { if (n.groupId) n.groupId = gidMap[n.groupId] || null; });
  copy.merges = (copy.merges ||[]).map(m => ({
    ...m, id: uid(),
    subGroupId:  gidMap[m.subGroupId]      || m.subGroupId,
    targetNodeId: nidMap[m.targetNodeId]   || m.targetNodeId,
  }));
  copy.listOrder       = copy.listOrder.map(id => nidMap[id] || id);
  copy.backboneGroupId = copy.backboneGroupId ? (gidMap[copy.backboneGroupId] || null) : null;

  W.charts.push(copy);
  saveLS();
  updateChartsPanel();
  setStatus(`「${src.name}」を複製しました`);
}

function deleteChart(cid) {
  if (W.charts.length <= 1) { setStatus('最後の工程図は削除できません'); return; }
  const c = W.charts.find(x => x.id === cid); if (!c) return;
  if (!confirm(`「${c.name}」を削除しますか？この操作は元に戻せません。`)) return;

  _routemapSelected.delete(cid); // 経路図選択状態からも除去
  _routemapGroupSel.delete(cid);
  _routemapExpanded.delete(cid);

  if (W.activeId === cid) {
    const other = W.charts.find(x => x.id !== cid);
    if (other) { W.activeId = other.id; loadChartIntoS(other); _updateActiveChartDisplay(); rUB(); redraw(); }
  }
  W.charts = W.charts.filter(x => x.id !== cid);
  saveLS();

  // ビューに応じてパネル・テーブルを正しく更新
  if (currentView === 'routemap')    updateRouteMap();   // カード + テーブル両方更新
  else if (currentView === 'list')   updateListPanel();  // リストパネル更新
  else                               updateChartsPanel();

  setStatus(`「${c.name}」を削除しました`);
}

// ── 背骨グループ ポップオーバー ─────────────────

function openChartBackbonePop(cid, btn) {
  _closeFloatingPop('_chart_bb_pop');
  const c = W.charts.find(x => x.id === cid); if (!c) return;
  // getChartData() は改善前/改善後バリアントを考慮した「現在モードで実際に使われる」
  // groups / backboneGroupId を返す。ここを c.groups / c.backboneGroupId に直接アクセス
  // すると、バリアントを持つチャートで古い（別モードの）値を参照してしまい、
  // 「自動」を選んでも実際の表示に反映されない不具合につながる。
  const cd     = (cid === W.activeId) ? { groups: S.groups, backboneGroupId: S.backboneGroupId } : getChartData(c);
  const groups = cd.groups || [];

  const pop = document.createElement('div');
  pop.id = '_chart_bb_pop'; pop.className = 'fl-pop group-pop';

  const options =[
    { id: null, label: '自動（一番長いライン）', color: '#94a3b8' },
    ...groups.map(g => ({ id: g.id, label: g.label, color: g.color })),
  ];
  const cur = cd.backboneGroupId;

  pop.innerHTML = `
    <div class="fl-pop-hdr"><i class="fa-solid fa-bone"></i> 背骨グループを選択</div>
    <p class="gpop-desc">経路図の比較基準となる工程系列</p>
    ${groups.length === 0
      ? '<p class="gpop-hint"><i class="fa-solid fa-circle-info"></i> グループが未作成です</p>'
      : ''
    }
    ${options.map(opt => {
      const active = cur === opt.id;
      return `<button class="gpop-item${active ? ' active' : ''}" data-gid="${opt.id || ''}">
        <span class="gpop-color" style="background:${opt.color}"></span>
        <span class="gpop-label">${esc(opt.label)}</span>
        ${opt.id ? `<i class="fa-solid fa-bone" style="color:${opt.color};font-size:10px;opacity:.7"></i>` : ''}
        ${active ? '<i class="fa-solid fa-check gpop-check"></i>' : ''}
      </button>`;
    }).join('')}`;

  document.body.appendChild(pop);
  _positionPop(pop, btn);
  pop.querySelectorAll('.gpop-item').forEach(item => {
    item.addEventListener('click', ev => {
      ev.stopPropagation();
      setChartBackbone(cid, item.dataset.gid || null);
      pop.remove();
    });
  });
  _attachPopOutsideClose(pop);
}

function openListBackbonePop(btn) {
  openChartBackbonePop(W.activeId, btn);
}

function _updateBackboneHint() {
  const el = document.getElementById('backbone-hint'); if (!el) return;
  const gid = getBackboneGroupId();
  const g   = gid ? G(gid) : null;
  if (!g) {
    el.textContent = '（グループなし）';
  } else if (S.backboneGroupId) {
    el.textContent = g.label;
  } else {
    el.textContent = `自動: ${g.label}`;
  }
}

// ═══════════════════════════════════════════════
// 工程経路図モード
// ═══════════════════════════════════════════════

let _routemapSelected    = new Set();
let _routemapGroupSel    = new Map();
let _routemapExpanded    = new Set();
let _routemapHeaderMode  = 'vertical'; // 'normal' | 'vertical' | 'compact'
let _routemapRowMode     = 'backbone'; // 'backbone'=背骨のみ | 'groups'=グループ別
let _routemapSplit       = false;      // false=統合 | true=工程図別分割

function updateRouteMap() {
  if (currentView !== 'routemap') return;
  syncActiveChart(); // 常に最新のアクティブチャート情報を反映する

  // サイドバー（工程図カードリスト）を更新
  updateChartsPanel();

  _renderRouteTable();
}

function toggleRoutemapChart(cid, checked) {
  if (checked) _routemapSelected.add(cid);
  else _routemapSelected.delete(cid);
  _renderRouteTable();
}

/** カード本体のクリックをチェックボックスと同じ挙動にする（ボタン・チェックボックス自体は除外） */
function onRmCardClick(e, cid) {
  if (e.target.closest('.rm-card-check-wrap, .rm-card-acts, button, a, input')) return;
  const card = e.currentTarget;
  const next = !_routemapSelected.has(cid);
  const cb = card.querySelector('.rm-card-check-wrap input[type="checkbox"]');
  if (cb) cb.checked = next;
  card.classList.toggle('rm-card-selected', next);
  toggleRoutemapChart(cid, next);
}

function selectAllRoutemapCharts()  { W.charts.forEach(c => _routemapSelected.add(c.id));  updateRouteMap(); }
function clearRoutemapCharts()      { _routemapSelected.clear(); updateRouteMap(); }

// ── 16進カラー → rgba 変換ヘルパー ─────────────────
function _hex2alpha(hex, alpha) {
  if (!hex || hex.length < 7) return 'transparent';
  try {
    const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
    return `rgba(${r},${g},${b},${alpha})`;
  } catch { return 'transparent'; }
}

// ── 列ヘッダー / 行の単位 / テーブル分割 モード制御 ────────

/** 列ヘッダーモードを設定 */
function setRoutemapHeaderMode(mode) {
  _routemapHeaderMode = mode;
  ['normal','vertical','compact'].forEach(m =>
    document.getElementById(`rm-hdr-${m}`)?.classList.toggle('active', m === mode));
  _renderRouteTable();
}

/** 行の単位（背骨のみ / グループ別）を設定 */
function setRoutemapRowMode(mode) {
  _routemapRowMode = mode;
  ['backbone','groups'].forEach(m =>
    document.getElementById(`rm-row-${m}`)?.classList.toggle('active', m === mode));
  _renderRouteTable();
}

/** テーブル分割モードを設定 */
function setRoutemapSplit(split) {
  _routemapSplit = split;
  document.getElementById('rm-tbl-merged')?.classList.toggle('active', !split);
  document.getElementById('rm-tbl-split')?.classList.toggle('active',   split);
  _renderRouteTable();
}

/** 初回表示時にボタン状態を変数と同期 */
function _syncRoutemapButtons() {
  ['normal','vertical','compact'].forEach(m =>
    document.getElementById(`rm-hdr-${m}`)?.classList.toggle('active', m === _routemapHeaderMode));
  ['backbone','groups'].forEach(m =>
    document.getElementById(`rm-row-${m}`)?.classList.toggle('active', m === _routemapRowMode));
  document.getElementById('rm-tbl-merged')?.classList.toggle('active', !_routemapSplit);
  document.getElementById('rm-tbl-split')?.classList.toggle('active',   _routemapSplit);
}

// ── 経路テーブル HTML ビルダー（単一テーブル）────────────
/**
 * rows, columns からテーブルHTML文字列を返す。
 * @param {Array}    rows
 * @param {string[]} columns
 * @param {string}   headerMode - 'normal' | 'vertical' | 'compact'
 * @param {boolean}  groupRows  - true=グループバッジ付き行（allGroupsモード）
 */
function _buildRouteTableHTML(rows, columns, headerMode, groupRows) {
  const modeClass = headerMode !== 'normal' ? ` rm-hdr-${headerMode}` : '';
  const colCount  = columns.length + 1;
  let html = `<table class="rm-table${modeClass}"><thead><tr>`;
  html += `<th class="rm-th-chart"><i class="fa-solid fa-diagram-project"></i> 工程図名</th>`;

  // 縦書きモードでは、ブラウザ・フォントによる自動計算に頼らず、最長の工程名の
  // 文字数から必要な高さを明示的に算出してヘッダーセルへ適用する。自動計算だけに
  // 頼ると環境によって縦書きテキストの高さが実際の文字数どおりに確保されず、
  // 工程名が途中で見切れることがあるため。
  let vertHdrStyle = '';
  if (headerMode === 'vertical' && columns.length) {
    const maxLen = Math.max(...columns.map(c => c.length));
    vertHdrStyle = ` style="height:${maxLen * 13 + 16}px"`;
  }

  columns.forEach(col => {
    html += `<th class="rm-th-process"${vertHdrStyle} title="${esc(col)}"><span class="rm-col-name">${esc(col)}</span></th>`;
  });
  html += '</tr></thead><tbody>';

  for (const row of rows) {
    const cid    = row.chartId;
    const seqMap = new Map(row.processes.map(p => [p.label, p.seq]));
    const isActive    = cid === W.activeId;
    const hasNoTarget = row.processes.length === 0;
    const noTargetHTML = `<span class="rm-no-target" title="加工・検査（通し番号が付く工程）がありません">
      <i class="fa-solid fa-circle-minus"></i>対象工程なし</span>`;

    let cellsHTML;
    if (hasNoTarget && columns.length > 0) {
      // 他の行に工程名列があるのに、この行だけ対象が無い場合は列全体にまたがるメッセージにする
      cellsHTML = `<td class="rm-td-empty" colspan="${columns.length}">${noTargetHTML}</td>`;
    } else if (!hasNoTarget) {
      cellsHTML = columns.map(col => {
        const seq = seqMap.get(col);
        return seq != null
          ? `<td class="rm-td-val"><span class="rm-circle">${seq}</span></td>`
          : `<td class="rm-td-null"></td>`;
      }).join('');
    } else {
      cellsHTML = ''; // このテーブル自体に工程名列が無い（単独で対象が無いグループ）→ 氏名セル側に表示
    }
    // 工程名列が1つも無いテーブルでは、氏名セルの中に「対象工程なし」を添える
    const nameNote = (hasNoTarget && columns.length === 0) ? noTargetHTML : '';

    if (groupRows) {
      const gc = row.groupColor || '#94a3b8';
      html += `<tr class="rm-row-data ${isActive ? 'rm-row-active' : ''}${hasNoTarget ? ' rm-row-no-target' : ''}">
        <td class="rm-td-chart">
          ${isActive ? '<span class="rm-active-dot" title="編集中"></span>' : ''}
          <span class="rm-chart-name" data-cid="${cid}"
            ondblclick="startRenameChart('${cid}', this); event.stopPropagation();"
            title="ダブルクリックで名前変更" style="cursor:text;">${esc(row.chartName)}</span>
          ${row.groupLabel ? `<span class="rm-td-chart-grp"
            style="color:${esc(gc)};border-color:${_hex2alpha(gc,0.5)};background:${_hex2alpha(gc,0.08)}"
            title="${row.isBb ? '背骨グループ' : '枝葉グループ（サブライン・部品）'}">${esc(row.groupLabel)}</span>` : ''}
          ${nameNote}
        </td>${cellsHTML}</tr>`;
    } else {
      const isExp    = _routemapExpanded.has(cid);
      const chart    = W.charts.find(c => c.id === cid);
      // getChartData() で改善前/改善後バリアントを考慮した「現在モードで実際に使われる」
      // groups / nodes / backboneGroupId を取得する。chart.groups 等に直接アクセスすると
      // バリアントを持つチャートで古い（別モードの）グループ一覧・背骨IDを参照してしまい、
      // ここでの背骨/枝葉判定が toggleRmGroupCheck() 側の判定とズレて選択状態の表示が
      // 壊れる（チェックしたはずのグループ行が消えるなど）原因になる。
      const cd       = chart ? ((cid === W.activeId) ? { groups: S.groups, nodes: S.nodes, backboneGroupId: S.backboneGroupId } : getChartData(chart)) : { groups: [], nodes: [], backboneGroupId: null };
      const groups   = cd.groups || [];
      const bbGid    = (groups.some(g => g.id === cd.backboneGroupId) ? cd.backboneGroupId : null)
        || findLongestLineGroupId(cd.nodes || [], groups);
      const selGrps  = _routemapGroupSel.has(cid)
        ? _routemapGroupSel.get(cid)
        : (bbGid ? new Set([bbGid]) : new Set());
      const isCustom = _routemapGroupSel.has(cid) && !(selGrps.size === 1 && selGrps.has(bbGid));

      html += `<tr class="rm-row-data ${isActive ? 'rm-row-active' : ''} ${isExp ? 'rm-row-expanded' : ''}${hasNoTarget ? ' rm-row-no-target' : ''}">
        <td class="rm-td-chart rm-td-chart-exp" onclick="toggleRmGroupExpand('${cid}')">
          <span class="rm-exp-chv${isExp ? ' open' : ''}"><i class="fa-solid fa-chevron-right"></i></span>
          ${isActive ? '<span class="rm-active-dot" title="編集中"></span>' : ''}
          ${isCustom ? `<span class="rm-grp-custom-badge" title="${selGrps.size}グループを表示中"><i class="fa-solid fa-layer-group"></i>${selGrps.size}</span>` : ''}
          <span class="rm-chart-name" data-cid="${cid}"
            ondblclick="startRenameChart('${cid}', this); event.stopPropagation();"
            title="ダブルクリックで名前変更" style="cursor:text;">${esc(row.chartName)}</span>
          ${nameNote}
        </td>${cellsHTML}</tr>`;

      let grpInner;
      if (!groups.length) {
        grpInner = `<div class="rm-grp-inner rm-grp-nogroup">
          <i class="fa-solid fa-circle-info"></i>
          この工程図にはグループが設定されていません。<br>
          <span class="rm-grp-nogroup-hint">リストビューの「グループ追加」でグループを作成できます。</span>
        </div>`;
      } else {
        const chips = groups.map(g => {
          const isBb = g.id === bbGid, chkd = selGrps.has(g.id), dotC = g.color || '#94a3b8';
          return `<label class="rm-grp-chip${chkd ? ' on' : ''}"
            title="${isBb ? '背骨グループ' : '枝葉グループ（サブライン・部品）'}">
            <input type="checkbox" ${chkd ? 'checked' : ''}
              onchange="toggleRmGroupCheck('${cid}','${g.id}',this.checked)"
              onclick="event.stopPropagation()">
            <span class="rm-grp-chip-dot" style="background:${esc(dotC)}"></span>
            <span class="rm-grp-chip-lbl">${esc(g.label)}</span>
            ${isBb
              ? '<i class="fa-solid fa-bone rm-bb-ico" title="背骨グループ"></i>'
              : '<i class="fa-solid fa-code-branch rm-br-ico" title="枝葉グループ"></i>'}
          </label>`;
        }).join('');
        grpInner = `<div class="rm-grp-inner">
          <span class="rm-grp-label"><i class="fa-solid fa-layer-group"></i> 表示グループ</span>
          ${chips}
          <button class="rm-grp-reset" onclick="resetRmGroupSel('${cid}')" title="背骨グループのみに戻す">
            <i class="fa-solid fa-rotate-left"></i> 初期化
          </button>
        </div>`;
      }
      html += `<tr class="rm-grp-row${isExp ? ' rm-grp-row-open' : ''}" id="rm-grp-${cid}"${!isExp ? ' style="display:none"' : ''}>
        <td colspan="${colCount}" class="rm-grp-td">${grpInner}</td>
      </tr>`;
    }
  }

  html += '</tbody></table>';
  return html;
}

// ── 工程経路図テーブル描画 ─────────────────────────────
function _renderRouteTable() {
  const wrap = document.getElementById('rm-table-wrap'); if (!wrap) return;

  const selected = [..._routemapSelected].filter(id => W.charts.some(c => c.id === id));
  if (!selected.length) {
    wrap.innerHTML = `<div class="rm-empty">
      <i class="fa-solid fa-table"></i>
      <p>左のリストから工程図を選択してください</p>
    </div>`;
    document.getElementById('rm-stats').textContent = '';
    return;
  }

  syncActiveChart();

  const useGroups = _routemapRowMode === 'groups';

  // ── テーブルデータ生成（統合 or 工程図別分割）────────────
  let tables;

  if (_routemapSplit) {
    tables = [];
    for (const cid of selected) {
      const chart  = W.charts.find(c => c.id === cid); if (!chart) continue;
      const selMap = new Map([[cid, _routemapGroupSel.get(cid)]]);
      const { tables: t } = computeRouteMapTables([cid], selMap, useGroups);
      for (const tbl of t) {
        tables.push({
          label:     chart.name + (tbl.label ? `　${tbl.label}` : ''),
          hasBranch: tbl.hasBranch,
          rows: tbl.rows, columns: tbl.columns,
        });
      }
    }
  } else {
    const { tables: t } = computeRouteMapTables(selected, _routemapGroupSel, useGroups);
    tables = t;
  }

  if (!tables.length) {
    wrap.innerHTML = `<div class="rm-empty">
      <i class="fa-solid fa-bone"></i>
      <p>グループに番号付き工程がありません<br>
         グループを作成して加工・検査記号を追加してください</p>
    </div>`;
    document.getElementById('rm-stats').textContent = '';
    return;
  }

  const buildTable = tbl =>
    `<div class="rm-table-scroll">${_buildRouteTableHTML(tbl.rows, tbl.columns, _routemapHeaderMode, useGroups)}</div>`;

  let html;
  if (tables.length === 1 && !tables[0].label) {
    html = buildTable(tables[0]);
  } else {
    html = `<div class="rm-multi-tables">` +
      tables.map(tbl => {
        // アイコン選択: 分割モードは工程図アイコン、枝葉ありは枝アイコン、通常は骨アイコン
        const ico = _routemapSplit ? 'diagram-project'
                  : tbl.hasBranch  ? 'code-branch'
                  :                   'bone';
        return `<div class="rm-table-section${tbl.hasBranch ? ' rm-table-section--branch' : ''}">
          ${tbl.label
            ? `<div class="rm-table-section-label">
                <i class="fa-solid fa-${ico}"></i>${esc(tbl.label)}
               </div>`
            : ''}
          ${buildTable(tbl)}
        </div>`;
      }).join('') + `</div>`;
  }

  wrap.innerHTML = html;

  const totalCols = [...new Set(tables.flatMap(t => t.columns))].length;
  const totalRows = [...new Set(tables.flatMap(t => t.rows.map(r => r.chartId)))].length;
  const splitLabel = tables.length > 1 ? ` · ${tables.length} 表` : '';
  document.getElementById('rm-stats').textContent = `${totalRows} 工程図 · ${totalCols} 工程名${splitLabel}`;
}

// ── グループ展開トグル ──
function toggleRmGroupExpand(cid) {
  if (_routemapExpanded.has(cid)) _routemapExpanded.delete(cid);
  else _routemapExpanded.add(cid);
  _renderRouteTable();
}

// ── グループチェックボックス変更 ──
function toggleRmGroupCheck(cid, gid, checked) {
  const chart = W.charts.find(c => c.id === cid); if (!chart) return;
  const cd    = getChartData(chart);
  const bbGid = (cd.groups.some(g => g.id === cd.backboneGroupId) ? cd.backboneGroupId : null)
    || findLongestLineGroupId(cd.nodes, cd.groups);
  // 現在の選択Set（明示指定 or デフォルト）を取得・複製
  let sel = _routemapGroupSel.has(cid)
    ? new Set(_routemapGroupSel.get(cid))
    : (bbGid ? new Set([bbGid]) : new Set());
  if (checked) {
    sel.add(gid);
  } else {
    sel.delete(gid);
    // 全解除防止：背骨グループを自動復帰
    if (!sel.size && bbGid) sel.add(bbGid);
  }
  _routemapGroupSel.set(cid, sel);
  _renderRouteTable();
}

// ── グループ選択を背骨デフォルトにリセット ──
function resetRmGroupSel(cid) {
  _routemapGroupSel.delete(cid);
  _renderRouteTable();
}