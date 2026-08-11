'use strict';
/**
 * 「追加先グループ（アクティブグループ）」のテスト。
 *
 * 作成直後の空グループは所属ノードが無いため、選択ノードから追加先を推測する
 * 従来方式では指定できなかった。S.activeGroupId により空グループでも
 * 明示的に追加先にできることと、その状態が画面上で分かることを確認する。
 */
const { run } = require('./_harness');

run('active-group', async (t) => {
  await t.load('list');

  console.log('[1] 空グループを追加先に指定できる');
  const gid = await t.page.evaluate(() => {
    const g = addGroup('新しい空グループ', '#f43f5e');
    S.sel = null; S.activeGroupId = g; redraw();
    return g;
  });
  const r1 = await t.page.evaluate((g) => ({
    resolved: resolveActiveGroupId(),
    hdrActive: !!document.querySelector(`.lf-ghdr[data-gid="${g}"].lf-ghdr-active`),
    badge: document.querySelector(`.lf-ghdr[data-gid="${g}"] .lf-active-badge`)?.textContent.trim() || null,
    emptyMsg: document.querySelector(`.lf-gitems[data-gid="${g}"] .lf-empty-folder`)?.textContent.trim() || null,
    palLabel: document.getElementById('lpal-active-grp')?.textContent.trim() || null,
  }), gid);
  t.log(JSON.stringify(r1));
  t.check('空グループが追加先として解決される', r1.resolved === gid, r1);
  t.check('グループ見出しが強調表示される', r1.hdrActive, r1);
  t.check('「追加先」バッジが出る', (r1.badge || '').includes('追加先'), r1.badge);
  t.check('空グループの説明が追加先である旨を示す', (r1.emptyMsg || '').includes('追加先'), r1.emptyMsg);
  t.check('パレット見出しにグループ名が出る', (r1.palLabel || '').includes('新しい空グループ'), r1.palLabel);

  console.log('[2] 空グループに記号を追加できる');
  const r2 = await t.page.evaluate((g) => {
    const before = S.nodes.filter(n => n.groupId === g).length;
    addNodeFromList('kako');
    return { before, after: S.nodes.filter(n => n.groupId === g).length,
             newNodeGroup: N(S.sel.id)?.groupId, status: document.getElementById('stxt')?.textContent || '' };
  }, gid);
  t.log(JSON.stringify(r2));
  t.check('追加前は0件（テストの前提）', r2.before === 0, r2);
  t.check('追加後は1件', r2.after === 1, r2);
  t.check('新しい記号が対象グループに所属する', r2.newNodeGroup === gid, r2);
  t.check('ステータスに追加先グループ名が出る', r2.status.includes('新しい空グループ'), r2.status);

  console.log('[2b] 空グループへの初回追加が既存の記号と重ならない');
  const r2b = await t.page.evaluate(() => {
    const n = N(S.sel.id);
    const overlap = S.nodes.filter(o => o.id !== n.id &&
      Math.abs(o.x - n.x) < 25 && Math.abs(o.y - n.y) < 25);
    return { pos: { x: n.x, y: n.y }, overlap: overlap.map(o => o.id) };
  });
  t.log(JSON.stringify(r2b));
  t.check('既存の記号と重ならない位置に置かれる', r2b.overlap.length === 0, r2b);
  t.check('左端から外れた位置に置かれない', r2b.pos.x >= 0, r2b);

  console.log('[3] 折りたたみ中のグループへ追加すると自動展開される');
  const r3 = await t.page.evaluate(() => {
    const g = addGroup('折りたたみグループ', '#16a34a');
    S.sel = null; S.activeGroupId = g; _lpCollapsed.add(g); redraw();
    addNodeFromList('kako');
    return { collapsed: _lpCollapsed.has(g), rowVisible: !!document.querySelector(`.lf-item[data-nid="${S.sel.id}"]`) };
  });
  t.log(JSON.stringify(r3));
  t.check('折りたたみが解除される', !r3.collapsed, r3);
  t.check('追加した行が画面に見える', r3.rowVisible, r3);

  console.log('[4] ノードを選択するとそのグループが優先される');
  const r4 = await t.page.evaluate(() => {
    const first = N(S.listOrder[0]);
    S.sel = { kind: 'node', id: first.id }; redraw();
    return { expected: first.groupId || null, resolved: resolveActiveGroupId() };
  });
  t.check('選択ノードのグループが追加先になる', r4.resolved === r4.expected, r4);

  console.log('[5] グループ見出しクリックで追加先を切り替えられる');
  const r5 = await t.page.evaluate((g) => {
    document.querySelector(`.lf-ghdr[data-gid="${g}"]`)?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    return { sel: S.sel, active: S.activeGroupId };
  }, gid);
  t.check('見出しクリックでノード選択が外れる', r5.sel === null, r5);
  t.check('見出しクリックで追加先が切り替わる', r5.active === gid, r5);

  console.log('[6] グループを削除すると追加先の指定も解除される');
  const r6 = await t.page.evaluate((g) => {
    window.confirm = () => true;
    deleteGroup(g);
    return { active: S.activeGroupId, resolvedExists: !resolveActiveGroupId() || !!G(resolveActiveGroupId()) };
  }, gid);
  t.log(JSON.stringify(r6));
  t.check('削除したグループが追加先に残らない', r6.active !== gid, r6);
  t.check('解決結果が実在するグループかnull', r6.resolvedExists, r6);
});
