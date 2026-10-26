// IndexedDB: tüm şarkılar cihazda saklanır (internetsiz çalışma).
// Mağazalar:
//   songs : { p, t, e, n, s, dirty?, del?, up?, upBundle?, m }   (p = yol, anahtar)
//   kv    : ayarlar, programlar, senkron durumu

const DB_NAME = 'muzik-defteri';
const VERSION = 1;
let dbp = null;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, VERSION);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains('songs')) db.createObjectStore('songs', { keyPath: 'p' });
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbp;
}

function tx(store, mode, fn) {
  return open().then(db => new Promise((res, rej) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    let out;
    Promise.resolve(fn(s)).then(v => { out = v; });
    t.oncomplete = () => res(out);
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error);
  }));
}

function req(r) { return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }

export const db = {
  allSongs: () => tx('songs', 'readonly', s => req(s.getAll())),
  putSong: song => tx('songs', 'readwrite', s => { s.put(song); }),
  putSongs: songs => tx('songs', 'readwrite', s => { for (const x of songs) s.put(x); }),
  deleteSongs: paths => tx('songs', 'readwrite', s => { for (const p of paths) s.delete(p); }),
  clearSongs: () => tx('songs', 'readwrite', s => { s.clear(); }),
  get: key => tx('kv', 'readonly', s => req(s.get(key))),
  set: (key, val) => tx('kv', 'readwrite', s => { s.put(val, key); }),
  del: key => tx('kv', 'readwrite', s => { s.delete(key); }),
};



// iOS/PWA: GitHub bağlantısı iki cihaz-içi depoda tutulur.
// Token yalnızca aynı origin'in kendi uygulama kodu tarafından okunabilir;
// hiçbir zaman public GitHub deposuna veya sunucu loglarına yazılmaz.
const SETTINGS_BACKUP_KEY = 'md.settings.backup.v1';

export async function loadSettingsReliably() {
  let primary = null, backup = null;
  try { primary = await db.get('settings'); } catch (e) { console.warn('IndexedDB settings unavailable:', e); }
  try { backup = JSON.parse(localStorage.getItem(SETTINGS_BACKUP_KEY) || 'null'); }
  catch (e) { console.warn('Local settings backup unavailable:', e); }

  const primaryAt = Number(primary && primary._savedAt) || 0;
  const backupAt = Number(backup && backup._savedAt) || 0;
  const useBackup = backup && (!primary || backupAt > primaryAt ||
    (!!(backup.gh && backup.gh.token) && !(primary.gh && primary.gh.token)));
  if (useBackup) {
    try { await db.set('settings', backup); }
    catch (e) { console.warn('Could not restore IndexedDB settings:', e); }
  }
  return useBackup ? backup : (primary || null);
}

export async function persistSettingsReliably(settings) {
  // Önemli: localStorage senkron yazılır; iOS uygulama kapanırsa son token kaybolmaz.
  const snapshot = JSON.parse(JSON.stringify(settings));
  snapshot._savedAt = Date.now();
  let backupOk = false, dbOk = false, lastError = null;
  try {
    const value = JSON.stringify(snapshot);
    localStorage.setItem(SETTINGS_BACKUP_KEY, value);
    backupOk = localStorage.getItem(SETTINGS_BACKUP_KEY) === value;
  } catch (e) { lastError = e; }
  try { await db.set('settings', snapshot); dbOk = true; }
  catch (e) { lastError = e; }
  if (!backupOk && !dbOk) throw lastError || new Error('Settings could not be saved');
  return true;
}

/** Tarayıcıdan kalıcı depolama iste (iOS'un verileri silmemesi için). */
export async function requestPersist() {
  try { if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist(); } catch (_) {}
  return false;
}
