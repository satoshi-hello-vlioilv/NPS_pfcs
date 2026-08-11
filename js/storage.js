'use strict';

// ═══════════════════════════════════════════════
// STORAGE — IndexedDB による永続化
// ═══════════════════════════════════════════════
//
// 工程図データ（ワークスペース）の保存先。
//
// 以前は localStorage を使っていたが、localStorage は
//   ・容量が約5MBと小さい（工程図が増えると保存に失敗しうる）
//   ・同期APIのため、保存のたびにUIスレッドを止める
//   ・容量超過時に例外を投げるだけで、原因がユーザーに伝わらない
// という問題があった。IndexedDB は数百MB～が使え、非同期で書き込めるため、
// 工程図のような「増えていくドキュメント」の保存先として適している。
//
// なお、サイドバー幅・凡例位置といったごく小さなUI設定は、描画前に同期的に
// 読めないと画面がちらつくため、引き続き localStorage に置いている（数百バイト）。

const DB_NAME    = 'nps_pfcs';
const DB_VERSION = 1;
const STORE      = 'kv';

let _dbPromise = null;

/** DB接続を開く（初回のみ実際に開き、以降は同じPromiseを使い回す） */
function _openDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    if (!self.indexedDB) { reject(new Error('IndexedDB が利用できません')); return; }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
    // 別タブが古いバージョンで開いたままだと upgrade がブロックされる
    req.onblocked = () => reject(new Error('別のタブが開いているため保存領域を開けません'));
  }).catch(err => { _dbPromise = null; throw err; });
  return _dbPromise;
}

/** 1件読み出す。キーが無ければ undefined。 */
async function idbGet(key) {
  const db = await _openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

/** 1件書き込む。 */
async function idbSet(key, value) {
  const db = await _openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve(true);
    tx.onerror    = () => reject(tx.error);
    tx.onabort    = () => reject(tx.error || new Error('保存が中断されました'));
  });
}

/** 1件削除する。 */
async function idbDel(key) {
  const db = await _openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve(true);
    tx.onerror    = () => reject(tx.error);
  });
}

/**
 * 保存失敗をユーザーに伝える。
 * 黙って失敗すると「保存されていたつもりが消えていた」という最悪の結果になるため、
 * 容量超過とそれ以外を区別して案内する。
 */
function _reportStorageError(err) {
  const quota = err && (err.name === 'QuotaExceededError' || /quota/i.test(err.message || ''));
  const msg = quota
    ? '保存領域が上限に達したため自動保存できませんでした。不要な工程図を削除するか、JSON保存でバックアップしてください。'
    : '自動保存に失敗しました。作業内容を失わないよう JSON保存でバックアップしてください。';
  if (typeof showToast === 'function') showToast(msg, 'error');
  else console.error(msg, err);
}
