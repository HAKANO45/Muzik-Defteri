// Müzik Defteri v4 — ana uygulama
import { db, requestPersist, loadSettingsReliably, persistSettingsReliably } from './db.js';
import { GitHub } from './github.js';
import { bytesToSong, songToBytes, ENC_LABEL, gitBlobSha } from './encoding.js';
import { readZip, writeZip } from './zip.js';
import { fold, titleOf, tagsOf, baseName, dirName, isChordLine, transposeLine, escapeHtml } from './textutil.js';
import { t, getLang, setLang } from './i18n.js';
import { SINGERS, NOTES as TON_NOTES, STYLES as TON_STYLES, USULS as TON_USULS, usulOf, tarzOf, normUsul, emptyBook, newId, mergeBooks, parsePasted } from './tonlar.js';
import { suggest, fixAll, fixName, mostlyUpper, toSentence, tidyBlank, loadGuesser, key as trKey, trLower, trUpper } from './turkce.js';

export const VERSION = '5.13.1';
const $ = id => document.getElementById(id);

/** iPhone (ve Android telefon) = sadece görüntüleme. Şarkı ekleme/düzenleme/silme/içe aktarma
 *  Windows, MacBook ve iPad'de yapılır (kullanıcı kararı). Yatay iPhone da telefon sayılır. */
const UA = navigator.userAgent;
export const VIEW_ONLY = /iPhone|iPod/.test(UA) || (/Android/.test(UA) && /Mobile/.test(UA));
document.documentElement.classList.toggle('view-only', VIEW_ONLY);

/** Şarkıyı/aramayı internette ayrı sekmede açar (uygulama içerik çekmez). */
function googleOpen(q) {
  q = (q || '').trim(); if (!q) return;
  window.open('https://www.google.com/search?q=' + encodeURIComponent(q + ' şarkı sözleri'), '_blank', 'noopener');
}
const DEVICE = /iPhone|iPod/.test(UA) ? 'iphone' : /Android/.test(UA) ? 'android'
  : (/iPad/.test(UA) || (/Macintosh/.test(UA) && navigator.maxTouchPoints > 1)) ? 'ipad' : /Macintosh/.test(UA) ? 'mac' : 'windows';

/** İnternette ara: Google ayrı pencerede açılır (uygulama içerik çekmez, yasal). Reklamsız + gece modu için cihaza göre kısa yol. */
function webSearch(q) {
  q = (q || '').trim();
  const qIn = h('input', { class: 'field ws-q', value: q, autocapitalize: 'words', enterkeyhint: 'search',
    onkeydown: e => { if (e.key === 'Enter') go(); } });
  const go = () => { const v = qIn.value.trim(); if (!v) return; try { localStorage.setItem('md.wsLast', v); } catch (_) {} googleOpen(v); };
  const tips = t('wsTips_' + DEVICE).split('|');
  let open = true; try { open = localStorage.getItem('md.wsTipsClosed') !== '1'; } catch (_) {}
  const det = h('details', { class: 'ws-tips', open },
    h('summary', {}, '🌙 ' + t('wsTipsTitle')),
    h('ol', {}, ...tips.map(x => h('li', {}, x))));
  det.addEventListener('toggle', () => { try { localStorage.setItem('md.wsTipsClosed', det.open ? '0' : '1'); } catch (_) {} });
  const parts = q.split(/\s+-\s+/);
  modal(
    h('div', { class: 'modal-head' }, h('h2', {}, '🔎 ' + t('searchWeb')), h('button', { class: 'mh-btn', onclick: closeModal }, '✕')),
    qIn,
    h('button', { class: 'btn primary ws-go', onclick: go }, '🔎 ' + t('wsGoogle')),
    det,
    VIEW_ONLY ? h('div', { class: 'ws-note' }, t('wsPhoneNote'))
      : h('button', { class: 'btn ws-paste', onclick: () => { closeModal(); openEditor(null, { artist: parts.length > 1 ? parts[0] : '', title: parts.length > 1 ? parts.slice(1).join(' - ') : qIn.value.trim(), dir: S.dir, text: '' }); } },
          '📋 ' + t('wsPaste')),
  );
  setTimeout(() => { if (!q) qIn.focus(); }, 50);
}

// ------------------------------------------------------------------ durum
const S = {
  songs: new Map(),          // yol -> kayıt (del:true olanlar silinmeyi bekleyen işaretler)
  dirs: new Map(),           // klasör -> { dirs:Set, files:[] }
  titleIndex: new Map(),     // katlanmış başlık -> [yollar] (kopya tespiti)
  virtualDirs: new Set(),    // henüz dosyası olmayan yeni klasörler
  tab: 'library', dir: '', programId: null,
  current: null, context: { list: [], label: '' },
  programs: { format: 1, programs: [], fav: [], favUpdated: 0 },
  notes: { format: 1, notes: {} },
  removed: {},
  order: { format: 1, order: {} },   // kullanıcı sıralaması: klasör -> { names:[…], updated } (siralama.json)
  sel: null, sortMode: false,                       // klasör işlemiyle kaldırılan yollar -> zaman (eski paket koruması)   // şarkı notları: yol -> { solist, ton, not, updated } (notlar.json ile senkron)
  recent: [],
  settings: { gh: { owner: 'HAKANO45', repo: '-Muzik-Defteri-Repertuar', branch: 'main', token: '' }, font: 22, stageFont: 34, speed: 30, searchText: true, clock24: true },
  transpose: 0, scrolling: false,
  sync: { busy: false, last: 0, error: '', bundleSha: '' },
  limit: 300,
};

function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : String(c));
  return el;
}

let toastTimer;
function toast(msg, action) {
  const el = $('toast');
  el.replaceChildren(msg);
  if (action) el.append(h('button', { onclick: () => { el.hidden = true; action.fn(); } }, action.label));
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, action ? 15000 : 2600);
}

// ------------------------------------------------------------------ indeks
function visibleSongs() { return [...S.songs.values()].filter(s => !s.del); }

function decorate(rec) {
  rec._title = titleOf(rec.p);
  rec._ft = fold(rec._title);
  rec._fp = fold(rec.p);
  rec._fx = null;            // sözlerin katlanmış hali: ilk aramada üretilir
  rec._tags = tagsOf(rec.p);
  return rec;
}

function rebuildIndex() {
  S.dirs = new Map([['', { dirs: new Set(), files: [] }]]);
  S.titleIndex = new Map();
  const ensure = d => {
    if (S.dirs.has(d)) return S.dirs.get(d);
    const node = { dirs: new Set(), files: [] };
    S.dirs.set(d, node);
    const parent = dirName(d);
    ensure(parent).dirs.add(d);
    return node;
  };
  for (const d of S.virtualDirs) ensure(d);
  for (const rec of visibleSongs()) {
    ensure(dirName(rec.p)).files.push(rec.p);
    const k = rec._ft.replace(/[^a-z0-9]+/g, '');
    if (!S.titleIndex.has(k)) S.titleIndex.set(k, []);
    S.titleIndex.get(k).push(rec.p);
  }
  const coll = new Intl.Collator('tr', { numeric: true, sensitivity: 'base' });
  for (const node of S.dirs.values()) node.files.sort((a, b) => coll.compare(baseName(a), baseName(b)));
  S.collator = coll;
}

function countIn(dir) {
  let n = 0;
  const node = S.dirs.get(dir); if (!node) return 0;
  n += node.files.length;
  for (const d of node.dirs) n += countIn(d);
  return n;
}

function duplicatesOf(p) {
  const rec = S.songs.get(p); if (!rec) return [];
  const k = rec._ft.replace(/[^a-z0-9]+/g, '');
  return (S.titleIndex.get(k) || []).filter(x => x !== p);
}

// ------------------------------------------------------------------ arama
function search(q, inText) {
  const phrase = fold(q).replace(/\s+/g, ' ').trim();
  const terms = phrase.split(' ').filter(Boolean);
  if (!terms.length) return [];
  const out = [];
  for (const rec of S.songs.values()) {
    if (rec.del) continue;
    let score = 0;
    if (S.notes.notes[rec.p] && terms.every(w => noteSearchText(rec.p).includes(w))) score = 5;   // solist/ton/not en üstte
    else if (terms.every(w => rec._ft.includes(w))) score = rec._ft.startsWith(terms[0]) ? 4 : 3;
    else if (terms.every(w => rec._fp.includes(w))) score = 2;
    else if (terms.every(w => (rec._fp + ' ' + noteSearchText(rec.p)).includes(w))) score = 2;
    else if (inText) {
      if (rec._fx === null) rec._fx = fold(rec.t);
      if (terms.length > 1 && rec._fx.includes(phrase)) score = 1.5;
      else if (terms.every(w => rec._fx.includes(w) || rec._ft.includes(w))) score = 1;
    }
    if (score) out.push({ p: rec.p, score });
  }
  out.sort((a, b) => b.score - a.score || S.collator.compare(S.songs.get(a.p)._title, S.songs.get(b.p)._title));
  return out;
}

function snippet(rec, q, asPhrase) {
  const terms = fold(q).split(/\s+/).filter(Boolean);
  if (asPhrase) terms[0] = terms.join(' ');
  const fx = rec._fx || fold(rec.t);
  let i = fx.indexOf(terms[0]);
  if (i < 0) return '';
  // katlama uzunluğu değiştirmediği için indeks orijinal metinde de geçerli
  const start = Math.max(0, fx.lastIndexOf('\n', i) + 1);
  let end = fx.indexOf('\n', i); if (end < 0) end = fx.length;
  const line = rec.t.slice(start, Math.min(end, start + 120));
  const rel = i - start, len = terms[0].length;
  return escapeHtml(line.slice(0, rel)) + '<mark>' + escapeHtml(line.slice(rel, rel + len)) + '</mark>' + escapeHtml(line.slice(rel + len));
}

// ------------------------------------------------------------------ kenar çubuğu
function renderTabs() {
  for (const b of $('tabs').children) {
    if (b.dataset.tab === 'tonlar') b.hidden = !S.tonOpen;
    $('tabs').classList.toggle('five', !!S.tonOpen);
    b.textContent = t(b.dataset.tab);
    b.classList.toggle('active', b.dataset.tab === S.tab && !$('q').value.trim());
  }
}

// ------------------------------------------------------------------ şarkı notu (solist, ton, kısa not)
const NOTES = ['Do', 'Do#', 'Re', 'Mi♭', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'Si♭', 'Si'];
/** Ton gösterimi: nota büyük harf + minör küçük "m" → LAm, REm, FA#m, SI♭ (kullanıcı tercihi). */
function tonLabel(ton) { const m = /^(.*?)(m?)$/.exec(ton || ''); return m ? m[1].toUpperCase() + m[2] : ton; }
function noteOf(p) { const n = S.notes.notes[p]; return n && !n.deleted && (n.solist || n.ton || n.not || n.bpm || n.style) ? n : null; }
function noteChips(n, small) {
  if (!n) return [];
  return [
    n.solist ? h('span', { class: 'chip chip-solist' + (small ? ' sm' : '') }, '🎤 ' + n.solist) : null,
    n.ton ? h('span', { class: 'chip chip-ton' + (small ? ' sm' : '') }, '🎵 ' + tonLabel(n.ton)) : null,
    n.bpm ? h('span', { class: 'chip chip-bpm' + (small ? ' sm' : '') }, 'BPM ' + n.bpm) : null,
    n.style && !small ? h('span', { class: 'chip chip-style' }, '🥁 ' + n.style) : null,
    n.not && !small ? h('span', { class: 'chip chip-not' }, n.not) : null,
  ].filter(Boolean);
}
function noteSearchText(p) { const n = noteOf(p); return n ? fold([n.solist, n.ton, n.not, n.style, n.bpm ? n.bpm + ' bpm' : ''].filter(Boolean).join(' ')) : ''; }
function allSolists() {
  const c = new Map();
  for (const n of Object.values(S.notes.notes)) if (n && !n.deleted && n.solist) for (const s of n.solist.split(/\s*[&,+\/]\s*/)) if (s) c.set(s, (c.get(s) || 0) + 1);
  return [...c.entries()].sort((a, b) => b[1] - a[1]).map(x => x[0]);
}
function saveNotes() { S.notes.dirty = true; db.set('notes', S.notes); scheduleSync(); }

/** Not penceresi: Solist, Ton, kısa not. iPhone'da açılmaz (sadece görüntüleme). */
function openNoteDialog(p) {
  const cur = S.notes.notes[p] || {};
  const solistIn = h('input', { class: 'field', value: cur.solist || '', placeholder: 'Eylem, Hakan, Eylem & Hakan…', list: 'solistList', autocapitalize: 'words' });
  const dl = h('datalist', { id: 'solistList' }, allSolists().map(s => h('option', { value: s })));
  const quick = h('div', { class: 'chip-row' }, ...allSolists().slice(0, 8).map(s =>
    h('button', { class: 'chip chip-btn-solist', onclick: () => {
      const v = solistIn.value.trim();
      solistIn.value = !v ? s : v.split(/\s*&\s*/).includes(s) ? v : v + ' & ' + s;
    } }, s)));
  const m = /^(.*?)(\s*m)?$/.exec(cur.ton || '');
  const tonSel = h('select', { class: 'field' }, h('option', { value: '' }, '—'), ...NOTES.map(n => h('option', { value: n, selected: m && m[1] === n }, tonLabel(n))));
  const minor = h('input', { type: 'checkbox', checked: !!(m && m[2]) });
  const notIn = h('input', { class: 'field', value: cur.not || '', placeholder: t('notePlaceholder'), maxlength: 80 });
  const bpmIn = h('input', { class: 'field', type: 'number', inputmode: 'numeric', min: 30, max: 300, value: cur.bpm || '', placeholder: '96' });
  // Tap tempo: ritimde 4+ kez dokun → BPM
  let taps = [];
  const tapBtn = h('button', { class: 'btn tap-btn', onclick: () => {
    const now = performance.now();
    taps = taps.filter(x => now - x < 3000); taps.push(now);
    if (taps.length >= 2) {
      const d = (taps[taps.length - 1] - taps[0]) / (taps.length - 1);
      bpmIn.value = Math.round(60000 / d);
    }
    tapBtn.textContent = 'TAP ' + '•'.repeat(Math.min(taps.length, 8));
  } }, 'TAP');
  const styles = [...new Set(Object.values(S.notes.notes).filter(n => n && !n.deleted && n.style).map(n => n.style))].sort();
  const styleIn = h('input', { class: 'field', value: cur.style || '', placeholder: '8Beat Pop, Arabesk 2, Halay…', list: 'styleList', autocapitalize: 'words' });
  const sdl = h('datalist', { id: 'styleList' }, styles.map(s => h('option', { value: s })));
  const save = () => {
    const ton = tonSel.value ? tonSel.value + (minor.checked ? 'm' : '') : '';
    const solist = solistIn.value.replace(/\s+/g, ' ').trim(), not = notIn.value.trim(), style = styleIn.value.replace(/\s+/g, ' ').trim();
    let bpm = parseInt(bpmIn.value, 10); bpm = bpm >= 20 && bpm <= 400 ? bpm : 0;
    S.notes.notes[p] = solist || ton || not || bpm || style ? { solist, bpm, ton, style, not, updated: Date.now() } : { deleted: true, updated: Date.now() };
    saveNotes(); closeModal(); renderSong(); if (!$('stage').hidden) renderStage(); renderList();
    toast(t('saved'));
  };
  modal(h('h2', {}, '🏷 ' + t('songNote')),
    h('label', {}, t('solist')), solistIn, dl, quick,
    h('div', { class: 'grid3' },
      h('div', {}, h('label', {}, 'BPM'), h('div', { class: 'ton-row' }, bpmIn, tapBtn)),
      h('div', {}, h('label', {}, t('ton')), h('div', { class: 'ton-row' }, tonSel, h('label', { class: 'toggle' }, minor, h('span', {}, 'm'))))),
    h('label', {}, 'Style'), styleIn, sdl,
    h('label', {}, t('shortNote')), notIn,
    h('div', { class: 'btn-row' }, h('button', { class: 'btn primary', onclick: save }, t('save')), h('button', { class: 'btn', onclick: closeModal }, t('cancel'))));
  setTimeout(() => solistIn.focus(), 30);
}

function mergeNotes(local, remote) {
  const out = { ...(remote && remote.notes || {}) };
  for (const [p, n] of Object.entries(local.notes || {})) {
    // depoda artık olmayan şarkının (taşınmış/silinmiş) eski notunu geri yükleme
    if (!out[p] && !n.deleted && S.songs.size && !S.songs.has(p)) continue;
    if (!out[p] || (n.updated || 0) > (out[p].updated || 0)) out[p] = n;
  }
  return { format: 1, notes: out };
}

function songItem(p, { sub, html, acts, ctx, tapMenu } = {}) {
  const rec = S.songs.get(p);
  const missing = !rec || rec.del;
  const title = missing ? baseName(p).replace(/\.txt$/i, '') + ' ' + t('missingSong') : showTitle(rec._title);
  const tags = missing ? [] : rec._tags.map(x => h('span', { class: 'tag' }, x));
  const subEl = html ? h('span', { class: 'sub', html }) : h('span', { class: 'sub' }, sub != null ? sub : dirName(p) || t('root'));
  const el = h('div', { class: 'item' + (p === S.current ? ' active' : ''), role: 'button', tabindex: 0, 'data-p': p,
      onclick: tapMenu ? null : e => { if (e.target.closest('.acts')) return; if (!missing) openSong(p, ctx); },
      onkeydown: e => { if (e.key === 'Enter' && !missing) openSong(p, ctx); } },
    h('span', { class: 'ico' }, rec && rec.dirty ? '✱' : '♪'),
    h('span', { class: 'main' }, h('span', { class: 'name' }, title, ...tags, ...noteChips(missing ? null : noteOf(p), true)), subEl),
    acts ? h('span', { class: 'acts' }, ...acts) : null);
  if (tapMenu && !missing) { addTaps(el, () => openSong(p, ctx), () => openSongSheetList(p, ctx)); addLongPress(el, () => openSongSheetList(p, ctx)); }
  return el;
}

function renderEmptyLib(list, dirs, files) {
  if (dirs.length || files.length) return;
  list.append(h('div', { class: 'list-note' }, S.songs.size ? (VIEW_ONLY ? '—' : t('emptyFolder')) : t('welcomeText')));
  if (S.dir && S.virtualDirs.has(S.dir)) list.append(h('button', { class: 'small-btn', style: 'margin:0 12px', onclick: () => deleteEmptyFolder(S.dir) }, '🗑 ' + t('deleteFolder')));
}

// ------------------------------------------------------------------ klasör ağacı: klasöre dokununca içi hemen altında açılır
const OPEN_KEY = 'md.openDirs';
const openDirs = (() => { try { return new Set(JSON.parse(localStorage.getItem(OPEN_KEY) || '[]')); } catch (_) { return new Set(); } })();
const treeLimit = new Map();
function toggleDir(d) {
  if (openDirs.has(d)) { for (const x of [...openDirs]) if (x === d || x.startsWith(d + '/')) openDirs.delete(x); }
  else openDirs.add(d);
  try { localStorage.setItem(OPEN_KEY, JSON.stringify([...openDirs])); } catch (_) {}
  const sc = $('list').scrollTop; renderList(); $('list').scrollTop = sc;
}
/** Sürükle-bırak ile taşıma (Mac/Windows): şarkıyı (☑ seçiliyse seçilenlerin hepsini) bir klasörün üstüne bırak. */
let DRAG_SONGS = null;   // Safari özel veri türlerini her zaman taşımadığı için sürüklenenler bellekte tutulur
function dropMove(el, p) {
  if (VIEW_ONLY) return;
  const isSong = S.songs.has(p);
  if (isSong) {
    el.draggable = true;
    el.addEventListener('dragstart', e => {
      const paths = S.sel && S.sel.has(p) ? [...S.sel] : [p];
      DRAG_SONGS = paths;
      e.dataTransfer.setData('text/plain', paths.length + ' ♪');
      e.dataTransfer.effectAllowed = 'move';
      document.documentElement.classList.add('dragging-songs');
      el.classList.add('dragging');
    });
    el.addEventListener('dragend', () => { el.classList.remove('dragging'); document.documentElement.classList.remove('dragging-songs'); setTimeout(() => { DRAG_SONGS = null; }, 50); });
    return;
  }
  dropTarget(el, p);
}
function dropTarget(el, dir) {
  el.addEventListener('dragover', e => { if (DRAG_SONGS) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; el.classList.add('drop-in'); } });
  el.addEventListener('dragleave', () => el.classList.remove('drop-in'));
  el.addEventListener('drop', async e => {
    el.classList.remove('drop-in');
    if (!DRAG_SONGS) return;
    e.preventDefault(); e.stopPropagation();
    const paths = DRAG_SONGS.filter(x => dirName(x) !== dir); DRAG_SONGS = null;
    if (!paths.length) return;
    if (!(await confirmBox(t('dropMoveConfirm', { n: paths.length, d: dir ? baseName(dir) : t('root') })))) return;
    S.sel = null;
    await filesCopyMove(paths, 'move', dir);
  });
}
function keepScroll(fn) { const sc = $('list').scrollTop; fn(); $('list').scrollTop = sc; }
function renderTree(list, dir, level) {
  const { dirs, files } = orderedChildren(dir);
  const all = [...dirs, ...files];
  const sorting = !!S.sortMode;
  // ↕ modunda her satırın yanında büyük ▲▼ (kendi klasörü içinde taşır); masaüstünde fareyle sürükle-bırak da olur
  const acts = p => h('span', { class: 'acts sort-acts' },
    h('button', { class: 'sort-btn', onclick: e => { e.stopPropagation(); moveItem(dir, all, p, -1); } }, '▲'),
    h('button', { class: 'sort-btn', onclick: e => { e.stopPropagation(); moveItem(dir, all, p, 1); } }, '▼'));
  const dragable = (el, p) => {
    if (!sorting) { dropMove(el, p); return; }
    el.draggable = true;
    el.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', JSON.stringify({ dir, p })); el.classList.add('dragging'); });
    el.addEventListener('dragend', () => el.classList.remove('dragging'));
    el.addEventListener('dragover', e => { e.preventDefault(); el.classList.add('drop-to'); });
    el.addEventListener('dragleave', () => el.classList.remove('drop-to'));
    el.addEventListener('drop', e => {
      e.preventDefault(); el.classList.remove('drop-to');
      let m; try { m = JSON.parse(e.dataTransfer.getData('text/plain')); } catch (_) { return; }
      if (!m || m.dir !== dir || m.p === p) return;
      const isDir = q => S.dirs.has(q) && !S.songs.has(q);
      if (isDir(m.p) !== isDir(p)) return;
      const arr = all.filter(x => x !== m.p); arr.splice(arr.indexOf(p), 0, m.p);
      S.order.order[dir] = { names: arr.map(baseName), updated: Date.now() };
      saveOrder(); keepScroll(renderList);
    });
  };
  for (const d of dirs) {
    const open = openDirs.has(d);
    const row = h('div', { class: 'item tree-dir' + (open ? ' open' : '') + (sorting ? ' sorting' : ''), role: 'button', tabindex: 0, style: `--lvl:${level}`, 'data-d': d,
        onkeydown: e => { if (e.key === 'Enter') toggleDir(d); } },
      h('span', { class: 'chev' }, open ? '▾' : '▸'),
      h('span', { class: 'ico' }, open ? '📂' : '📁'),
      h('span', { class: 'main' }, h('span', { class: 'name' }, showFolder(baseName(d)))),
      sorting ? acts(d) : h('span', { class: 'count' }, countIn(d)));
    if (sorting || S.sel) row.addEventListener('click', e => { if (!e.target.closest('.acts')) toggleDir(d); });
    else { addTaps(row, () => toggleDir(d), () => openFolderSheet(d)); addLongPress(row, () => openFolderSheet(d)); }
    dragable(row, d);
    list.append(row);
    if (open) renderTree(list, d, level + 1);
  }
  const ctx = { list: files, label: dir || t('root') };
  const lim = level === 0 ? S.limit : (treeLimit.get(dir) || 200);
  for (const p of files.slice(0, lim)) {
    let it;
    if (S.sel) it = selectItem(p);
    else if (sorting) { it = songItem(p, { ctx, sub: '', acts: acts(p).childNodes }); it.classList.add('sorting'); it.onclick = null; }
    else it = songItem(p, { ctx, sub: '', tapMenu: true });
    it.classList.add('tree-song'); it.style.setProperty('--lvl', level);
    dragable(it, p);
    list.append(it);
  }
  if (files.length > lim) list.append(h('button', { class: 'small-btn tree-more', style: `--lvl:${level}`, onclick: () => {
    if (level === 0) S.limit += 300; else treeLimit.set(dir, lim + 300);
    keepScroll(renderList); } }, t('showMore', { n: files.length - lim })));
}

// ------------------------------------------------------------------ sıralama · çoklu seçim · çift dokunuş
/** Kullanıcının belirlediği sıra (siralama.json, tüm cihazlara senkron). Sırası olmayanlar alfabetik, sona. */
function orderedChildren(dir) {
  const node = S.dirs.get(dir) || { dirs: new Set(), files: [] };
  const ord = (S.order.order[dir] || {}).names || [];
  const pos = new Map(ord.map((n, i) => [n, i]));
  const cmp = (a, b) => {
    const pa = pos.has(baseName(a)) ? pos.get(baseName(a)) : 1e9, pb = pos.has(baseName(b)) ? pos.get(baseName(b)) : 1e9;
    return pa - pb || S.collator.compare(baseName(a), baseName(b));
  };
  return { dirs: [...node.dirs].sort(cmp), files: [...node.files].sort(cmp) };
}
function moveItem(dir, all, p, d) {
  const i = all.indexOf(p), j = i + d;
  if (i < 0 || j < 0 || j >= all.length) return;
  const isDir = q => S.dirs.has(q) && !S.songs.has(q);
  if (isDir(all[i]) !== isDir(all[j])) return;          // klasörler üstte, şarkılar altta kalır
  [all[i], all[j]] = [all[j], all[i]];
  S.order.order[dir] = { names: all.map(baseName), updated: Date.now() };
  saveOrder(); keepScroll(renderList);
}
/** Ad değişince yerinde kalsın: üst klasörün sırasında eski adın yerine yeni ad (sıra yoksa şu anki görünüş sabitlenir) */
function keepPlace(oldP, newP, isDir) {
  const dir = dirName(oldP); if (dir !== dirName(newP)) return;
  const cur = orderedChildren(dir), all = [...cur.dirs, ...cur.files].map(baseName);
  const i = all.indexOf(baseName(oldP)); if (i < 0) return;
  all[i] = baseName(newP);
  S.order.order[dir] = { names: all, updated: Date.now() };
  if (isDir) for (const k of Object.keys(S.order.order)) if (k === oldP || k.startsWith(oldP + '/')) { S.order.order[newP + k.slice(oldP.length)] = { ...S.order.order[k], updated: Date.now() }; delete S.order.order[k]; }
  saveOrder();
}
function saveOrder() { S.order.dirty = true; db.set('order', S.order); scheduleSync(); }
function resetOrder(dir) { S.order.order[dir] = { names: [], updated: Date.now() }; saveOrder(); renderList(); }

/** Tek dokunuş = aç, çift dokunuş = menü */
function addTaps(el, single, double) {
  let timer = 0;
  el.addEventListener('click', e => {
    if (e.target.closest('.acts')) return;
    if (timer) { clearTimeout(timer); timer = 0; double(); return; }
    timer = setTimeout(() => { timer = 0; single(); }, 260);
  });
}

function selectItem(p) {
  const rec = S.songs.get(p); const on = S.sel.has(p);
  return h('div', { class: 'item sel-item' + (on ? ' selected' : ''), role: 'button', tabindex: 0,
      onclick: () => { on ? S.sel.delete(p) : S.sel.add(p); keepScroll(renderList); } },
    h('span', { class: 'sel-box' }, on ? '✓' : ''),
    h('span', { class: 'main' }, h('span', { class: 'name' }, rec ? showTitle(rec._title) : baseName(p))));
}

function renderEditBar(head) {
  const bar = h('div', { class: 'edit-bar' });
  if (S.sortMode) {
    bar.append(h('span', { class: 'edit-title' }, '↕ ' + t('sortHint')),
      h('button', { class: 'small-btn', onclick: () => resetOrder(S.dir) }, t('sortAZ')),
      h('button', { class: 'nav-pill', onclick: () => { S.sortMode = false; renderList(); } }, '✓ ' + t('done')));
  } else {
    const { files } = orderedChildren(S.dir);
    const n = S.sel.size;
    bar.append(h('span', { class: 'edit-title' }, t('selectedN', { n })),
      h('button', { class: 'small-btn', onclick: () => { if (S.sel.size === files.length) S.sel.clear(); else files.forEach(f => S.sel.add(f)); renderList(); } }, t('selectAll')),
      h('button', { class: 'nav-pill', onclick: () => { S.sel = null; renderList(); } }, '✕'));
    const acts = h('div', { class: 'sel-acts' },
      h('button', { class: 'sel-act', disabled: !n, onclick: () => filesCopyMove([...S.sel], 'copy') }, '⧉ ' + t('copy')),
      h('button', { class: 'sel-act', disabled: !n, onclick: () => filesCopyMove([...S.sel], 'move') }, '➜ ' + t('move')),
      h('button', { class: 'sel-act', disabled: n !== 1, onclick: () => renameSong([...S.sel][0]) }, '✎ ' + t('rename')),
      h('button', { class: 'sel-act danger', disabled: !n, onclick: () => filesDelete([...S.sel]) }, '🗑 ' + t('delete')));
    head.append(bar, acts); return;
  }
  head.append(bar);
}

/** Şarkı menüsü (çift dokunuş / basılı tut): aç, seç, yeniden adlandır, kopyala, taşı, sil */
function openSongSheetList(p, ctx) {
  const rec = S.songs.get(p); if (!rec) return;
  const act = (icon, label, fn, cls = '') => h('button', { class: 'sheet-act ' + cls, onclick: () => { closeModal(); fn(); } },
    h('span', { class: 'sheet-ico' }, icon), h('span', {}, label));
  modal(h('div', { class: 'sheet-grab' }),
    h('div', { class: 'sheet-title' }, '♪ ' + showTitle(rec._title)),
    h('div', { class: 'sheet-grid folder-acts' },
      act('📂', t('open'), () => openSong(p, ctx)),
      act('☑', t('selectTitle'), () => { S.sel = new Set([p]); renderList(); }),
      act('✎', t('rename'), () => renameSong(p)),
      act('⧉', t('copy'), () => filesCopyMove([p], 'copy')),
      act('➜', t('move'), () => filesCopyMove([p], 'move')),
      act('🗑', t('delete'), () => filesDelete([p]), 'danger')),
    h('button', { class: 'btn sheet-close', onclick: closeModal }, t('close')));
  $('modal').classList.add('sheet');
}

function uniquePath(dir, name) {
  const stem = name.replace(/\.txt$/i, '');
  let p = (dir ? dir + '/' : '') + stem + '.txt', i = 2;
  while (S.songs.has(p) && !S.songs.get(p).del) p = (dir ? dir + '/' : '') + `${stem} (${i++}).txt`;
  return p;
}

/** Çoklu kopyala / taşı: hedef klasörü listeden seç; tek commit, içerik yeniden yüklenmez */
async function filesCopyMove(paths, kind, to) {
  paths = paths.filter(p => S.songs.has(p));
  if (!paths.length) return;
  const target = to !== undefined ? to : await pickFolder(t(kind === 'copy' ? 'copyFilesTo' : 'moveFilesTo', { n: paths.length }), null);
  if (target === null) return;
  const pairs = [];
  for (const p of paths) {
    if (kind === 'move' && dirName(p) === target) continue;
    const np = uniquePath(target, baseName(p));
    pairs.push([p, np]);
    S.songs.set(np, { p: np, _reserved: true });     // aynı ad iki kez seçilmesin (geçici)
  }
  for (const [, np] of pairs) S.songs.delete(np);
  if (!pairs.length) return;
  const songs = pairs.map(([a]) => S.songs.get(a));
  const changes = [];
  for (const [a, b] of pairs) {
    changes.push({ path: 'repertuar/' + b, sha: S.songs.get(a).s, fromP: a });
    if (kind === 'move') changes.push({ path: 'repertuar/' + a, delete: true });
  }
  const msg = `${kind === 'copy' ? 'Kopyalandı' : 'Taşındı'}: ${pairs.length} şarkı → ${target || 'Repertuvar'}`;
  if (!(await commitFolderChange(songs, changes, msg))) return;
  const puts = [], dels = [];
  for (const [a, b] of pairs) {
    const r = S.songs.get(a);
    const nr = decorate({ p: b, t: r.t, e: r.e, n: r.n, s: r.s, dirty: gh().ok ? false : true, m: Date.now(),
      ...(gh().ok && r.s ? { up: r.s, upAt: Date.now() } : {}) });
    S.songs.set(b, nr); puts.push(strip(nr));
    if (kind === 'move') { S.songs.delete(a); dels.push(a); }
  }
  if (dels.length) { await db.deleteSongs(dels); markRemoved(dels); remapPaths(new Map(pairs)); }
  await db.putSongs(puts);
  S.sel = null; rebuildIndex(); goDir(target); scheduleSync(800);
  toast(t(kind === 'copy' ? 'filesCopied' : 'filesMoved', { n: pairs.length }));
}

async function filesDelete(paths) {
  paths = paths.filter(p => S.songs.has(p));
  if (!paths.length) return;
  if (!(await confirmBox(t('confirmDeleteFiles', { n: paths.length })))) return;
  const withSha = paths.map(p => S.songs.get(p)).filter(r => r.s);
  if (withSha.length && !(await commitFolderChange(withSha, withSha.map(r => ({ path: 'repertuar/' + r.p, delete: true })), `Silindi: ${paths.length} şarkı`))) return;
  for (const p of paths) S.songs.delete(p);
  await db.deleteSongs(paths); markRemoved(paths);
  remapPaths(new Map(paths.map(p => [p, null])));
  if (S.current && !S.songs.has(S.current)) { S.current = null; $('song').hidden = true; renderEmpty(); }
  S.sel = null; rebuildIndex(); renderList(); scheduleSync(800);
  toast(t('filesDeleted', { n: paths.length }));
}

async function renameSong(p) {
  const rec = S.songs.get(p); if (!rec) return;
  const name = await promptText(t('rename'), baseName(p).replace(/\.txt$/i, ''));
  if (!name) return;
  const clean = name.replace(/[\\/:*?"<>|]/g, '').trim(); if (!clean) return;
  const np = (dirName(p) ? dirName(p) + '/' : '') + clean + '.txt';
  if (np === p) return;
  if (S.songs.has(np) && !S.songs.get(np).del) { toast(t('nameExists')); return; }
  if (!(await commitFolderChange([rec], [{ path: 'repertuar/' + np, sha: rec.s, fromP: p }, { path: 'repertuar/' + p, delete: true }], `Yeniden adlandırıldı: ${p} → ${np}`))) return;
  const nr = decorate({ p: np, t: rec.t, e: rec.e, n: rec.n, s: rec.s, dirty: gh().ok ? false : rec.dirty, m: Date.now(), ...(gh().ok && rec.s ? { up: rec.s, upAt: Date.now() } : {}) });
  S.songs.set(np, nr); S.songs.delete(p);
  await db.deleteSongs([p]); await db.putSongs([strip(nr)]); markRemoved([p]);
  keepPlace(p, np, false);                                 // kendi sırasında yerini koru
  remapPaths(new Map([[p, np]]));
  S.sel = null; rebuildIndex(); renderList(); scheduleSync(800);
  if (S.current === np && $('editor').hidden) renderSong();
  toast(t('saved'));
}

function renderList() {
  renderTabs();
  const list = $('list'), head = $('sideHead');
  list.replaceChildren(); head.replaceChildren();
  const q = $('q').value.trim();

  if (q) {
    const res = search(q, $('qText').checked);
    head.append(t('results', { n: res.length }), h('span', { class: 'spacer' }),
      h('button', { class: 'small-btn', onclick: () => webSearch(q) }, '🔎 ' + t('searchWeb')));
    if (!res.length) list.append(h('div', { class: 'list-note' }, t('noResults')));
    const ctx = { list: res.map(r => r.p), label: '“' + q + '”' };
    for (const r of res.slice(0, S.limit)) {
      const rec = S.songs.get(r.p);
      list.append(songItem(r.p, { ctx, html: r.score < 2 ? snippet(rec, q, r.score === 1.5) : null }));
    }
    if (res.length > S.limit) list.append(h('button', { class: 'small-btn', style: 'margin:10px', onclick: () => { S.limit += 300; renderList(); } }, t('showMore', { n: res.length - S.limit })));
    return;
  }

  if (S.tab === 'library') {
    // ekmek kırıntısı
    const parts = S.dir ? S.dir.split('/') : [];
    // telefonda büyük 🏠 ve ‹ Üst klasör düğmeleri
    if (S.dir) head.append(h('div', { class: 'nav-row only-narrow' },
      h('button', { class: 'nav-pill', onclick: goHome }, '⌂ ' + t('root')),
      S.dir ? h('button', { class: 'nav-pill', onclick: () => goDir(dirName(S.dir)) }, '‹ ' + t('upFolder')) : ''));
    { const rc = h('button', { class: 'crumb', onclick: () => goDir('') }, t('root')); dropTarget(rc, ''); head.append(rc); }
    parts.forEach((part, i) => {
      head.append(h('span', { class: 'crumb-sep' }, '›'));
      const d = parts.slice(0, i + 1).join('/');
      head.append(h('button', { class: 'crumb', onclick: () => goDir(d) }, showFolder(part)));
    });
    if (S.sel || S.sortMode) { renderEditBar(head); }
    else head.append(...[h('span', { class: 'spacer' }),
      h('button', { class: 'small-btn', title: t('sortTitle'), onclick: () => { S.sortMode = true; renderList(); } }, '↕'),
      h('button', { class: 'small-btn', title: t('selectTitle'), onclick: () => { S.sel = new Set(); renderList(); } }, '☑'),
      h('button', { class: 'small-btn', title: t('newFolder'), onclick: () => newFolder() }, '＋📁'),
      VIEW_ONLY ? null : h('button', { class: 'small-btn', title: t('newSong'), onclick: () => openEditor(null) }, '＋♪'),
      VIEW_ONLY ? null : h('button', { class: 'small-btn', title: t('importDoc'), onclick: () => pickDocuments() }, '📄'),
      VIEW_ONLY || !S.dir ? null : h('button', { class: 'small-btn', title: t('renameFolder'), onclick: () => renameFolder(S.dir) }, '✎📁'),
      VIEW_ONLY || !S.dir ? null : h('button', { class: 'small-btn danger-btn', title: t('deleteFolder'), onclick: () => deleteFolder(S.dir) }, '🗑📁')].filter(Boolean));
    const { dirs, files } = orderedChildren(S.dir);
    renderTree(list, S.dir, 0);
    renderEmptyLib(list, dirs, files);
    return;
  }

  if (S.tab === 'tonlar' && S.tonOpen) { renderTonTab(head, list); return; }

  if (S.tab === 'favorites') {
    const fav = S.programs.fav;
    head.append(t('songs', { n: fav.length }));
    const ctx = { list: fav, label: t('favorites') };
    for (const p of fav) list.append(songItem(p, { ctx }));
    if (!fav.length) list.append(h('div', { class: 'list-note' }, '☆'));
    return;
  }

  if (S.tab === 'recent') {
    const ctx = { list: S.recent, label: t('recent') };
    for (const p of S.recent) list.append(songItem(p, { ctx }));
    return;
  }

  // programlar
  const progs = orderedPrograms();
  const prog = progs.find(p => p.id === S.programId);
  const doneBar = () => h('div', { class: 'edit-bar' }, h('span', { class: 'edit-title' }, '↕ ' + t('sortHint')),
    h('button', { class: 'nav-pill', onclick: () => { S.sortMode = false; renderList(); } }, '✓ ' + t('done')));
  if (!prog) {
    if (S.sortMode) head.append(doneBar());
    else head.append(h('span', { class: 'spacer' }),
      progs.length > 1 ? h('button', { class: 'small-btn', title: t('sortTitle'), onclick: () => { S.sortMode = true; renderList(); } }, '↕') : '',
      h('button', { class: 'small-btn', onclick: newProgram }, '＋ ' + t('newProgram')));
    progs.forEach((p, i) => {
      const row = h('div', { class: 'item' + (S.sortMode ? ' sorting' : ''), role: 'button', tabindex: 0 },
        h('span', { class: 'ico' }, '☰'),
        h('span', { class: 'main' }, h('span', { class: 'name' }, p.name)),
        S.sortMode ? h('span', { class: 'acts sort-acts' },
          h('button', { class: 'sort-btn', onclick: e => { e.stopPropagation(); moveProgram(progs, i, -1); } }, '▲'),
          h('button', { class: 'sort-btn', onclick: e => { e.stopPropagation(); moveProgram(progs, i, 1); } }, '▼'))
          : h('span', { class: 'count' }, p.items.length));
      if (!S.sortMode) {
        addTaps(row, () => { S.programId = p.id; saveUi(); renderList(); }, () => openProgramSheet(p));   // çift dokunuş → menü
        addLongPress(row, () => openProgramSheet(p));   // basılı tut → program menüsü
      }
      list.append(row);
    });
    if (!progs.length) list.append(h('div', { class: 'list-note' }, t('emptyProgram')));
    return;
  }
  head.append(h('button', { class: 'crumb', onclick: () => { S.programId = null; S.sortMode = false; saveUi(); renderList(); } }, '‹ ' + t('programs')),
    h('span', { class: 'crumb-sep' }, '›'), h('b', { style: 'color:var(--gold)' }, prog.name), h('span', { class: 'spacer' }));
  if (S.sortMode) head.append(doneBar());
  else head.append(
    prog.items.length > 1 ? h('button', { class: 'small-btn', title: t('sortTitle'), onclick: () => { S.sortMode = true; renderList(); } }, '↕') : '',
    h('button', { class: 'small-btn', title: t('rename'), onclick: () => renameProgram(prog) }, '✎'),
    h('button', { class: 'small-btn', title: t('delete'), onclick: () => deleteProgram(prog) }, '🗑'),
    prog.items.length ? h('button', { class: 'small-btn', onclick: () => { openSong(prog.items[0], { list: prog.items, label: prog.name }); openStage(); } }, '▶ ' + t('startStage')) : '');
  const ctx = { list: prog.items, label: prog.name };
  prog.items.forEach((p, i) => {
    if (S.sortMode) {
      const it = songItem(p, { ctx, sub: `${i + 1}. ${dirName(p)}`, acts: [
        h('button', { class: 'sort-btn', title: t('moveUp'), onclick: e => { e.stopPropagation(); moveInProgram(prog, i, -1); } }, '▲'),
        h('button', { class: 'sort-btn', title: t('moveDown'), onclick: e => { e.stopPropagation(); moveInProgram(prog, i, 1); } }, '▼'),
        h('button', { class: 'sort-btn danger', title: t('remove'), onclick: e => { e.stopPropagation(); prog.items.splice(i, 1); touchProgram(prog); } }, '✕'),
      ] });
      it.classList.add('sorting'); it.onclick = null; list.append(it);
    } else list.append(songItem(p, { ctx, sub: `${i + 1}. ${dirName(p)}` }));
  });
  if (!prog.items.length) list.append(h('div', { class: 'list-note' }, t('emptyProgram')));
}

/** 🏠: şarkıyı kapat, aramayı temizle, ana klasöre dön (iPhone'da liste ekranı) */
function goHome() {
  stopScroll();
  if (!$('stage').hidden) closeStage();
  $('editor').hidden = true;
  setNarrowSong(false);
  S.programId = null;
  openDirs.clear(); try { localStorage.setItem(OPEN_KEY, '[]'); } catch (_) {}   // ⌂ = açık klasörler kapanır
  goDir('');
}

function goDir(d) { if (d !== S.dir) { S.sel = null; S.sortMode = false; } S.dir = d; S.tab = 'library'; S.limit = 300; $('q').value = ''; saveUi(); renderList(); $('list').scrollTop = 0; }

/** Kullanıcının bulunduğu yer (sekme/klasör/program) — iPhone uygulamayı kapatıp açınca aynı yerden devam. */
function saveUi() {
  try { localStorage.setItem('md.ui', JSON.stringify({ tab: S.tab, dir: S.dir, programId: S.programId })); } catch (_) {}
}
function loadUi() {
  try {
    const u = JSON.parse(localStorage.getItem('md.ui') || 'null');
    if (!u) return;
    if (['library', 'programs', 'favorites', 'recent'].includes(u.tab)) S.tab = u.tab;
    if (typeof u.dir === 'string' && S.dirs.has(u.dir)) S.dir = u.dir;
    if (u.programId) S.programId = u.programId;
  } catch (_) {}
}

/** Boş (henüz şarkısı olmayan) klasörler IndexedDB'de saklanır; yoksa uygulama kapanınca kaybolur. */
function saveVirtualDirs() { return db.set('virtualDirs', [...S.virtualDirs]); }

/** Klasör menüsü (⋯ veya uzun bas): adını değiştir, içine yeni klasör, sil. iPhone'da da çalışır. */
function openFolderSheet(d) {
  const n = countIn(d);
  const act = (icon, label, fn, cls = '') => h('button', { class: 'sheet-act ' + cls, onclick: () => { closeModal(); fn(); } },
    h('span', { class: 'sheet-ico' }, icon), h('span', {}, label));
  modal(h('div', { class: 'sheet-grab' }),
    h('div', { class: 'sheet-title' }, '📁 ' + baseName(d) + '  ·  ' + t('songs', { n })),
    h('div', { class: 'sheet-grid folder-acts' },
      act('📂', t('open'), () => goDir(d)),
      act('✎', t('rename'), () => renameFolder(d)),
      act('＋📁', t('newFolderInside'), () => newFolder(d)),
      act('⧉', t('copy'), () => copyFolder(d)),
      act('➜', t('move'), () => moveFolder(d)),
      VIEW_ONLY ? null : act('🔤', t('fixFolder'), () => fixFolder(d)),
      act('🗑', t('delete'), () => deleteFolder(d), 'danger')),
    h('button', { class: 'btn sheet-close', onclick: closeModal }, t('close')));
  $('modal').classList.add('sheet');
}
/** Program menüsü (basılı tut): aç, sahneye başla, yeniden adlandır, kopyala, sil */
function openProgramSheet(pr) {
  const act = (icon, label, fn, cls = '') => h('button', { class: 'sheet-act ' + cls, onclick: () => { closeModal(); fn(); } },
    h('span', { class: 'sheet-ico' }, icon), h('span', {}, label));
  modal(h('div', { class: 'sheet-grab' }),
    h('div', { class: 'sheet-title' }, '☰ ' + pr.name + '  ·  ' + t('songs', { n: pr.items.length })),
    h('div', { class: 'sheet-grid folder-acts' },
      act('📂', t('open'), () => { S.programId = pr.id; saveUi(); renderList(); }),
      pr.items.length ? act('▶', t('startStage'), () => { openSong(pr.items[0], { list: pr.items, label: pr.name }); openStage(); }) : null,
      act('✎', t('rename'), () => renameProgram(pr)),
      act('⧉', t('copy'), () => {
        const cp = { id: uid(), name: pr.name + ' (' + t('copyWord') + ')', items: [...pr.items], updated: Date.now() };
        S.programs.programs.push(cp); savePrograms(); renderList(); toast(t('saved'));
      }),
      act('🗑', t('delete'), () => deleteProgram(pr), 'danger')),
    h('button', { class: 'btn sheet-close', onclick: closeModal }, t('close')));
  $('modal').classList.add('sheet');
}

function addLongPress(el, fn) {
  let timer = 0, moved = false;
  el.addEventListener('touchstart', () => { moved = false; timer = setTimeout(() => { if (!moved) { el.dataset.lp = '1'; fn(); } }, 550); }, { passive: true });
  el.addEventListener('touchmove', () => { moved = true; clearTimeout(timer); }, { passive: true });
  el.addEventListener('touchend', e => { clearTimeout(timer); if (el.dataset.lp) { delete el.dataset.lp; e.preventDefault(); } });
  el.addEventListener('contextmenu', e => { e.preventDefault(); fn(); });
}

async function newFolder(parent) {
  const base = typeof parent === 'string' ? parent : S.dir;
  const name = await promptText(t('newFolder'), '');
  if (!name) return;
  const clean = name.replace(/[\\/:*?"<>|]/g, '').trim();
  if (!clean) return;
  const d = base ? base + '/' + clean : clean;
  S.virtualDirs.add(d);
  await saveVirtualDirs();
  rebuildIndex();
  goDir(d);
}

async function deleteEmptyFolder(d) { return deleteFolder(d); }

/** Klasör işleminden sonra 15 dk: eski paket gelirse silinen/taşınan eski yollar geri eklenmesin. */
const REMOVED_TTL = 15 * 60 * 1000;
function markRemoved(paths) {
  const now = Date.now();
  for (const p of paths) S.removed[p] = now;
  for (const [p, at] of Object.entries(S.removed)) if (now - at > REMOVED_TTL) delete S.removed[p];
  db.set('removed', S.removed);
}

// ------------------------------------------------------------------ klasör: yeniden adlandır / taşı / sil
/** Klasör altındaki (alt klasörler dahil) şarkılar */
function songsUnder(d) { return visibleSongs().filter(r => r.p.startsWith(d + '/')); }

/** Yol değişikliklerini notlara, programlara, favorilere, son açılanlara yansıt. map: eski -> yeni | null (silindi) */
function remapPaths(map) {
  let nChanged = false, pChanged = false;
  const now = Date.now();
  for (const [a, b] of map) {
    const n = S.notes.notes[a];
    if (n && !n.deleted) {
      if (b) S.notes.notes[b] = { ...n, updated: now };
      S.notes.notes[a] = { deleted: true, updated: now };
      nChanged = true;
    }
  }
  for (const pr of S.programs.programs) {
    const items = pr.items.map(x => (map.has(x) ? map.get(x) : x)).filter(Boolean);
    if (items.length !== pr.items.length || items.some((x, i) => x !== pr.items[i])) { pr.items = items; pr.updated = now; pChanged = true; }
  }
  const fav = S.programs.fav.map(x => (map.has(x) ? map.get(x) : x)).filter(Boolean);
  if (fav.length !== S.programs.fav.length || fav.some((x, i) => x !== S.programs.fav[i])) { S.programs.fav = fav; S.programs.favUpdated = now; pChanged = true; }
  S.recent = S.recent.map(x => (map.has(x) ? map.get(x) : x)).filter(Boolean);
  db.set('recent', S.recent);
  if (nChanged) { S.notes.dirty = true; db.set('notes', S.notes); }
  if (pChanged) { S.programs.dirty = true; db.set('programs', S.programs); }
  if (S.current && map.has(S.current)) S.current = map.get(S.current);
  S.context.list = S.context.list.map(x => (map.has(x) ? map.get(x) : x)).filter(Boolean);
}

/** GitHub'da tek commit ile uygula. Klasördeki gönderilmemiş değişiklikler önce gönderilir. */
async function commitFolderChange(songs, changes, message) {
  const g = gh();
  if (!g.ok) return true;                       // GitHub yok: sadece bu cihazda
  if (!navigator.onLine) { toast(t('needOnline')); return false; }
  if (songs.some(r => r.dirty || !r.s)) {
    await sync({ quiet: true });
    if (songs.some(r => S.songs.get(r.p) && (S.songs.get(r.p).dirty || !S.songs.get(r.p).s))) { toast(t('syncFirst')); return false; }
    for (const c of changes) if (c.fromP) c.sha = S.songs.get(c.fromP).s;
  }
  try {
    S.sync.busy = true; updateSyncDot();
    await g.commitBatch(changes.map(({ path, sha, bytes, delete: del }) => ({ path, sha, bytes, delete: del })), message,
      (i, n) => toast(`⟳ ${i}/${n}`));
    return true;
  } catch (e) {
    console.error(e); toast(t('syncError', { msg: e.message })); return false;
  } finally { S.sync.busy = false; updateSyncDot(); }
}

async function renameFolder(d) {
  const input = await promptText(t('renameFolderPrompt'), d.includes('/') ? baseName(d) : d);
  if (!input) return;
  const clean = input.split('/').map(x => x.replace(/[\\:*?"<>|]/g, '').trim()).filter(Boolean).join('/');
  if (!clean) return;
  // "/" içeriyorsa kökten tam yol (taşıma), yoksa aynı yerde yeni ad
  const nd = input.includes('/') ? clean : (dirName(d) ? dirName(d) + '/' : '') + clean;
  return moveFolderTo(d, nd);
}

/** Klasör seçici (iPhone'da yazmadan): aranabilir liste. Kök = ''. */
function pickFolder(title, exclude) {
  return new Promise(res => {
    const all = ['', ...allDirs()].filter(x => !exclude || (x !== exclude && !x.startsWith(exclude + '/')));
    const q = h('input', { class: 'field', placeholder: t('search'), autocapitalize: 'off' });
    const box = h('div', { class: 'pick-list folder-pick' });
    const draw = () => {
      const f = fold(q.value.trim());
      box.replaceChildren(...all.filter(x => !f || fold(x).includes(f)).slice(0, 200).map(x =>
        h('button', { class: 'item', onclick: () => { closeModal(); res(x); } },
          h('span', { class: 'ico' }, x ? '📁' : '⌂'),
          h('span', { class: 'main' }, h('span', { class: 'name' }, x ? baseName(x) : t('root')), x.includes('/') ? h('span', { class: 'sub' }, dirName(x)) : ''))));
    };
    q.addEventListener('input', draw); draw();
    modal(h('div', { class: 'modal-head' }, h('h2', {}, title), h('button', { class: 'mh-btn', onclick: () => { closeModal(); res(null); } }, '✕')), q, box, h('div', { class: 'btn-row' }, h('button', { class: 'btn', onclick: () => { closeModal(); res(null); } }, t('cancel'))));
  });
}

async function moveFolder(d) {
  const target = await pickFolder(t('moveTo', { name: baseName(d) }), d);
  if (target === null) return;
  return moveFolderTo(d, (target ? target + '/' : '') + baseName(d));
}

/** Klasörü kopyala: içerik yeniden yüklenmez (aynı blob), tek commit. */
async function copyFolder(d) {
  const target = await pickFolder(t('copyTo', { name: baseName(d) }), null);
  if (target === null) return;
  let nd = (target ? target + '/' : '') + baseName(d);
  if (nd === d || (S.dirs.has(nd) && countIn(nd))) nd += ' (' + t('copyWord') + ')';
  if (nd.startsWith(d + '/')) { toast(t('folderIntoItself')); return; }
  const songs = songsUnder(d);
  if (!songs.length) { S.virtualDirs.add(nd); await saveVirtualDirs(); rebuildIndex(); goDir(nd); return; }
  const pairs = songs.map(r => [r.p, nd + r.p.slice(d.length)]);
  const changes = pairs.map(([a, b]) => ({ path: 'repertuar/' + b, sha: S.songs.get(a).s, fromP: a }));
  if (!(await commitFolderChange(songs, changes, `Klasör kopyalandı: ${d} → ${nd}`))) return;
  const puts = [];
  for (const [a, b] of pairs) {
    const r = S.songs.get(a);
    const nr = decorate({ p: b, t: r.t, e: r.e, n: r.n, s: r.s, dirty: gh().ok ? false : true, m: Date.now(),
      ...(gh().ok && r.s ? { up: r.s, upAt: Date.now() } : {}) });
    S.songs.set(b, nr); puts.push(strip(nr));
  }
  await db.putSongs(puts);
  rebuildIndex(); goDir(nd); scheduleSync(800);
  toast(t('folderCopied', { n: songs.length }));
}

async function moveFolderTo(d, nd) {
  if (nd === d) return;
  if (nd.startsWith(d + '/')) { toast(t('folderIntoItself')); return; }
  if (S.dirs.has(nd) && countIn(nd)) { toast(t('folderExists')); return; }
  const songs = songsUnder(d);
  const moves = songs.map(r => [r.p, nd + r.p.slice(d.length)]);
  const changes = [];
  for (const [a, b] of moves) {
    const r = S.songs.get(a);
    changes.push({ path: 'repertuar/' + b, sha: r.s, fromP: a }, { path: 'repertuar/' + a, delete: true });
  }
  if (songs.length && !(await commitFolderChange(songs, changes, `Klasör: ${d} → ${nd}`))) return;
  const sameParent = dirName(d) === dirName(nd);
  if (sameParent) keepPlace(d, nd, true);                     // yeniden adlandırma: yerinde kalsın
  // yerel uygula
  const puts = [], dels = [];
  for (const [a, b] of moves) {
    const r = S.songs.get(a);
    const nr = decorate({ p: b, t: r.t, e: r.e, n: r.n, s: r.s, dirty: gh().ok ? false : r.dirty, m: Date.now(),
      ...(gh().ok && r.s ? { up: r.s, upAt: Date.now() } : {}) });   // eski paket gelirse silinmesin
    S.songs.set(b, nr); S.songs.delete(a); puts.push(strip(nr)); dels.push(a);
  }
  await db.deleteSongs(dels); await db.putSongs(puts);
  markRemoved(dels);
  for (const v of [...S.virtualDirs]) if (v === d || v.startsWith(d + '/')) { S.virtualDirs.delete(v); S.virtualDirs.add(nd + v.slice(d.length)); }
  if (!songs.length) S.virtualDirs.add(nd);
  await saveVirtualDirs();
  remapPaths(new Map(moves));
  if (sameParent) { for (const x of [...openDirs]) if (x === d || x.startsWith(d + '/')) { openDirs.delete(x); openDirs.add(nd + x.slice(d.length)); } try { localStorage.setItem(OPEN_KEY, JSON.stringify([...openDirs])); } catch (_) {} }
  rebuildIndex();
  if (sameParent) { if (S.dir === d || S.dir.startsWith(d + '/')) S.dir = nd + S.dir.slice(d.length); keepScroll(renderList); } else goDir(nd);
  scheduleSync(800);
  toast(t('folderRenamed', { n: songs.length }));
  if (S.current && $('editor').hidden) renderSong();
}

async function deleteFolder(d) {
  const songs = songsUnder(d);
  if (!(await confirmBox(t('confirmDeleteFolder', { name: d, n: songs.length })))) return;
  if (songs.length > 20) {
    const typed = await promptText(t('typeToConfirm', { name: baseName(d) }), '');
    if (!typed || typed.trim() !== baseName(d)) { toast(t('cancelled')); return; }
  }
  const changes = songs.filter(r => r.s).map(r => ({ path: 'repertuar/' + r.p, delete: true }));
  if (changes.length && !(await commitFolderChange(songs.filter(r => r.s), changes, `Klasör silindi: ${d} (${songs.length} şarkı)`))) return;
  const dels = songs.map(r => r.p);
  for (const p of dels) S.songs.delete(p);
  await db.deleteSongs(dels);
  markRemoved(dels);
  for (const v of [...S.virtualDirs]) if (v === d || v.startsWith(d + '/')) S.virtualDirs.delete(v);
  await saveVirtualDirs();
  remapPaths(new Map(dels.map(p => [p, null])));
  if (S.current && !S.songs.has(S.current)) { S.current = null; $('song').hidden = true; renderEmpty(); }
  rebuildIndex(); goDir(dirName(d)); scheduleSync(800);
  toast(t('folderDeleted', { n: songs.length }));
}

// ------------------------------------------------------------------ şarkı görünümü
function setNarrowSong(on) {
  $('layout').classList.toggle('show-song', on);
  $('btnBack').hidden = !on;
}

function openSong(p, ctx) {
  if (!S.songs.has(p)) return;
  S.current = p;
  if (ctx) S.context = ctx;
  S.transpose = 0;
  stopScroll();
  S.recent = [p, ...S.recent.filter(x => x !== p)].slice(0, 50);
  db.set('recent', S.recent);
  $('editor').hidden = true;
  renderSong();
  setNarrowSong(true);
  // liste vurgusunu güncelle
  for (const el of $('list').querySelectorAll('.item')) el.classList.toggle('active', el.dataset.p === p);
  if (!$('stage').hidden) renderStage();
  keepAwake();
  linkSend(p);
}

// ------------------------------------------------------------------ 🔗 Ortak Sahne
// İki cihaz aynı odaya bağlanır; biri şarkı açınca ötekinde de açılır. Sadece şarkının yolu gider (söz gitmez).
// Aracı: ntfy.sh (ücretsiz, hesapsız). Oda kodu = şifre; repertuvar deposunda sahne.json'da durur.
const LINK_KEY = 'md.link';
const DEV_ID = (() => { try { let x = localStorage.getItem('md.devId'); if (!x) { x = Math.random().toString(36).slice(2, 10); localStorage.setItem('md.devId', x); } return x; } catch (_) { return Math.random().toString(36).slice(2, 10); } })();
const L = { on: false, code: '', name: '', mode: 'both', es: null, state: 'off', applying: false, sendT: 0, lastSent: '' };
try { Object.assign(L, JSON.parse(localStorage.getItem(LINK_KEY) || '{}')); } catch (_) {}
function linkSave() { try { localStorage.setItem(LINK_KEY, JSON.stringify({ on: L.on, code: L.code, name: L.name, mode: L.mode })); } catch (_) {} }
function linkTopic() { return 'hakano-sahne-' + L.code.toLowerCase().replace(/[^a-z0-9]/g, ''); }
function newRoomCode() { const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let x = ''; const r = crypto.getRandomValues(new Uint8Array(12)); for (const b of r) x += a[b % a.length]; return x; }
function linkUi() {
  const b = $('btnLink'); if (!b) return;
  b.classList.toggle('on', L.on && L.state === 'ok');
  b.classList.toggle('warn', L.on && L.state !== 'ok');
  b.title = t('linkTitle') + (L.on ? ' — ' + t(L.state === 'ok' ? 'linkOn' : 'linkWait') : '');
  const sl = $('stageLink'); if (sl) { sl.hidden = !L.on; sl.className = 'stage-link ' + (L.state === 'ok' ? 'ok' : 'warn'); }
}
function linkConnect() {
  if (L.es) { L.es.close(); L.es = null; }
  if (!L.on || !L.code) { L.state = 'off'; linkUi(); return; }
  L.state = 'wait'; linkUi();
  const es = new EventSource('https://ntfy.sh/' + linkTopic() + '/sse');
  L.es = es;
  es.onopen = () => { L.state = 'ok'; linkUi(); };
  es.onerror = () => { L.state = 'wait'; linkUi(); };   // EventSource kendisi yeniden bağlanır
  es.onmessage = ev => {
    let m; try { m = JSON.parse(JSON.parse(ev.data).message); } catch (_) { return; }
    L.state = 'ok'; linkUi();
    if (!m || m.id === DEV_ID || L.mode === 'lead' || !m.p) return;
    if (Date.now() - (m.t || 0) > 120000) return;          // eski mesaj
    const rec = S.songs.get(m.p);
    if (!rec || rec.del) { toast('🔗 ' + (m.by || '') + ': ' + t('linkMissing')); return; }
    if (S.current === m.p) return;
    if (!$('editor').hidden) { toast('🔗 ' + (m.by || '') + ': ' + rec._title); return; }   // düzenleme bozulmasın
    L.applying = true;
    try { openSong(m.p, S.context.list.includes(m.p) ? null : { list: [m.p], label: '🔗 ' + (m.by || '') }); }
    finally { L.applying = false; }
    toast('🔗 ' + (m.by ? m.by + ': ' : '') + rec._title);
  };
}
function linkSend(p) {
  if (!L.on || !L.code || L.applying || L.mode === 'follow') return;
  clearTimeout(L.sendT);
  L.sendT = setTimeout(() => {                             // hızlı ileri-geride sadece sonuncusu gider
    if (L.lastSent === p + S.current && S.current !== p) return;
    const body = JSON.stringify({ p, by: L.name || '', id: DEV_ID, t: Date.now() });
    fetch('https://ntfy.sh/' + linkTopic(), { method: 'POST', body }).then(r => { if (!r.ok) throw new Error(r.status); L.state = 'ok'; linkUi(); })
      .catch(() => { L.state = 'wait'; linkUi(); toast(t('linkSendFail')); });
  }, 350);
}
async function linkRoomFromRepo() {
  const g = gh(); if (!g.ok || !navigator.onLine) return '';
  try {
    const { data, sha } = await g.getJson('sahne.json');
    if (data && data.oda) return data.oda;
    const oda = newRoomCode();
    try { await g.putFile('sahne.json', new TextEncoder().encode(JSON.stringify({ oda }, null, 1)), 'Ortak Sahne oda kodu', sha || undefined); }
    catch (_) { const again = await g.getJson('sahne.json'); return (again.data && again.data.oda) || ''; }   // öteki cihaz aynı anda oluşturduysa onunkini al
    return oda;
  } catch (_) { return ''; }
}
async function openLinkSheet() {
  if (!L.code) L.code = await linkRoomFromRepo() || '';
  const nameIn = h('input', { class: 'field', value: L.name, placeholder: 'Hakan, Eylem…', autocapitalize: 'words' });
  const codeIn = h('input', { class: 'field link-code', value: L.code, autocapitalize: 'characters', spellcheck: 'false' });
  const modes = [['both', '⇄ ' + t('linkBoth')], ['follow', '⇠ ' + t('linkFollow')], ['lead', '⇢ ' + t('linkLead')]];
  const seg = h('div', { class: 'seg link-seg' }, ...modes.map(([k, l]) => h('button', { class: 'seg-btn' + (L.mode === k ? ' on' : ''), onclick: e => {
    L.mode = k; seg.querySelectorAll('.seg-btn').forEach(x => x.classList.toggle('on', x === e.currentTarget)); } }, l)));
  const apply = on => {
    L.name = nameIn.value.trim(); L.code = codeIn.value.trim().toUpperCase(); L.on = on && !!L.code;
    linkSave(); linkConnect(); closeModal(); toast(L.on ? '🔗 ' + t('linkOnToast') : t('linkOffToast'));
  };
  modal(
    h('div', { class: 'modal-head' }, h('h2', {}, '🔗 ' + t('linkTitle')), h('button', { class: 'mh-btn', onclick: closeModal }, '✕')),
    h('p', { class: 'link-help' }, t('linkHelp')),
    h('button', { class: 'btn link-big ' + (L.on ? 'off' : 'primary'), onclick: () => apply(!L.on) }, L.on ? '⏹ ' + t('linkStop') : '🔗 ' + t('linkStart')),
    h('label', { class: 'lab' }, t('linkName')), nameIn,
    h('label', { class: 'lab' }, t('linkMode')), seg,
    h('label', { class: 'lab' }, t('linkCode')), codeIn,
    h('div', { class: 'link-small' }, t('linkCodeHelp')),
    L.on ? h('button', { class: 'btn', style: 'margin-top:10px', onclick: () => apply(true) }, t('save')) : null,
  );
}

function lyricsHtml(text) {
  // eski DOS dosyalarının sonundaki dosya‑sonu işareti (Ctrl‑Z, 0x1A) ve diğer görünmez kontrol karakterleri ekranda ⊠ gibi çıkmasın (dosyaya dokunulmaz)
  text = text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/\s+$/, '');
  const cl = look().caseLyrics;
  return text.split('\n').map(line => {
    if (line.trim() && isChordLine(line)) return '<span class="chord">' + escapeHtml(transposeLine(line, S.transpose)) + '</span>';
    return escapeHtml(caseText(line, cl));
  }).join('\n');
}

function hasChords(text) { let n = 0; for (const l of text.split('\n')) if (l.trim() && isChordLine(l) && ++n >= 2) return true; return false; }

function tbBtn(label, title, fn, cls = '') { return h('button', { class: 'icon-btn ' + cls, title, 'aria-label': title, onclick: fn }, label); }

function renderSong() {
  const rec = S.songs.get(S.current);
  if (!rec) { $('song').hidden = true; $('empty').hidden = false; return; }
  $('empty').hidden = true; $('song').hidden = false;
  const isFav = S.programs.fav.includes(rec.p);
  const idx = S.context.list.indexOf(rec.p);
  const chords = hasChords(rec.t);
  const tb = $('songToolbar');
  tb.replaceChildren(...[
    tbBtn('‹', t('prev'), () => step(-1)),
    h('span', { class: 'tb-label' }, idx >= 0 ? `${idx + 1}/${S.context.list.length}` : ''),
    tbBtn('›', t('next'), () => step(1)),
    h('span', { class: 'sep' }),
    tbBtn('A−', t('fontSmaller'), () => setFont(-2)),
    tbBtn('A+', t('fontBigger'), () => setFont(2)),
    h('span', { class: 'sep' }),
    tbBtn(S.scrolling ? '❚❚' : '▶', t('autoScroll'), toggleScroll, S.scrolling ? 'on' : ''),
    tbBtn('−', t('speed'), () => setSpeed(-5)),
    h('span', { class: 'tb-label', title: t('speed') }, S.settings.speed),
    tbBtn('+', t('speed'), () => setSpeed(5)),
    chords ? h('span', { class: 'sep' }) : null,
    chords ? tbBtn('♭', t('transpose'), () => { S.transpose--; renderSong(); }) : null,
    chords ? h('span', { class: 'tb-label', title: t('transpose') }, (S.transpose > 0 ? '+' : '') + S.transpose) : null,
    chords ? tbBtn('♯', t('transpose'), () => { S.transpose++; renderSong(); }) : null,
    h('span', { class: 'grow' }),
    tbBtn(isFav ? '★' : '☆', isFav ? t('unfavorite') : t('favorite'), () => toggleFav(rec.p), isFav ? 'on' : ''),
    tbBtn('＋', t('addToProgram'), () => addToProgramDialog(rec.p)),
    tbBtn('🔎', t('searchWeb'), () => webSearch(rec._title)),
    VIEW_ONLY ? null : tbBtn('🏷', t('songNote'), () => openNoteDialog(rec.p)),
    VIEW_ONLY ? null : tbBtn('✎', t('edit'), () => openEditor(rec.p)),
    tbBtn('⎙', t('print'), () => window.print()),
    VIEW_ONLY ? null : tbBtn('🗑', t('delete'), () => deleteSong(rec.p)),
    tbBtn('⛶', t('stage'), openStage),
    tbBtn('▴', t('hideToolbar'), () => setCompact(true)),
  ].filter(Boolean));
  renderPhoneBar(rec, idx);
  $('songTitle').textContent = showTitle(rec._title);
  $('songNote').replaceChildren(...noteChips(noteOf(rec.p)), ...tonBadges(rec),
    h('button', { class: 'chip chip-add', title: t('songNote'), onclick: () => openNoteDialog(rec.p) }, noteOf(rec.p) ? '✎' : '＋ ' + t('songNote')));
  const meta = $('songMeta'); meta.replaceChildren();
  const d = dirName(rec.p);
  if (idx >= 0) meta.append(h('span', { class: 'pos only-phone' }, `${idx + 1}/${S.context.list.length}`));
  // sade bilgi satırı: sadece bulunduğu klasörün adı (tam yol değil) + usul/makam etiketi
  meta.append(h('button', { class: 'meta-folder', title: d || t('root'), onclick: () => goDir(d) }, '📁 ' + (d ? showFolder(baseName(d)) : t('root'))));
  for (const tg of rec._tags) meta.append(h('span', { class: 'tag' }, tg));
  if (rec.dirty) meta.append(h('span', { title: t('pending', { n: 1 }) }, '✱'));
  // kopya bilgisi sadece düzenleme yapılan cihazlarda (iPhone'da gizli)
  const dups = VIEW_ONLY ? [] : duplicatesOf(rec.p);
  if (dups.length) meta.append(h('button', { onclick: () => showDuplicates(rec.p, dups) }, t('duplicates', { n: dups.length })));
  $('lyrics').innerHTML = lyricsHtml(rec.t);
  document.documentElement.style.setProperty('--lyrics-size', S.settings.font + 'px');
  // sadece şarkı değişince başa dön (hız/favori değişince okunan yer kaybolmasın)
  if (S._shown !== rec.p) { $('songScroll').scrollTop = 0; S._shown = rec.p; }
  $('unfoldBtn').hidden = !S.settings.compact || isPhone();
}

// ------------------------------------------------------------------ iPhone dikey arayüz
const phoneMq = matchMedia('(max-width: 600px)');
function isPhone() { return phoneMq.matches; }
phoneMq.addEventListener && phoneMq.addEventListener('change', () => { if (S.current && !$('song').hidden) renderSong(); });

function pbBtn(label, title, fn, cls = '') { return h('button', { class: 'pb-btn ' + cls, title, 'aria-label': title, onclick: fn }, label); }

function renderPhoneBar(rec, idx) {
  const L = S.context.list;
  $('phoneBar').replaceChildren(
    pbBtn('‹', t('prev'), () => step(-1), idx <= 0 ? 'dim' : ''),
    pbBtn('A−', t('fontSmaller'), () => setFont(-2)),
    pbBtn(S.scrolling ? '❚❚' : '▶', t('autoScroll'), toggleScroll, 'play' + (S.scrolling ? ' on' : '')),
    pbBtn('A+', t('fontBigger'), () => setFont(2)),
    pbBtn('›', t('next'), () => step(1), idx < 0 || idx >= L.length - 1 ? 'dim' : ''),
    pbBtn('⋯', t('more'), () => openSongSheet(rec)),
  );
}

/** "⋯" alt sayfası: iPhone'da üst çubuktaki diğer tüm düğmeler burada, büyük ve tek elle. */
function openSongSheet(rec) {
  const isFav = S.programs.fav.includes(rec.p);
  const chords = hasChords(rec.t);
  const act = (icon, label, fn, cls = '') => h('button', { class: 'sheet-act ' + cls, onclick: () => { closeModal(); fn(); } },
    h('span', { class: 'sheet-ico' }, icon), h('span', {}, label));
  const speedVal = h('span', { class: 'sheet-val' }, S.settings.speed);
  const keyVal = h('span', { class: 'sheet-val' }, (S.transpose > 0 ? '+' : '') + S.transpose);
  const stepper = (label, valEl, minus, plus) => h('div', { class: 'sheet-row' },
    h('span', { class: 'sheet-label' }, label),
    h('button', { class: 'pb-btn', onclick: minus }, '−'), valEl, h('button', { class: 'pb-btn', onclick: plus }, '+'));
  modal(
    h('div', { class: 'sheet-grab' }),
    h('div', { class: 'sheet-title' }, showTitle(rec._title)),
    // Not (solist · ton · BPM · style · not) — iPhone'da da düzenlenebilir (söz değil)
    h('button', { class: 'sheet-note-btn', onclick: () => { closeModal(); openNoteDialog(rec.p); } },
      h('span', { class: 'sheet-note-head' }, '🏷 ' + t('songNote') + ' — 🎤 ' + t('solist') + ' · 🎵 ' + t('ton') + ' · BPM · 🥁 Style'),
      noteOf(rec.p) ? h('span', { class: 'sheet-note-chips' }, ...noteChips(noteOf(rec.p))) : h('span', { class: 'sheet-note-empty' }, '＋ ' + t('noteAddLong'))),
    h('div', { class: 'sheet-grid' },
      act(isFav ? '★' : '☆', isFav ? t('unfavorite') : t('favorite'), () => toggleFav(rec.p), isFav ? 'on' : ''),
      act('＋', t('addToProgram'), () => addToProgramDialog(rec.p)),
      act('⛶', t('stage'), openStage),
      act('🔎', t('searchWeb'), () => webSearch(rec._title)),
      VIEW_ONLY ? null : act('✎', t('edit'), () => openEditor(rec.p)),
      VIEW_ONLY ? null : act('🗑', t('delete'), () => deleteSong(rec.p), 'danger')),
    stepper(t('speed'), speedVal, () => { setSpeed(-5); speedVal.textContent = S.settings.speed; }, () => { setSpeed(5); speedVal.textContent = S.settings.speed; }),
    chords ? stepper(t('transpose'), keyVal, () => { S.transpose--; renderSong(); keyVal.textContent = (S.transpose > 0 ? '+' : '') + S.transpose; },
      () => { S.transpose++; renderSong(); keyVal.textContent = (S.transpose > 0 ? '+' : '') + S.transpose; }) : null,
    h('button', { class: 'btn sheet-close', onclick: closeModal }, t('close')),
  );
  $('modal').classList.add('sheet');
}

function showDuplicates(p, dups) {
  modal(h('h2', {}, t('duplicates', { n: dups.length })),
    h('div', { class: 'pick-list' }, [p, ...dups].map(x => songItem(x, { ctx: { list: [p, ...dups], label: '' } }))),
    h('div', { class: 'btn-row' }, h('button', { class: 'btn', onclick: closeModal }, t('close'))));
  $('modalCard').addEventListener('click', e => { if (e.target.closest('.item')) closeModal(); }, { once: true });
}

function step(k) {
  const L = S.context.list;
  if (!L.length) return;
  let i = L.indexOf(S.current);
  i = i < 0 ? 0 : i + k;
  if (i < 0 || i >= L.length) return;
  let tries = 0;
  while (i >= 0 && i < L.length && (!S.songs.has(L[i]) || S.songs.get(L[i]).del) && tries++ < L.length) i += k;
  if (i >= 0 && i < L.length) openSong(L[i]);
}

function setFont(d) {
  if (!$('stage').hidden) {
    S.settings.stageFont = Math.max(18, Math.min(90, S.settings.stageFont + d * 2));
    document.documentElement.style.setProperty('--stage-size', S.settings.stageFont + 'px');
  } else {
    S.settings.font = Math.max(12, Math.min(60, S.settings.font + d));
    document.documentElement.style.setProperty('--lyrics-size', S.settings.font + 'px');
  }
  saveSettings();
}
/** İki parmakla (pinch) sadece şarkı yazısını büyüt/küçült; ekran düzeni sabit kalır. */
function addPinchFont(el) {
  let d0 = 0, f0 = 0, stage = false;
  const dist = t => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  el.addEventListener('touchstart', e => {
    if (e.touches.length !== 2) return;
    stage = !$('stage').hidden;
    d0 = dist(e.touches); f0 = stage ? S.settings.stageFont : S.settings.font;
  }, { passive: true });
  el.addEventListener('touchmove', e => {
    if (e.touches.length !== 2 || !d0) return;
    e.preventDefault();
    const f = Math.round(f0 * dist(e.touches) / d0);
    if (stage) { S.settings.stageFont = Math.max(18, Math.min(90, f)); document.documentElement.style.setProperty('--stage-size', S.settings.stageFont + 'px'); }
    else { S.settings.font = Math.max(12, Math.min(60, f)); document.documentElement.style.setProperty('--lyrics-size', S.settings.font + 'px'); }
  }, { passive: false });
  el.addEventListener('touchend', e => { if (d0 && e.touches.length < 2) { d0 = 0; saveSettings(); } });
}
function setSpeed(d) { S.settings.speed = Math.max(5, Math.min(200, S.settings.speed + d)); saveSettings(); renderSong(); }

// ------------------------------------------------------------------ otomatik kaydırma
let rafId = 0, lastTs = 0, acc = 0;
function scroller() { return !$('stage').hidden ? $('stageScroll') : $('songScroll'); }
function toggleScroll() { S.scrolling ? stopScroll() : startScroll(); }
function startScroll() {
  S.scrolling = true; lastTs = 0; acc = 0;
  const loop = ts => {
    if (!S.scrolling) return;
    if (lastTs) {
      acc += (ts - lastTs) / 1000 * S.settings.speed;
      const px = Math.floor(acc);
      if (px >= 1) {
        acc -= px;
        const el = scroller();
        const before = el.scrollTop;
        el.scrollTop += px;
        if (el.scrollTop === before && before > 0) { stopScroll(); return; }
      }
    }
    lastTs = ts; rafId = requestAnimationFrame(loop);
  };
  rafId = requestAnimationFrame(loop);
  updateScrollButtons();
}
function stopScroll() { S.scrolling = false; cancelAnimationFrame(rafId); updateScrollButtons(); }
function updateScrollButtons() {
  const sb = $('stageScrollBtn'); sb.textContent = S.scrolling ? '❚❚' : '▶'; sb.classList.toggle('on', S.scrolling);
  if (S.current && !$('song').hidden) {
    const b = [...$('songToolbar').children].find(x => x.title === t('autoScroll'));
    if (b) { b.textContent = S.scrolling ? '❚❚' : '▶'; b.classList.toggle('on', S.scrolling); }
    const pb = $('phoneBar').querySelector('.play');
    if (pb) { pb.textContent = S.scrolling ? '❚❚' : '▶'; pb.classList.toggle('on', S.scrolling); }
  }
}

// ------------------------------------------------------------------ sahne modu
function openStage() {
  if (!S.current) return;
  $('stage').hidden = false;
  document.documentElement.style.setProperty('--stage-size', S.settings.stageFont + 'px');
  renderStage();
  const el = document.documentElement;
  if (el.requestFullscreen && !document.fullscreenElement) el.requestFullscreen().catch(() => {});
  keepAwake();
}
function closeStage() {
  stopScroll();
  $('stage').hidden = true;
  if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
  renderSong();
}
function renderStage() {
  const rec = S.songs.get(S.current); if (!rec) return;
  $('stageTitle').textContent = showTitle(rec._title);
  $('stageNote').replaceChildren(...noteChips(noteOf(rec.p)));
  $('stageLyrics').innerHTML = lyricsHtml(rec.t);
  const i = S.context.list.indexOf(rec.p);
  $('stagePos').textContent = (S.context.label ? S.context.label + ' · ' : '') + (i >= 0 ? `${i + 1}/${S.context.list.length}` : '');
  $('stageScroll').scrollTop = 0;
}

// ------------------------------------------------------------------ ekran açık kalsın
let wakeLock = null;
async function keepAwake() {
  try { if ('wakeLock' in navigator && !wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); } } catch (_) {}
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && S.current) keepAwake(); });

// ------------------------------------------------------------------ editör
function allDirs() { return [...S.dirs.keys()].filter(Boolean).sort((a, b) => S.collator.compare(a, b)); }

/** Yapıştırılan metni temizler: görünmez karakterler, satır sonu boşlukları, fazla boş satırlar. */
function cleanPasted(text) {
  return text.replace(/\r\n?/g, '\n').replace(/[\u00a0\u2007\u202f]/g, ' ').replace(/[\u200b-\u200d\ufeff]/g, '')
    .split('\n').map(l => l.replace(/\s+$/, '')).join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

/** Yeni şarkı taslağı: iPhone'da Safari'ye geçince uygulama kapanabilir — yazılanlar kaybolmasın. */
const DRAFT_KEY = 'md.draft';
function saveDraft(d) { try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...d, at: Date.now() })); } catch (_) {} }
function loadDraft() { try { const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); return d && Date.now() - d.at < 7 * 864e5 ? d : null; } catch (_) { return null; } }
function clearDraft() { try { localStorage.removeItem(DRAFT_KEY); } catch (_) {} }

function songFileName(artist, title) {
  const a = artist.replace(/[\\/:*?"<>|]/g, '').trim(), ti = title.replace(/[\\/:*?"<>|]/g, '').trim();
  return a && ti ? `${a} - ${ti}` : (ti || a);
}

function openEditor(p, draft) {
  if (VIEW_ONLY) { toast(t('viewOnly')); return; }
  stopScroll();
  const rec = p ? S.songs.get(p) : null;
  const isNew = !rec;
  const ed = $('editor');
  let lastNewDir = '';
  try { lastNewDir = localStorage.getItem('md.newDir') || ''; } catch (_) {}
  const dl = h('datalist', { id: 'dirList' }, allDirs().map(d => h('option', { value: d })));
  const dirIn = h('input', { class: 'field', list: 'dirList', value: draft ? draft.dir : rec ? dirName(rec.p) : (S.dir || lastNewDir), placeholder: t('root') });
  const ta = h('textarea', { spellcheck: 'false', placeholder: isNew ? t('lyricsPlaceholder') : '' });
  ta.value = draft ? draft.text : rec ? rec.t : '';
  // yeni şarkı: sanatçı + şarkı adı; mevcut şarkı: dosya adı
  const artistIn = h('input', { class: 'field', value: draft ? draft.artist : '', placeholder: t('artist'), autocapitalize: 'words' });
  const titleIn = h('input', { class: 'field', value: draft ? draft.title : '', placeholder: t('songName'), autocapitalize: 'words' });
  const nameIn = h('input', { class: 'field', value: rec ? baseName(rec.p).replace(/\.txt$/i, '') : '', placeholder: t('fileName') });
  const fileHint = h('div', { class: 'hint file-hint' });
  const updateHint = () => {
    if (!isNew) return;
    const n = songFileName(artistIn.value, titleIn.value);
    fileHint.textContent = n ? '📄 ' + (dirIn.value ? dirIn.value + '/' : '') + n + '.txt' : '';
    saveDraft({ artist: artistIn.value, title: titleIn.value, dir: dirIn.value, text: ta.value });
  };
  if (isNew) for (const el of [artistIn, titleIn, dirIn, ta]) el.addEventListener('input', updateHint);

  const searchWeb = () => {
    const q = [artistIn.value, titleIn.value].map(x => x.trim()).filter(Boolean).join(' ');
    if (!q) { toast(t('nameRequired')); titleIn.focus(); return; }
    updateHint();
    window.open('https://www.google.com/search?q=' + encodeURIComponent(q + ' şarkı sözleri'), '_blank', 'noopener');
  };
  const pasteClip = async () => {
    try {
      const txt = await navigator.clipboard.readText();
      if (!txt || !txt.trim()) { toast(t('clipboardEmpty')); return; }
      ta.value = cleanPasted(txt);
      updateHint();
      toast(t('pasted', { n: ta.value.split('\n').filter(l => l.trim()).length }));
    } catch (_) {
      // izin yoksa: kullanıcı metin alanına uzun basıp "Yapıştır" der
      ta.focus(); toast(t('pasteManual'));
    }
  };
  ta.addEventListener('paste', () => setTimeout(() => { ta.value = cleanPasted(ta.value); updateHint(); }, 0));

  const save = async () => {
    const name = isNew ? songFileName(artistIn.value, titleIn.value) : nameIn.value.replace(/[\\/:*?"<>|]/g, '').trim();
    if (!name) { toast(t('nameRequired')); (isNew ? titleIn : nameIn).focus(); return; }
    if (isNew && !ta.value.trim()) { toast(t('lyricsRequired')); ta.focus(); return; }
    const dir = dirIn.value.split('/').map(x => x.trim()).filter(Boolean).join('/');
    const newPath = (dir ? dir + '/' : '') + (/\.txt$/i.test(name) ? name : name + '.txt');
    const existing = S.songs.get(newPath);
    if (existing && !existing.del && newPath !== (rec && rec.p)) { toast(t('nameExists')); return; }
    await saveSong(rec ? rec.p : null, newPath, ta.value.replace(/\r\n?/g, '\n'));
    if (isNew) { clearDraft(); try { localStorage.setItem('md.newDir', dir); } catch (_) {} }
    ed.hidden = true;
    openSong(newPath, S.context.list.includes(newPath) ? null : { list: S.dirs.get(dirName(newPath))?.files || [newPath], label: dirName(newPath) });
    toast(gh().ok ? t('savedUploading') : t('saved'));
    if (isNew) scheduleSync(800);
  };
  const cancel = () => { if (isNew) clearDraft(); ed.hidden = true; if (S.current) renderSong(); else { $('empty').hidden = false; setNarrowSong(false); } };

  ed.replaceChildren(...[
    isNew ? h('div', { class: 'row' },
      h('label', {}, t('artist'), artistIn),
      h('label', {}, t('songName'), titleIn)) : null,
    h('div', { class: 'row' },
      isNew ? null : h('label', {}, t('fileName'), nameIn),
      h('label', {}, t('folder'), dirIn, dl)),
    isNew ? fileHint : null,
    isNew ? h('div', { class: 'btn-row helper-row' },
      h('button', { class: 'btn', onclick: searchWeb }, '🔎 ' + t('searchWeb')),
      h('button', { class: 'btn', onclick: pasteClip }, '📋 ' + t('pasteClipboard'))) : null,
    ta,
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn primary', onclick: save }, t('save')),
      h('button', { class: 'btn fix-btn', onclick: () => openFixDialog(ta, isNew ? null : nameIn, save) }, '🔤 ' + t('fixTitle')),
      h('button', { class: 'btn', onclick: cancel }, t('cancel')),
      rec ? h('span', { class: 'hint', style: 'align-self:center' }, t('encoding') + ': ' + (ENC_LABEL[rec.e] || rec.e)) : null),
  ].filter(Boolean));
  ta.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); } });
  $('song').hidden = true; $('empty').hidden = true; ed.hidden = false;
  setNarrowSong(true);
  updateHint();
  if (!draft) (rec ? ta : artistIn).focus();
}

// ------------------------------------------------------------------ 🔤 Düzelt (Türkçe harf + biçim)
let LEX = null;
async function refreshLexicon(g) {
  const st = await g.stat('bundle/sozluk.json.gz'); if (!st) return;
  const cur = LEX || await db.get('sozluk');
  if (cur && cur.sha === st.sha) { LEX = cur; return; }
  const bytes = await g.getRaw('bundle/sozluk.json.gz');
  const txt = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
  LEX = { sha: st.sha, w: JSON.parse(txt).w };
  await db.set('sozluk', LEX);
}
async function getLexicon() {
  if (LEX) return LEX.w;
  LEX = await db.get('sozluk');
  if (LEX) return LEX.w;
  const g = gh();
  if (!g.ok || !navigator.onLine) { toast(t('fixNeedLex')); return null; }
  toast(t('fixLoading'));
  try { await refreshLexicon(g); } catch (e) { toast(t('syncError', { msg: e.message })); return null; }
  return LEX ? LEX.w : null;
}
function markFixes(text, words, skip) {
  // önizleme: düzeltilen kelimeler işaretli (tahminler turuncu)
  const map = new Map(words.filter(w => !skip.has(w.from)).map(w => [w.from, w]));
  return escapeHtml(text).replace(/[A-Za-zÇĞİÖŞÜçğıöşüÂÎÛâîû]+/g, w => map.has(w) ? `<mark class="fix${map.get(w).src === 'guess' ? ' guess' : ''}">${escapeHtml(map.get(w).to)}</mark>` : w);
}
// kişisel seçimler: ✓ verilen tahmin kesinleşir, ✕ verilen öneri bir daha gelmez (kisisel-sozluk.json ile senkron)
function persObj() { const p = S.pers || {}; return { acc: p.acc || {}, rej: new Set(p.rej || []) }; }
function rememberChoices(words, skip) {
  const p = S.pers = S.pers || { acc: {}, rej: [], updated: 0 };
  const rej = new Set(p.rej);
  let changed = false;
  for (const w of words) {
    const k = trKey(w.from), to = trLower(w.to);
    if (skip.has(w.from)) { if (!rej.has(k + '>' + to)) { rej.add(k + '>' + to); changed = true; } }
    else if (w.src === 'guess' && p.acc[k] !== to) { p.acc[k] = to; changed = true; }
  }
  if (!changed) return;
  p.rej = [...rej]; p.updated = Date.now(); p.dirty = true;
  db.set('pers', p); scheduleSync();
}
async function guessReady() { try { await loadGuesser(); return true; } catch (e) { console.warn('tahminci', e); return false; } }

/** Düzenleme ekranı: öneriler ✓/✕, biçim seçenekleri, uygula ve kaydet */
async function openFixDialog(ta, nameIn, save) {
  const lex = await getLexicon(); if (!lex) return;
  await guessReady();
  const pers = persObj();
  const text = ta.value.replace(/\r\n?/g, '\n');
  const words = suggest(text, lex, pers, 'always');
  const skip = new Set();
  const opt = { upper: mostlyUpper(text), blank: tidyBlank(text) !== text, name: false };
  const oldName = nameIn ? nameIn.value : '';
  const newName = nameIn ? fixName(oldName, lex, pers) : '';
  opt.name = !!nameIn && newName !== oldName;
  const prev = h('pre', { class: 'fix-prev lyrics' });
  const draw = () => { const out = fixAll(text, lex, { upper: opt.upper, blank: opt.blank, skip, pers, guess: 'always' }); prev.innerHTML = markFixes(opt.upper ? text : out, words, skip); if (opt.upper) prev.textContent = out; };
  const sugList = h('div', { class: 'fix-list' }, ...words.map(w => {
    const row = h('div', { class: 'fix-sug' + (w.src === 'guess' ? ' guess' : '') },
      h('span', { class: 'w' }, h('s', {}, w.from), ' → ', h('b', {}, w.to), w.n > 1 ? h('small', {}, ` ×${w.n}`) : '',
        w.src === 'guess' ? h('span', { class: 'guess-tag' }, t('fixGuess')) : ''),
      h('button', { class: 'fix-ok on', onclick: () => { skip.delete(w.from); row.classList.remove('off'); draw(); } }, '✓'),
      h('button', { class: 'fix-no', onclick: () => { skip.add(w.from); row.classList.add('off'); draw(); } }, '✕'));
    return row;
  }));
  const chip = (key, label, show = true) => show ? h('button', { class: 'chip-opt' + (opt[key] ? ' on' : ''), onclick: e => { opt[key] = !opt[key]; e.currentTarget.classList.toggle('on', opt[key]); draw(); } }, label) : null;
  const apply = () => {
    ta.value = fixAll(text, lex, { upper: opt.upper, blank: opt.blank, skip, pers, guess: 'always' });
    if (nameIn && opt.name) nameIn.value = newName;
    rememberChoices(words, skip);
    closeModal(); save();
  };
  draw();
  modal(
    h('div', { class: 'modal-head' }, h('h2', {}, '🔤 ' + t('fixTitle')), h('button', { class: 'mh-btn', onclick: closeModal }, '✕')),
    prev,
    h('h3', {}, t('fixWords', { n: words.length })),
    words.length ? sugList : h('p', { class: 'hint' }, t('fixNone')),
    h('h3', {}, t('fixFormat')),
    h('div', { class: 'chip-row' },
      chip('upper', t('fixUpper')), chip('blank', t('fixBlank')),
      chip('name', t('fixName') + (newName !== oldName ? ': ' + newName : ''), !!nameIn && newName !== oldName)),
    h('div', { class: 'btn-row' }, h('button', { class: 'btn primary fix-apply', onclick: apply }, '✓ ' + t('fixApply')), h('button', { class: 'btn', onclick: closeModal }, t('cancel'))),
    h('p', { class: 'hint' }, t('fixNote') + ' ' + t('fixGuessNote')),
  );
}

/** Klasörün tamamında düzelt: önce liste, onay, tek commit (kodlama korunur). */
/** Ayarlar: Türkçe harfi eksik görünen şarkılar (ş/ğ/ı hiç yok) klasör klasör — tıkla → klasörde düzelt */
function missingLettersBox() {
  const by = new Map(); let total = 0;
  for (const r of visibleSongs()) {
    if (/[şğıŞĞ]/.test(r.t) || (r.t.match(/\p{L}/gu) || []).length < 40) continue;
    total++; const d = dirName(r.p); by.set(d, (by.get(d) || 0) + 1);
  }
  const top = [...by.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  return h('div', { class: 'miss-box' },
    h('h3', {}, '🔤 ' + t('missTitle', { n: total })),
    h('p', { class: 'hint' }, t('missHelp')),
    h('div', { class: 'miss-list' }, ...top.map(([d, n]) => h('button', { class: 'miss-row', onclick: () => { closeModal(); fixFolder(d); } },
      h('span', { class: 'name' }, '📁 ' + (d || t('root'))), h('b', {}, n)))));
}

async function fixFolder(d) {
  if (VIEW_ONLY) { toast(t('viewOnly')); return; }
  const lex = await getLexicon(); if (!lex) return;
  const opt = { turkish: true, guess: await guessReady(), blank: true, upper: false, name: true, pers: persObj() };
  const all = songsUnder(d);
  const box = h('div', { class: 'fix-folder-list' });
  const info = h('h3', {});
  let rows = [];
  let scanId = 0;
  const scan = async () => {
    const my = ++scanId;
    rows = [];
    info.textContent = '⏳ …'; box.replaceChildren();
    let k = 0;
    for (const r of all) {
      if (++k % 150 === 0) { info.textContent = `⏳ ${k} / ${all.length}`; await new Promise(res => setTimeout(res, 0)); if (my !== scanId) return; }
      const text = fixAll(r.t, lex, opt);
      const stem = baseName(r.p).replace(/\.txt$/i, '');
      const ns = opt.name ? fixName(stem, lex, opt.pers) : stem;
      if (text === r.t && ns === stem) continue;
      const ex = opt.turkish ? suggest(r.t, lex, opt.pers, opt.guess).slice(0, 5).map(w => w.from + '→' + w.to + (w.src === 'guess' ? '~' : '')).join(', ') : '';
      rows.push({ r, text, np: ns !== stem ? (dirName(r.p) ? dirName(r.p) + '/' : '') + ns + '.txt' : null, ex, on: true });
    }
    info.textContent = t('fixFound', { n: rows.length, m: all.length });
    box.replaceChildren(...rows.slice(0, 400).map(x => {
      const cb = h('input', { type: 'checkbox', checked: true, onchange: () => { x.on = cb.checked; } });
      return h('label', { class: 'fix-frow' }, cb, h('span', {}, h('b', {}, showTitle(x.r._title)), x.np ? h('small', { class: 'nm' }, ' → ' + baseName(x.np)) : '', h('small', {}, (x.ex || t('fixFormatOnly')))));
    }));
    if (rows.length > 400) box.append(h('p', { class: 'hint' }, t('fixMore', { n: rows.length - 400 })));
  };
  const chip = (key, label) => h('button', { class: 'chip-opt' + (opt[key] ? ' on' : ''), onclick: e => { opt[key] = !opt[key]; e.currentTarget.classList.toggle('on', opt[key]); scan(); } }, label);
  const run = async () => {
    const sel = rows.slice(0, 400).filter(x => x.on);
    if (!sel.length) return;
    if (!(await confirmBox(t('fixConfirm', { n: sel.length })))) { return; }
    const changes = [], prepared = [];
    for (const x of sel) {
      let e = x.r.e; if (e === 'ascii' && /[^\x00-\x7f]/.test(x.text)) e = 'cp1254';
      const { bytes, enc } = songToBytes({ t: x.text, e, n: x.r.n });
      const path = x.np || x.r.p;
      changes.push({ path: 'repertuar/' + path, bytes });
      if (x.np && x.np !== x.r.p) changes.push({ path: 'repertuar/' + x.r.p, delete: true });
      prepared.push({ x, bytes, enc, path });
    }
    if (!(await commitFolderChange(sel.map(x => x.r), changes, `Türkçe harf düzeltildi: ${sel.length} şarkı (${d})`))) return;
    const dels = [], map = new Map(), puts = [];
    for (const { x, bytes, enc, path } of prepared) {
      const sha = await gitBlobSha(bytes);
      const ok = gh().ok;
      const nr = decorate({ p: path, t: x.text, e: enc, n: x.r.n, s: ok ? sha : x.r.s, dirty: !ok, m: Date.now(), ...(ok ? { up: sha, upAt: Date.now() } : {}) });
      S.songs.set(path, nr); puts.push(strip(nr));
      if (path !== x.r.p) { S.songs.delete(x.r.p); dels.push(x.r.p); map.set(x.r.p, path); }
    }
    await db.putSongs(puts);
    if (dels.length) { await db.deleteSongs(dels); markRemoved(dels); remapPaths(map); }
    closeModal(); rebuildIndex(); renderList();
    if (S.current && S.songs.has(S.current) && $('editor').hidden) renderSong();
    scheduleSync(800); toast(t('fixDone', { n: sel.length }));
  };
  scan();
  modal(
    h('div', { class: 'modal-head' }, h('h2', {}, '🔤 ' + t('fixFolder')), h('button', { class: 'mh-btn', onclick: closeModal }, '✕')),
    h('p', { class: 'hint' }, '📁 ' + d + ' · ' + t('songs', { n: all.length })),
    h('div', { class: 'chip-row' }, chip('turkish', t('fixTurkish')), chip('guess', t('fixGuessChip')), chip('upper', t('fixUpper')), chip('blank', t('fixBlank')), chip('name', t('fixNames'))),
    info, box,
    h('div', { class: 'btn-row' }, h('button', { class: 'btn primary fix-apply', onclick: run }, '✓ ' + t('fixApplyFolder')), h('button', { class: 'btn', onclick: closeModal }, t('cancel'))),
    h('p', { class: 'hint' }, t('fixNote')),
  );
}

// ------------------------------------------------------------------ 🧹 Repertuvar Düzenleyici (adım adım, önizlemeli)
/** Seçilen değişiklikleri tek kayıtla uygula. x: { r, text (null = içerik aynı), np (null = yer aynı) } */
async function commitSongEdits(sel, message) {
  const changes = [], prepared = [], used = new Set();
  for (const x of sel) {
    let path = x.np || x.r.p;
    if (x.np && x.np !== x.r.p) {                         // hedefte aynı ad varsa (2), (3)…
      const dir = dirName(path), stem = baseName(path).replace(/\.txt$/i, '');
      let i = 2; while ((S.songs.has(path) && !S.songs.get(path).del && path !== x.r.p) || used.has(path)) path = (dir ? dir + '/' : '') + `${stem} (${i++}).txt`;
    }
    used.add(path);
    let bytes = null, enc = x.r.e;
    if (x.text != null && x.text !== x.r.t) {
      let e = x.r.e; if (e === 'ascii' && /[^\x00-\x7f]/.test(x.text)) e = 'cp1254';
      ({ bytes, enc } = songToBytes({ t: x.text, e, n: x.r.n }));
      changes.push({ path: 'repertuar/' + path, bytes });
    } else if (path !== x.r.p) changes.push({ path: 'repertuar/' + path, sha: x.r.s, fromP: x.r.p });
    else continue;
    if (path !== x.r.p) changes.push({ path: 'repertuar/' + x.r.p, delete: true });
    prepared.push({ x, bytes, enc, path });
  }
  if (!prepared.length) return 0;
  if (!(await commitFolderChange(prepared.map(p => p.x.r), changes, message))) return 0;
  const dels = [], map = new Map(), puts = [], ok = gh().ok;
  for (const { x, bytes, enc, path } of prepared) {
    const sha = bytes ? await gitBlobSha(bytes) : x.r.s;
    const nr = decorate({ p: path, t: x.text != null ? x.text : x.r.t, e: enc, n: x.r.n, s: ok ? sha : x.r.s, dirty: !ok, m: Date.now(), ...(ok ? { up: sha, upAt: Date.now() } : {}) });
    S.songs.set(path, nr); puts.push(strip(nr));
    if (path !== x.r.p) { S.songs.delete(x.r.p); dels.push(x.r.p); map.set(x.r.p, path); }
  }
  await db.putSongs(puts);
  if (dels.length) { await db.deleteSongs(dels); markRemoved(dels); remapPaths(map); }
  rebuildIndex(); renderList(); scheduleSync(800);
  return prepared.length;
}

const ORG = { extraArtists: (() => { try { return JSON.parse(localStorage.getItem('md.artists') || '[]'); } catch (_) { return []; } })() };
const artKey = x => fold(x || '').replace(/-\d+$/, '').replace(/[^a-z0-9]/g, '');
const titleCase = x => x.replace(/-\d+$/, '').split(/\s+/).map(w => w ? trUpper(w[0]) + trLower(w.slice(1)) : w).join(' ');
/** Tanınan sanatçılar: kökteki Sanatçılar/* adları (asıl yazım) + başka yerdeki "SANATÇILAR" klasörlerinin altındakiler + elle yazılanlar */
function artistMap() {
  const m = new Map();
  for (const p of S.dirs.keys()) if (p.startsWith('Sanatçılar/') && p.split('/').length === 2) m.set(artKey(baseName(p)), baseName(p));
  for (const p of S.dirs.keys()) {
    const parts = p.split('/');
    if (parts.length >= 2 && fold(parts[parts.length - 2]) === 'sanatcilar') { const k = artKey(parts[parts.length - 1]); if (k && !m.has(k)) m.set(k, titleCase(parts[parts.length - 1])); }
  }
  for (const a of ORG.extraArtists) if (a.trim()) m.set(fold(a).replace(/[^a-z0-9]/g, ''), a.trim());
  return m;
}
const SITE_RE = /(www\.|https?:\/\/|\.com\b|\.net\b|\.org\b|sarkisozleri|şarkı\s*sözleri|lyrics)/i;
const KUNYE_RE = /^\s*(söz|müzik|beste|söz\s*[-&/]\s*müzik|yorum|albüm|düzenleme|aranje)\s*[:\-–]/i;
/** Dosya adı temizliği: baştaki uzun sayı, alt çizgi, "Sanatçı - Ad", Türkçe harf */
function cleanStem(stem, opt, AM, lex, pers) {
  let s = stem, artist = '';
  const A = x => AM.get(artKey(x));
  if (opt.junk) {
    s = s.replace(/^\d{6,}[_\s.\-]+/, '').replace(/__([^_]+)_+$/, ' ($1)').replace(/_+/g, ' ').replace(/\s{2,}/g, ' ').trim();
  }
  // "Sanatçı - Ad", "Ad - Sanatçı", "Sanatçı-Ad": her tireyi dene, bir yanı tanınan sanatçıysa
  const pre = (s.match(/^\d{1,3}[.\- ]+(?=\D)/) || [''])[0], rest = s.slice(pre.length);
  for (const mm of rest.matchAll(/\s*[-–]\s*/g)) {
    const L = rest.slice(0, mm.index).trim(), R = rest.slice(mm.index + mm[0].length).trim();
    if (!L || !R) continue;
    const a = A(L) || A(R);
    if (a) { artist = a; if (opt.artist) s = pre + (A(L) ? R : L); break; }
  }
  if (!artist) {                                       // "… ibrahim tatlises" / "CENGIZ KURTOGLU …" (2+ kelimelik ad, tiresiz)
    const w = rest.split(/\s+/);
    for (let n = Math.min(3, w.length - 1); n >= 2 && !artist; n--) {
      const tail = A(w.slice(-n).join(' ')), head = A(w.slice(0, n).join(' '));
      if (tail) { artist = tail; if (opt.artist) s = pre + w.slice(0, -n).join(' '); }
      else if (head) { artist = head; if (opt.artist) s = pre + w.slice(n).join(' '); }
    }
  }
  if (opt.turkish && lex) s = fixName(s, lex, pers);
  s = s.replace(/[\\/:*?"<>|]/g, '').trim();
  return { stem: s || stem, artist };
}
function cleanBody(text, opt) {
  let lines = text.split('\n'), removed = 0;
  if (opt.site || opt.kunye) lines = lines.filter(l => { const bad = (opt.site && SITE_RE.test(l)) || (opt.kunye && KUNYE_RE.test(l)); if (bad) removed++; return !bad; });
  return { text: removed ? tidyBlank(lines.join('\n')) : text, removed };
}

function openOrganizer() {
  if (VIEW_ONLY) { toast(t('viewOnly')); return; }
  const card = (n, title, desc, fn, soon) => h('button', { class: 'org-step' + (soon ? ' soon' : ''), onclick: soon ? null : fn },
    h('span', { class: 'org-n' }, n), h('span', {}, h('b', {}, title), h('small', {}, desc)));
  modal(
    h('div', { class: 'modal-head' }, h('h2', {}, '🧹 ' + t('orgTitle')), h('button', { class: 'mh-btn', onclick: closeModal }, '✕')),
    h('p', { class: 'hint' }, t('orgHelp')),
    h('button', { class: 'btn org-backup', onclick: async () => {
      const g = gh(); if (!g.ok) { toast(t('needOnline')); return; }
      const d = new Date(), name = `yedek-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
      try { await g.createBranch(name); toast('💾 ' + t('orgBackupDone', { n: name })); } catch (e) { toast(t('syncError', { msg: e.message })); }
    } }, '💾 ' + t('orgBackup')),
    card('①', t('orgStep1'), t('orgStep1d'), () => orgNames()),
    card('②', t('orgStep2'), t('orgStep2d'), () => orgArtists()),
    card('③', t('orgStep3'), t('orgSoon'), null, true),
    card('④', t('orgStep4'), t('orgSoon'), null, true));
}

/** ① Adlar ve gereksiz yazılar */
async function orgNames() {
  const lex = await getLexicon(); await guessReady();
  const pers = persObj(), AM = artistMap();
  const opt = { junk: true, artist: true, turkish: !!lex, site: true, kunye: false };
  const box = h('div', { class: 'fix-folder-list' }), info = h('h3', {});
  let rows = [], scanId = 0;
  const scan = async () => {
    const my = ++scanId; rows = []; box.replaceChildren(); let k = 0;
    const all = visibleSongs();
    for (const r of all) {
      if (++k % 300 === 0) { info.textContent = `⏳ ${k} / ${all.length}`; await new Promise(res => setTimeout(res, 0)); if (my !== scanId) return; }
      const stem = baseName(r.p).replace(/\.txt$/i, '');
      const c = cleanStem(stem, opt, AM, opt.turkish ? lex : null, pers);
      const b = cleanBody(r.t, opt);
      if (c.stem === stem && !b.removed) continue;
      rows.push({ r, artistCut: !!c.artist && opt.artist, junkCut: /^\d{6,}|_/.test(stem), text: b.removed ? b.text : null, np: c.stem !== stem ? (dirName(r.p) ? dirName(r.p) + '/' : '') + c.stem + '.txt' : null, removed: b.removed, on: true });
    }
    const rank = x => x.np && (x.artistCut || x.junkCut) ? 0 : x.np ? 1 : 2;
    rows.sort((a, b) => rank(a) - rank(b));
    info.textContent = t('orgFound', { n: rows.length });
    box.replaceChildren(...rows.slice(0, 500).map(x => {
      const cb = h('input', { type: 'checkbox', checked: true, onchange: () => { x.on = cb.checked; } });
      return h('label', { class: 'fix-frow' }, cb, h('span', {},
        x.np ? h('span', {}, h('s', { class: 'old' }, baseName(x.r.p)), ' → ', h('b', {}, baseName(x.np))) : h('b', {}, baseName(x.r.p)),
        h('small', {}, dirName(x.r.p) + (x.removed ? ' · ' + t('orgLinesRemoved', { n: x.removed }) : ''))));
    }));
    if (rows.length > 500) box.append(h('p', { class: 'hint' }, t('fixMore', { n: rows.length - 500 })));
  };
  const chip = (key, label) => h('button', { class: 'chip-opt' + (opt[key] ? ' on' : ''), onclick: e => { opt[key] = !opt[key]; e.currentTarget.classList.toggle('on', opt[key]); scan(); } }, label);
  const run = async () => {
    const sel = rows.slice(0, 500).filter(x => x.on); if (!sel.length) return;
    if (!(await confirmBox(t('orgConfirm', { n: sel.length })))) return;
    const n = await commitSongEdits(sel, `Düzenleyici ①: ${sel.length} şarkının adı / gereksiz yazıları temizlendi`);
    if (n) toast(t('orgDone', { n }));
    orgNames();
  };
  modal(
    h('div', { class: 'modal-head' }, h('button', { class: 'mh-btn', onclick: openOrganizer }, '‹'), h('h2', {}, '① ' + t('orgStep1')), h('button', { class: 'mh-btn', onclick: closeModal }, '✕')),
    h('div', { class: 'chip-row' }, chip('junk', t('orgOptJunk')), chip('artist', t('orgOptArtist')), lex ? chip('turkish', t('fixTurkish')) : null, chip('site', t('orgOptSite')), chip('kunye', t('orgOptKunye'))),
    info, box,
    h('div', { class: 'btn-row' }, h('button', { class: 'btn primary fix-apply', onclick: run }, '✓ ' + t('orgApply')), h('button', { class: 'btn', onclick: closeModal }, t('cancel'))),
    h('p', { class: 'hint' }, t('orgNote')));
  scan();
}

/** ② Sanatçıları topla: "Sanatçı - Ad" adlı ya da sanatçı adlı klasördeki şarkılar → Sanatçılar/Sanatçı/ */
function orgArtists() {
  const AM = artistMap();
  const extraIn = h('input', { class: 'field', value: ORG.extraArtists.join(', '), placeholder: 'Ahmet Kaya, Sezen Aksu, …' });
  const box = h('div', { class: 'fix-folder-list' }), info = h('h3', {});
  let groups = [];
  const scan = () => {
    const AMx = artistMap(), by = new Map();
    for (const r of visibleSongs()) {
      if (r.p.startsWith('Sanatçılar/')) continue;
      const stem = baseName(r.p).replace(/\.txt$/i, '');
      let { stem: title, artist } = cleanStem(stem, { junk: true, artist: true }, AMx, null, null);
      let byFolder = false;                                  // en derindeki sanatçı klasörü önce
      for (const seg of r.p.split('/').slice(0, -1).reverse()) { const a = AMx.get(artKey(seg)); if (a) { artist = a; byFolder = true; break; } }
      if (!artist) continue;
      const d = dirName(r.p);
      if (!by.has(artist)) by.set(artist, new Map());
      const src = by.get(artist);
      if (!src.has(d)) src.set(d, { d, byFolder, list: [], on: byFolder });
      src.get(d).list.push({ r, np: `Sanatçılar/${artist}/${title}.txt`, text: null });
    }
    groups = [...by.entries()].map(([a, src]) => ({ a, src: [...src.values()].sort((x, y) => (y.byFolder - x.byFolder) || y.list.length - x.list.length) }))
      .sort((x, y) => y.src.reduce((s, v) => s + v.list.length, 0) - x.src.reduce((s, v) => s + v.list.length, 0));
    const count = () => { const on = groups.flatMap(g => g.src).filter(v => v.on); info.textContent = t('orgArtFound', { n: on.reduce((s, v) => s + v.list.length, 0), m: new Set(groups.filter(g => g.src.some(v => v.on)).map(g => g.a)).size }); };
    count();
    box.replaceChildren(...groups.map(g => {
      const subs = g.src.map(v => {
        const cb = h('input', { type: 'checkbox', checked: v.on, onchange: () => { v.on = cb.checked; count(); } });
        v.cb = cb;
        return h('label', { class: 'org-src' + (v.byFolder ? '' : ' style') }, cb, h('span', {},
          (v.byFolder ? '📁 ' : '🏷 ') + (v.d || '/') + ' · ' + v.list.length,
          v.byFolder ? null : h('small', {}, t('orgByName'))));
      });
      const all = h('input', { type: 'checkbox', checked: g.src.some(v => v.on), onchange: () => { for (const v of g.src) if (v.byFolder || !all.checked) { v.on = all.checked; v.cb.checked = all.checked; } count(); } });
      return h('div', { class: 'org-group' }, h('label', { class: 'fix-frow' }, all, h('b', {}, '🎤 ' + g.a + ' · ' + t('songs', { n: g.src.reduce((s, v) => s + v.list.length, 0) }))), ...subs);
    }));
  };
  const run = async () => {
    const sel = groups.flatMap(g => g.src).filter(v => v.on).flatMap(v => v.list).slice(0, 1500); if (!sel.length) return;
    if (!(await confirmBox(t('orgArtConfirm', { n: sel.length })))) return;
    const n = await commitSongEdits(sel, `Düzenleyici ②: ${sel.length} şarkı sanatçı klasörlerine toplandı`);
    if (n) toast(t('orgDone', { n }));
    orgArtists();
  };
  modal(
    h('div', { class: 'modal-head' }, h('button', { class: 'mh-btn', onclick: openOrganizer }, '‹'), h('h2', {}, '② ' + t('orgStep2')), h('button', { class: 'mh-btn', onclick: closeModal }, '✕')),
    h('p', { class: 'hint' }, t('orgArtHelp', { n: AM.size })),
    h('label', { class: 'lab' }, t('orgExtraArtists')), extraIn,
    h('button', { class: 'btn', onclick: () => { ORG.extraArtists = extraIn.value.split(',').map(x => x.trim()).filter(Boolean); try { localStorage.setItem('md.artists', JSON.stringify(ORG.extraArtists)); } catch (_) {} scan(); } }, '🔄 ' + t('orgRescan')),
    info, box,
    h('div', { class: 'btn-row' }, h('button', { class: 'btn primary fix-apply', onclick: run }, '✓ ' + t('orgArtApply')), h('button', { class: 'btn', onclick: closeModal }, t('cancel'))),
    h('p', { class: 'hint' }, t('orgNote2')));
  scan();
}

// ------------------------------------------------------------------ 🎼 Ton Defteri (gizli)
const TON = { singer: 'eylem', tarz: '', az: false, q: '' };
function tonItems(singer) { return Object.values((S.tonBook || emptyBook()).items).filter(x => !x.deleted && (!singer || x.singer === singer)); }
function tonLink(title) {
  const k = fold(title || '').replace(/[^a-z0-9]+/g, '');
  return (S.titleIndex.get(k) || []).find(p => S.songs.has(p) && !S.songs.get(p).del) || null;
}
function tonPath(it) { return (it.p && S.songs.has(it.p) && !S.songs.get(it.p).del) ? it.p : tonLink(it.title); }
function saveTon(it) {
  it.updated = Date.now();
  S.tonBook = S.tonBook || emptyBook(); S.tonBook.items[it.id] = it;
  db.set('tonlar', S.tonBook); scheduleSync(1500);
}
/** Sözlerde: kilit açıkken bu şarkının tonları (Eylem · Re m) */
function tonBadges(rec) {
  if (!S.tonOpen || !S.tonBook) return [];
  const k = fold(rec._title).replace(/[^a-z0-9]+/g, '');
  return tonItems().filter(it => it.p === rec.p || fold(it.title).replace(/[^a-z0-9]+/g, '') === k)
    .map(it => h('span', { class: 'chip ton-badge ' + it.singer }, (SINGERS.find(s => s[0] === it.singer) || ['', ''])[1] + ' · ' + (it.ton || '?') + (usulOf(it) ? ' · ' + usulOf(it) : '')));
}
/** Gizli giriş: başlığa 2 sn basılı tut */
function bindTonEntry() {
  for (const el of document.querySelectorAll('.phone-title, .brand')) {
    let tm = 0;
    const start = e => { clearTimeout(tm); tm = setTimeout(() => { openTonDefteri(); if (S.current && !$('song').hidden) renderSong(); }, 2000); };
    const stop = () => clearTimeout(tm);
    el.addEventListener('pointerdown', start); el.addEventListener('pointerup', stop); el.addEventListener('pointerleave', stop); el.addEventListener('pointercancel', stop);
    el.addEventListener('contextmenu', e => e.preventDefault());
    el.style.webkitUserSelect = 'none'; el.style.userSelect = 'none'; el.style.webkitTouchCallout = 'none';
  }
}
/** Ton Defteri artık kenar çubuğunda bir sekme (Programlar gibi): 🎼 Tonlar — kilit açıkken görünür */
function openTonDefteri() {
  closeModal();
  S.tonOpen = true; try { localStorage.setItem('md.tonOpen', '1'); } catch (_) {}
  S.tab = 'tonlar'; S.programId = null; $('q').value = '';
  setNarrowSong(false); saveUi(); renderList();
}
function lockTon() {
  S.tonOpen = false; try { localStorage.removeItem('md.tonOpen'); } catch (_) {}
  if (S.tab === 'tonlar') S.tab = 'library';
  saveUi(); renderList(); if (S.current && !$('song').hidden) renderSong(); toast('🔒 ' + t('tonLocked'));
}
function drawTon() { if (S.tab === 'tonlar') keepScroll(renderList); }
function renderTonTab(head, list) {
  const all = tonItems(TON.singer);
  const counts = new Map(); for (const it of all) { const k = tarzOf(it) || usulOf(it) || '—'; counts.set(k, (counts.get(k) || 0) + 1); }
  head.append(
    h('div', { class: 'ton-tabs' }, ...SINGERS.map(([k, l]) => h('button', { class: TON.singer === k ? 'on' : '', onclick: () => { TON.singer = k; TON.tarz = ''; drawTon(); } }, l + ' · ' + tonItems(k).length))),
    h('div', { class: 'ton-chips' },
      h('button', { class: !TON.tarz ? 'on' : '', onclick: () => { TON.tarz = ''; drawTon(); } }, t('tonAll') + ' ' + all.length),
      ...[...counts.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => h('button', { class: TON.tarz === k ? 'on' : '', onclick: () => { TON.tarz = TON.tarz === k ? '' : k; drawTon(); } }, (k === '—' ? t('tonNoStyle') : k) + ' · ' + n)),
      h('button', { class: 'az' + (TON.az ? ' on' : ''), onclick: () => { TON.az = !TON.az; drawTon(); } }, 'A–Z')),
    h('div', { class: 'ton-foot' },
      h('button', { class: 'btn', onclick: () => tonPaste() }, '📋 ' + t('tonPaste')),
      h('button', { class: 'btn primary ton-add', onclick: () => tonEdit(null) }, '＋ ' + t('tonAdd')),
      h('button', { class: 'btn ton-lock', title: t('tonLock'), onclick: lockTon }, '🔒')));
  const gk = it => tarzOf(it) || usulOf(it) || '—';
  const items = all.filter(it => !TON.tarz || gk(it) === TON.tarz);
  const byName = (a, b) => S.collator.compare(a.title, b.title);
  let ordered = [];
  const groups = [];
  if (TON.az || TON.tarz) ordered = items.sort(byName);
  else {
    const g = new Map();
    for (const it of items) { const k = gk(it); if (!g.has(k)) g.set(k, []); g.get(k).push(it); }
    for (const [k, arr] of [...g.entries()].sort((a, b) => b[1].length - a[1].length)) { groups.push([k, ordered.length]); ordered.push(...arr.sort(byName)); }
  }
  // sözlerde ‹ › bu listenin sırasıyla gezer (playlist gibi)
  const ctx = { list: ordered.map(tonPath).filter(Boolean), label: '🎼 ' + (SINGERS.find(x => x[0] === TON.singer) || ['', ''])[1] };
  const gi = new Map(groups.map(([k, i]) => [i, k]));
  ordered.forEach((it, i) => {
    if (gi.has(i)) list.append(h('div', { class: 'ton-grp' }, gi.get(i) === '—' ? t('tonNoStyle') : gi.get(i)));
    const p = tonPath(it);
    const sub = [it.artist, it.bpm ? it.bpm + ' BPM' : '', it.not, p ? '' : t('tonNoLyrics')].filter(Boolean).join(' · ');
    const el = h('div', { class: 'ton-row' + (p ? '' : ' nolyr') + (p && p === S.current ? ' active' : ''), role: 'button', tabindex: 0 },
      h('span', { class: 'ico' }, p ? '♪' : '·'),
      h('div', { class: 'n' }, h('b', {}, showTitle(it.title)), sub ? h('small', {}, sub) : ''),
      usulOf(it) ? h('span', { class: 'ton-st usul' }, usulOf(it)) : '',
      tarzOf(it) ? h('span', { class: 'ton-st' }, tarzOf(it)) : '',
      h('span', { class: 'ton-key' + (/hicaz|uşşak|rast|nihavent|kürdi|hüzzam|saba/i.test(it.ton || '') ? ' mk' : '') }, it.ton || '—'));
    addTaps(el, () => { if (p) openSong(p, ctx); else tonEdit(it); }, () => tonEdit(it));
    addLongPress(el, () => tonEdit(it));
    list.append(el);
  });
  if (!ordered.length) list.append(h('p', { class: 'hint', style: 'padding:14px' }, t('tonEmpty')));
}
function tonEdit(it) {
  const isNew = !it;
  const cur = it ? { ...it } : { id: newId(), singer: TON.singer, title: '', artist: '', ton: '', tarz: '', bpm: '', not: '' };
  const titleIn = h('input', { class: 'field', value: cur.title, placeholder: t('songName'), autocapitalize: 'words' });
  const found = h('span', { class: 'ton-found' });
  const upd = () => { const p = tonLink(titleIn.value); found.textContent = p ? '✓ ' + t('tonFound') : ''; };
  titleIn.addEventListener('input', upd); upd();
  const artistIn = h('input', { class: 'field', value: cur.artist, placeholder: t('artist') });
  const tonIn = h('input', { class: 'field ton-in', value: cur.ton, placeholder: 'Re m · Hicaz Si · Do −2' });
  const setTon = fn => { tonIn.value = fn(tonIn.value.trim()).replace(/\s+/g, ' ').trim(); };
  const base = h('div', { class: 'ton-notes' }, ...TON_NOTES.map(n => h('button', { onclick: () => setTon(v => {
    const rest = v.replace(/\b(Do|Re|Mi|Fa|Sol|La|Si)[#♯b♭]?/i, '').trim();
    return /hicaz/i.test(rest) ? 'Hicaz ' + n + ' ' + rest.replace(/hicaz/i, '') : n + ' ' + rest;
  }) }, n)));
  const mods = h('div', { class: 'ton-chips' }, ...[['♯', v => v.replace(/^((?:Hicaz )?(?:Do|Re|Mi|Fa|Sol|La|Si))[♯♭]?/, '$1♯')], ['♭', v => v.replace(/^((?:Hicaz )?(?:Do|Re|Mi|Fa|Sol|La|Si))[♯♭]?/, '$1♭')],
    ['m', v => / m\b/.test(v) ? v.replace(/ m\b/, '') : v.replace(/^((?:Hicaz )?(?:Do|Re|Mi|Fa|Sol|La|Si)[♯♭]?)/, '$1 m')],
    ['Hicaz', v => /hicaz/i.test(v) ? v.replace(/hicaz\s*/i, '') : 'Hicaz ' + v],
    ['−2', v => v.replace(/\s*[+−-]\d\b/, '') + ' −2'], ['−1', v => v.replace(/\s*[+−-]\d\b/, '') + ' −1'], ['+2', v => v.replace(/\s*[+−-]\d\b/, '') + ' +2'], ['+3', v => v.replace(/\s*[+−-]\d\b/, '') + ' +3']]
    .map(([l, fn]) => h('button', { onclick: () => setTon(fn) }, l)));
  const ex = (S.tonBook.extra = S.tonBook.extra || { styles: [], usuls: [] });
  cur.usul = usulOf(cur); cur.tarz = tarzOf(cur);
  // seçmeli düğmeler + "＋" ile kendi tarzını / usulünü ekle (listeye kalıcı eklenir, senkron)
  const chipRow = (vals, curVal, inp, addKey, norm) => {
    const row = h('div', { class: 'ton-chips' });
    const draw = () => row.replaceChildren(...vals().map(v => h('button', { class: inp.value === v ? 'on' : '', onclick: () => { inp.value = inp.value === v ? '' : v; draw(); } }, v)),
      h('button', { class: 'add-chip', onclick: async () => {
        const v = norm((await promptText(t('tonNewChip'), '')) || '').trim(); if (!v) return;
        if (!ex[addKey].includes(v)) { ex[addKey].push(v); S.tonBook.extraUpdated = Date.now(); db.set('tonlar', S.tonBook); scheduleSync(1500); }
        inp.value = v; draw();
      } }, '＋'));
    inp.addEventListener('input', draw); draw();
    return row;
  };
  const usulIn = h('input', { class: 'field', value: cur.usul, placeholder: '9/8' });
  const usulChips = chipRow(() => [...new Set([...TON_USULS, ...ex.usuls, ...tonItems().map(usulOf).filter(Boolean)])], cur.usul, usulIn, 'usuls', normUsul);
  const tarzIn = h('input', { class: 'field', value: cur.tarz, placeholder: t('tonStyle') });
  const tarzChips = chipRow(() => [...new Set([...TON_STYLES, ...ex.styles, ...tonItems().map(tarzOf).filter(Boolean)])], cur.tarz, tarzIn, 'styles', x => x);
  const bpmIn = h('input', { class: 'field', type: 'number', inputmode: 'numeric', value: cur.bpm, placeholder: 'BPM' });
  let taps = [];
  const tap = h('button', { class: 'btn', onclick: () => { const n = performance.now(); taps = taps.filter(x => n - x < 3000); taps.push(n); if (taps.length > 1) bpmIn.value = Math.round(60000 / ((taps[taps.length - 1] - taps[0]) / (taps.length - 1))); } }, 'TAP');
  const notIn = h('input', { class: 'field', value: cur.not || '', placeholder: t('shortNote') });
  let singer = cur.singer;
  const sing = h('div', { class: 'ton-tabs small' }, ...SINGERS.map(([k, l]) => h('button', { class: singer === k ? 'on' : '', onclick: e => { singer = k; for (const b of e.target.parentNode.children) b.classList.toggle('on', b === e.target); } }, l)));
  const save = () => {
    const title = titleIn.value.trim(); if (!title) { toast(t('nameRequired')); titleIn.focus(); return; }
    Object.assign(cur, { title, artist: artistIn.value.trim(), ton: tonIn.value.trim(), usul: normUsul(usulIn.value.trim()), tarz: tarzIn.value.trim(), bpm: bpmIn.value.trim(), not: notIn.value.trim(), singer, p: tonLink(title) || cur.p || null });
    saveTon(cur); toast(t('saved')); openTonDefteri();
  };
  modal(
    h('div', { class: 'modal-head' }, h('button', { class: 'mh-btn', onclick: openTonDefteri }, '‹'), h('h2', {}, (isNew ? '＋ ' : '✎ ') + t('tonTitle')), h('button', { class: 'mh-btn mh-save', onclick: save }, t('save'))),
    sing,
    h('label', { class: 'lab' }, t('songName'), ' ', found), titleIn,
    h('label', { class: 'lab' }, t('artist')), artistIn,
    h('label', { class: 'lab' }, t('ton')), tonIn, base, mods,
    h('label', { class: 'lab' }, t('tonUsul')), usulChips,
    h('label', { class: 'lab' }, t('tonStyle')), tarzChips,
    h('label', { class: 'lab' }, 'BPM'), h('div', { class: 'row' }, bpmIn, tap),
    h('label', { class: 'lab' }, t('shortNote')), notIn,
    h('div', { class: 'btn-row' }, h('button', { class: 'btn primary fix-apply', onclick: save }, '✓ ' + t('save')),
      isNew ? null : h('button', { class: 'btn danger', onclick: async () => { if (await confirmBox(t('tonDelete', { name: cur.title }))) { cur.deleted = true; saveTon(cur); openTonDefteri(); } } }, '🗑 ' + t('delete'))));
  $('modal').classList.add('ton-modal');
  if (isNew) titleIn.focus();
}
function tonPaste() {
  const ta = h('textarea', { class: 'field', rows: 8, placeholder: t('tonPasteHelp') });
  const info = h('p', { class: 'hint' });
  const upd = () => { const r = parsePasted(ta.value); info.textContent = t('tonPasteFound', { n: r.length }); };
  ta.addEventListener('input', upd);
  modal(
    h('div', { class: 'modal-head' }, h('button', { class: 'mh-btn', onclick: openTonDefteri }, '‹'), h('h2', {}, '📋 ' + t('tonPaste') + ' → ' + (SINGERS.find(s => s[0] === TON.singer) || ['', ''])[1])),
    h('p', { class: 'hint' }, t('tonPasteHelp')),
    h('button', { class: 'btn', onclick: async () => { try { ta.value = await navigator.clipboard.readText(); upd(); } catch (_) { ta.focus(); toast(t('pasteManual')); } } }, '📋 ' + t('pasteClipboard')),
    ta, info,
    h('div', { class: 'btn-row' }, h('button', { class: 'btn primary fix-apply', onclick: () => {
      const rows = parsePasted(ta.value); if (!rows.length) return;
      const have = new Set(tonItems(TON.singer).map(x => fold(x.title)));
      let n = 0;
      for (const r of rows) { if (have.has(fold(r.title))) continue; saveTon({ id: newId(), singer: TON.singer, ...r, not: '', p: tonLink(r.title) }); n++; }
      toast(t('tonAdded', { n })); openTonDefteri();
    } }, '✓ ' + t('tonImport'))));
  $('modal').classList.add('ton-modal');
}

async function saveSong(oldPath, newPath, text) {
  const old = oldPath ? S.songs.get(oldPath) : null;
  const target = S.songs.get(newPath);
  const rec = decorate({
    p: newPath, t: text,
    e: old ? old.e : 'utf8', n: old ? old.n : 1,
    s: target ? target.s : (oldPath === newPath && old ? old.s : undefined),
    dirty: true, m: Date.now(),
  });
  if (rec.e === 'ascii' && /[^\x00-\x7f]/.test(text)) rec.e = 'cp1254';
  S.songs.set(newPath, rec);
  await db.putSong(strip(rec));
  if (old && oldPath !== newPath) {
    await removeSong(oldPath);
    replacePathEverywhere(oldPath, newPath);
  }
  if (S.virtualDirs.delete(dirName(newPath))) saveVirtualDirs();
  rebuildIndex(); renderList(); updateSyncDot(); scheduleSync();
}

/** Kayıttan geçici alanları (_ ile başlayan) atar. */
function strip(rec) { const o = {}; for (const k in rec) if (k[0] !== '_') o[k] = rec[k]; return o; }

async function removeSong(p) {
  const rec = S.songs.get(p); if (!rec) return;
  if (rec.s) { rec.del = true; rec.dirty = true; rec.m = Date.now(); await db.putSong(strip(rec)); }
  else { S.songs.delete(p); await db.deleteSongs([p]); }
}

async function deleteSong(p) {
  if (VIEW_ONLY) { toast(t('viewOnly')); return; }
  const rec = S.songs.get(p); if (!rec) return;
  if (!(await confirmBox(t('confirmDelete', { name: rec._title })))) return;
  const L = S.context.list, i = L.indexOf(p);
  await removeSong(p);
  rebuildIndex();
  S.current = null;
  const next = L.slice(i + 1).find(x => S.songs.has(x) && !S.songs.get(x).del);
  if (next) openSong(next); else { $('song').hidden = true; $('empty').hidden = false; setNarrowSong(false); }
  renderList(); updateSyncDot(); scheduleSync();
  toast(t('deleted'));
}

function replacePathEverywhere(a, b) {
  let changed = false;
  if (S.notes.notes[a] && !S.notes.notes[a].deleted) {
    S.notes.notes[b] = { ...S.notes.notes[a], updated: Date.now() };
    S.notes.notes[a] = { deleted: true, updated: Date.now() };
    saveNotes();
  }
  for (const pr of S.programs.programs) {
    const i = pr.items.indexOf(a);
    if (i >= 0) { pr.items[i] = b; pr.updated = Date.now(); changed = true; }
  }
  const fi = S.programs.fav.indexOf(a);
  if (fi >= 0) { S.programs.fav[fi] = b; S.programs.favUpdated = Date.now(); changed = true; }
  S.recent = S.recent.map(x => (x === a ? b : x));
  db.set('recent', S.recent);
  if (changed) savePrograms();
}

// ------------------------------------------------------------------ programlar / favoriler
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function savePrograms() { S.programs.dirty = true; db.set('programs', S.programs); scheduleSync(); }
function touchProgram(pr) { pr.updated = Date.now(); savePrograms(); renderList(); }

function toggleFav(p) {
  const f = S.programs.fav;
  const i = f.indexOf(p);
  if (i >= 0) f.splice(i, 1); else f.push(p);
  S.programs.favUpdated = Date.now();
  savePrograms(); renderSong(); if (S.tab === 'favorites') renderList();
}

async function newProgram() {
  const name = await promptText(t('programName'), '');
  if (!name) return null;
  const pr = { id: uid(), name, items: [], updated: Date.now() };
  S.programs.programs.push(pr);
  savePrograms(); S.programId = pr.id; renderList();
  return pr;
}
async function renameProgram(pr) {
  const name = await promptText(t('programName'), pr.name);
  if (!name) return; pr.name = name; touchProgram(pr);
}
async function deleteProgram(pr) {
  if (!(await confirmBox(t('confirmDeleteProgram', { name: pr.name })))) return;
  pr.deleted = true; pr.items = []; pr.updated = Date.now();
  S.programId = null; savePrograms(); renderList();
}
/** Programların kendi sırası (programlar.json → order, tüm cihazlarda aynı). */
function orderedPrograms() {
  const progs = S.programs.programs.filter(p => !p.deleted);
  const pos = new Map((S.programs.order || []).map((id, i) => [id, i]));
  return progs.map((p, i) => [p, pos.has(p.id) ? pos.get(p.id) : 1e6 + i]).sort((a, b) => a[1] - b[1]).map(x => x[0]);
}
function moveProgram(progs, i, d) {
  const j = i + d; if (j < 0 || j >= progs.length) return;
  const ids = progs.map(p => p.id); [ids[i], ids[j]] = [ids[j], ids[i]];
  S.programs.order = ids; S.programs.orderUpdated = Date.now(); savePrograms(); renderList();
}
function moveInProgram(pr, i, d) {
  const j = i + d; if (j < 0 || j >= pr.items.length) return;
  [pr.items[i], pr.items[j]] = [pr.items[j], pr.items[i]];
  touchProgram(pr);
}
function addToProgramDialog(p) {
  const progs = S.programs.programs.filter(x => !x.deleted);
  const add = pr => {
    if (!pr.items.includes(p)) pr.items.push(p);
    pr.updated = Date.now(); savePrograms(); closeModal(); toast(t('addedTo', { name: pr.name }));
    if (S.tab === 'programs') renderList();
  };
  modal(h('h2', {}, t('addToProgram')),
    h('div', { class: 'pick-list' }, progs.map(pr => h('button', { class: 'item', onclick: () => add(pr) },
      h('span', { class: 'ico' }, '☰'), h('span', { class: 'main' }, h('span', { class: 'name' }, pr.name)), h('span', { class: 'count' }, pr.items.length)))),
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn primary', onclick: async () => { closeModal(); const pr = await newProgram(); if (pr) add(pr); } }, '＋ ' + t('newProgram')),
      h('button', { class: 'btn', onclick: closeModal }, t('cancel'))));
}

function mergePrograms(local, remote) {
  if (!remote) return local;
  const byId = new Map();
  for (const p of remote.programs || []) byId.set(p.id, p);
  for (const p of local.programs) { const r = byId.get(p.id); if (!r || (p.updated || 0) > (r.updated || 0)) byId.set(p.id, p); }
  const fav = (local.favUpdated || 0) >= (remote.favUpdated || 0) ? local.fav : (remote.fav || []);
  const order = (local.orderUpdated || 0) >= (remote.orderUpdated || 0) ? (local.order || []) : (remote.order || []);
  return { format: 1, programs: [...byId.values()], fav, favUpdated: Math.max(local.favUpdated || 0, remote.favUpdated || 0),
    order, orderUpdated: Math.max(local.orderUpdated || 0, remote.orderUpdated || 0) };
}

// ------------------------------------------------------------------ senkronizasyon
function gh() { return new GitHub(S.settings.gh); }
function pendingCount() { let n = 0; for (const s of S.songs.values()) if (s.dirty) n++; return n + (S.programs.dirty ? 1 : 0) + (S.notes.dirty ? 1 : 0); }

function updateSyncDot() {
  const d = $('syncDot');
  d.className = 'sync-dot';
  if (S.sync.busy) d.classList.add('busy');
  else if (S.sync.error) d.classList.add('err');
  else if (pendingCount()) d.classList.add('pending');
  else if (S.sync.last) d.classList.add('ok');
  $('btnSync').title = S.sync.error ? t('syncError', { msg: S.sync.error }) :
    (pendingCount() ? t('pending', { n: pendingCount() }) + ' · ' : '') + t('lastSync', { time: S.sync.last ? new Date(S.sync.last).toLocaleString(getLang()) : t('never') });
}

let syncTimer;
function scheduleSync(delay = 4000) {
  if (!gh().ok) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => { if (navigator.onLine) sync({ quiet: true }); }, delay);
}

async function sync({ quiet = false } = {}) {
  const g = gh();
  if (!g.ok) { openSettings(); return; }
  if (S.sync.busy) return;
  if (!navigator.onLine) { if (!quiet) toast(t('offline')); return; }
  S.sync.busy = true; S.sync.error = ''; updateSyncDot();
  try {
    // 1) Paketi çek ve birleştir (önce çekmek: içe aktarılmış aynı dosyalar gereksiz yere gönderilmez)
    const st = await g.stat('bundle/repertuar.json.gz');
    if (st && st.sha !== S.sync.bundleSha) {
      if (!quiet || !S.sync.bundleSha) toast(t('downloading'));
      const bundle = await g.fetchBundle(() => { if (!quiet) toast(t('unpacking')); });
      await mergeBundle(bundle);
      S.sync.bundleSha = st.sha;
      await db.set('bundleSha', st.sha);
    }
    // 1b) Türkçe harf sözlüğü (🔤 Düzelt) — hata olursa senkron durmaz
    try { await refreshLexicon(g); } catch (e) { console.warn('sözlük', e); }
    // 2) Yerel değişiklikleri gönder
    const dirty = [...S.songs.values()].filter(s => s.dirty);
    if (dirty.length > 50 && !quiet && !(await confirmBox(t('pushConfirm', { n: dirty.length })))) dirty.length = 0;
    if (dirty.length > 50 && quiet) dirty.length = 0;
    let done = 0;
    for (const rec of dirty) {
      const path = 'repertuar/' + rec.p;
      if (rec.del) {
        await g.deleteFile(path, `Silindi: ${rec.p}`, rec.s);
        S.songs.delete(rec.p); await db.deleteSongs([rec.p]);
      } else {
        const { bytes, enc } = songToBytes(rec);
        rec.e = enc;
        const sha = await g.putFile(path, bytes, `${rec.s ? 'Güncellendi' : 'Eklendi'}: ${rec.p}`, rec.s);
        rec.s = sha; rec.dirty = false; rec.up = sha; rec.upAt = Date.now();
        await db.putSong(strip(rec));
      }
      done++;
      if (!quiet && dirty.length > 3) toast(`⟳ ${done}/${dirty.length}`);
    }
    // 3) Programlar
    const { data, sha } = await g.getJson('programlar.json');
    const merged = mergePrograms(S.programs, data);
    const changed = JSON.stringify(stripPrograms(merged)) !== JSON.stringify(stripPrograms(data || { programs: [], fav: [] }));
    S.programs = merged;
    if (changed) {
      const bytes = new TextEncoder().encode(JSON.stringify(stripPrograms(merged), null, 1));
      await g.putFile('programlar.json', bytes, 'Programlar güncellendi', sha || undefined);
    }
    S.programs.dirty = false;
    await db.set('programs', S.programs);
    // 4) Şarkı notları (solist, ton, kısa not)
    {
      const { data: nd, sha: nsha } = await g.getJson('notlar.json');
      const mergedN = mergeNotes(S.notes, nd);
      const changedN = JSON.stringify(mergedN.notes) !== JSON.stringify((nd && nd.notes) || {});
      S.notes = mergedN;
      if (changedN) await g.putFile('notlar.json', new TextEncoder().encode(JSON.stringify(mergedN, null, 1)), 'Şarkı notları güncellendi', nsha || undefined);
      S.notes.dirty = false;
      await db.set('notes', S.notes);
    }
    // 4a0) 🎼 Ton Defteri (öğe başına birleşim)
    try {
      const { data: td, sha: tsha } = await g.getJson('tonlar.json');
      const merged = mergeBooks(S.tonBook || emptyBook(), td);
      if (JSON.stringify(merged) !== JSON.stringify(td ? { format: 1, items: td.items || {}, extra: { styles: (td.extra || {}).styles || [], usuls: (td.extra || {}).usuls || [] } } : null) && Object.keys(merged.items).length)
        await g.putFile('tonlar.json', new TextEncoder().encode(JSON.stringify(merged, null, 1)), 'Ton defteri güncellendi', tsha || undefined);
      S.tonBook = merged; await db.set('tonlar', merged);
      drawTon();
    } catch (e) { console.warn('ton defteri', e); }
    // 4a) Kişisel Türkçe harf seçimleri (birleşim)
    try {
      const { data: kd, sha: ksha } = await g.getJson('kisisel-sozluk.json');
      const mine = S.pers || { acc: {}, rej: [] };
      const acc = { ...((kd && kd.acc) || {}), ...mine.acc };
      const rej = [...new Set([...((kd && kd.rej) || []), ...(mine.rej || [])])];
      const merged = { format: 1, acc, rej };
      const changedK = JSON.stringify(merged) !== JSON.stringify({ format: 1, acc: (kd && kd.acc) || {}, rej: (kd && kd.rej) || [] });
      if (changedK && (mine.dirty || !kd)) await g.putFile('kisisel-sozluk.json', new TextEncoder().encode(JSON.stringify(merged, null, 1)), 'Kişisel Türkçe sözlük güncellendi', ksha || undefined);
      S.pers = { acc, rej, updated: Date.now() };
      await db.set('pers', S.pers);
    } catch (e) { console.warn('kişisel sözlük', e); }
    // 4b) Sıralama (klasör başına, son değişen kazanır)
    {
      const { data: od, sha: osha } = await g.getJson('siralama.json');
      const remote = (od && od.order) || {}, out = { ...remote };
      for (const [d, v] of Object.entries(S.order.order || {})) if (!out[d] || (v.updated || 0) > (out[d].updated || 0)) out[d] = v;
      const changedO = JSON.stringify(out) !== JSON.stringify(remote);
      S.order = { format: 1, order: out };
      if (changedO) await g.putFile('siralama.json', new TextEncoder().encode(JSON.stringify(S.order, null, 1)), 'Sıralama güncellendi', osha || undefined);
      await db.set('order', S.order);
    }
    // 5) Görünüm (tema, düğme boyutu…) — tüm cihazlarda aynı
    {
      const { data: gd, sha: gsha } = await g.getJson('gorunum.json');
      const mine = S.settings.look || null;
      if (gd && gd.look && (!mine || (gd.look.updated || 0) > (mine.updated || 0))) {
        S.settings.look = gd.look; if (gd.look.font) S.settings.font = gd.look.font;
        saveSettings(); applyLook(); document.documentElement.style.setProperty('--lyrics-size', S.settings.font + 'px');
        renderList(); if (S.current && !$('song').hidden) renderSong();
      } else if (mine && mine.updated && (!gd || (mine.updated || 0) > ((gd.look || {}).updated || 0))) {
        await g.putFile('gorunum.json', new TextEncoder().encode(JSON.stringify({ format: 1, look: mine }, null, 1)), 'Görünüm güncellendi', gsha || undefined);
      }
      S.lookDirty = false;
    }
    S.sync.last = Date.now();
    await db.set('lastSync', S.sync.last);
    if (!quiet) toast(t('syncDone'));
  } catch (e) {
    console.error(e);
    S.sync.error = e.message || String(e);
    if (!quiet || !S.sync.last) toast(t('syncError', { msg: S.sync.error }));
  } finally {
    S.sync.busy = false;
    rebuildIndex(); renderList(); updateSyncDot();
    if (S.current) { if (S.songs.has(S.current) && $('editor').hidden) renderSong(); }
    else if ($('editor').hidden) renderEmpty();
  }
}
function stripPrograms(p) { return { format: 1, programs: p.programs || [], fav: p.fav || [], favUpdated: p.favUpdated || 0, order: p.order || [], orderUpdated: p.orderUpdated || 0 }; }

/** Paket ile yerel veriyi birleştir. Kural: gönderilmemiş yerel değişiklik her zaman korunur. */
async function mergeBundle(bundle) {
  const remote = new Map(bundle.files.map(f => [f.p, f]));
  const puts = [], dels = [];
  const RECENT = 15 * 60 * 1000; // gönderilen dosya için paketin yetişme süresi
  for (const [p, loc] of S.songs) {
    const r = remote.get(p);
    if (loc.dirty) {
      if (r && !loc.del && r.t === loc.t) { Object.assign(loc, { s: r.s, dirty: false }); puts.push(loc); }   // aynı içerik
      else if (r && loc.s !== r.s && !loc.del) { loc.s = r.s; puts.push(loc); }                                // üzerine yazılacak sürüm
      continue;
    }
    if (loc.up && (!r || r.s !== loc.up) && Date.now() - (loc.upAt || 0) < RECENT) continue; // paket henüz güncellenmemiş
    if (!r) { S.songs.delete(p); dels.push(p); continue; }
    if (r.s !== loc.s || loc.up) {
      const rec = decorate({ p, t: r.t, e: r.e, n: r.n || 0, s: r.s, m: Date.now() });
      S.songs.set(p, rec); puts.push(rec);
    }
  }
  for (const [p, r] of remote) {
    if (S.songs.has(p)) continue;
    if (S.removed[p] && Date.now() - S.removed[p] < REMOVED_TTL) continue;   // az önce taşındı/silindi
    const rec = decorate({ p, t: r.t, e: r.e, n: r.n || 0, s: r.s, m: Date.now() });
    S.songs.set(p, rec); puts.push(rec);
  }
  if (dels.length) await db.deleteSongs(dels);
  for (let i = 0; i < puts.length; i += 2000) await db.putSongs(puts.slice(i, i + 2000).map(strip));
}

// ------------------------------------------------------------------ içe / dışa aktarma
function commonTop(names) {
  const firsts = new Set(names.map(n => n.split('/')[0]));
  return firsts.size === 1 && names.every(n => n.includes('/')) ? [...firsts][0] + '/' : '';
}

/** ZIP/klasördeki ortak üst klasör atılsın mı? Sadece repertuvarın kendisiyse ("Repertuar KUZEY 2019",
 *  dışa aktarılan "Repertuar/") veya kullanıcı zaten o klasörün içindeyse. Aksi halde klasör korunur:
 *  "2.Slov Fantazi Tsm.zip" kökte içe aktarılınca "2.Slov Fantazi Tsm/…" olarak gelir. */
function importPrefixToDrop(names) {
  const top = commonTop(names);
  if (!top) return '';
  const name = top.slice(0, -1).trim();
  if (/^repertuar/i.test(name)) return top;
  if (S.dir && fold(name) === fold(baseName(S.dir))) return top;
  return '';
}

async function importEntries(entries) {   // [{ name: 'klasör/dosya.txt', bytes }]
  if (VIEW_ONLY) { toast(t('viewOnly')); return; }
  entries = entries.filter(e => /\.txt$/i.test(e.name) && !e.name.split('/').some(x => x.startsWith('__MACOSX') || x.startsWith('.')));
  const top = importPrefixToDrop(entries.map(e => e.name));
  let added = 0, same = 0;
  const puts = [];
  for (const e of entries) {
    const rel = e.name.slice(top.length);
    const p = (S.dir ? S.dir + '/' : '') + rel;
    const song = bytesToSong(e.bytes);
    const ex = S.songs.get(p);
    if (ex && !ex.del && ex.t === song.t) { same++; continue; }
    const rec = decorate({ p, ...song, s: ex ? ex.s : undefined, dirty: true, m: Date.now() });
    S.songs.set(p, rec); puts.push(strip(rec)); added++;
  }
  for (let i = 0; i < puts.length; i += 2000) await db.putSongs(puts.slice(i, i + 2000));
  rebuildIndex();
  // içe aktarılan klasöre git, kullanıcı nereye geldiğini görsün
  const firstDir = puts.length ? dirName(puts[0].p).split('/').slice(0, (S.dir ? S.dir.split('/').length : 0) + 1).join('/') : '';
  if (firstDir && firstDir !== S.dir && S.dirs.has(firstDir) && S.tab === 'library' && !$('q').value) goDir(firstDir); else renderList();
  updateSyncDot();
  toast(t('imported', { n: added, s: same }));
  if (added && added <= 50) scheduleSync();
  if (!S.current) renderEmpty();
}

async function importFiles(fileList, useRelative) {
  toast(t('working'));
  const entries = [];
  for (const f of fileList) {
    const name = useRelative && f.webkitRelativePath ? f.webkitRelativePath : f.name;
    if (!/\.txt$/i.test(name)) continue;
    entries.push({ name: name.replace(/\\/g, '/'), bytes: new Uint8Array(await f.arrayBuffer()) });
  }
  await importEntries(entries);
}

// ------------------------------------------------------------------ 📄 PDF / Word içe aktar
function pickDocuments() {
  if (VIEW_ONLY) { toast(t('viewOnly')); return; }
  const inp = h('input', { type: 'file', accept: '.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document', multiple: true });
  inp.onchange = () => { if (inp.files.length) importDocuments([...inp.files]); };
  inp.click();
}
async function importDocuments(files) {
  const bad = files.filter(f => /\.doc$/i.test(f.name));
  if (bad.length) toast(t('docOld'));
  files = files.filter(f => /\.(pdf|docx)$/i.test(f.name));
  if (!files.length) return;
  toast(t('docReading', { n: files.length }));
  const { parseDocument } = await import('./belge.js');
  const docs = [];
  for (const f of files) {
    try {
      const r = await parseDocument(f);
      docs.push({ name: f.name, folder: r.folder, songs: r.songs.map(x => ({ ...x, on: true })) });
    } catch (e) { console.error(e); toast(f.name + ': ' + t('docFail')); }
  }
  if (!docs.length) return;
  const exists = title => (S.titleIndex.get(fold(title).replace(/[^a-z0-9]+/g, '')) || []).filter(p => S.songs.has(p) && !S.songs.get(p).del);
  const body = h('div', { class: 'doc-list' });
  const count = h('b', {});
  const recount = () => { const n = docs.reduce((a, d) => a + d.songs.filter(x => x.on).length, 0); count.textContent = t('docSelected', { n }); };
  for (const d of docs) {
    const fIn = h('input', { class: 'field doc-folder', value: d.folder, oninput: () => { d.folder = fIn.value; } });
    const list = h('div', { class: 'doc-songs' }, ...d.songs.map(x => {
      const ex = exists(x.title);
      const cb = h('input', { type: 'checkbox', checked: true, onchange: () => { x.on = cb.checked; recount(); } });
      const tIn = h('input', { class: 'doc-title', value: x.title, oninput: () => { x.title = tIn.value; } });
      const prev = h('pre', { class: 'doc-prev', hidden: true }, x.text);
      return h('div', { class: 'doc-song' + (ex.length ? ' exists' : '') },
        h('div', { class: 'doc-row' }, cb, tIn,
          ex.length ? h('span', { class: 'doc-badge', title: ex.join('\n') }, t('docExists', { n: ex.length })) : null,
          h('button', { class: 'small-btn', onclick: () => { prev.hidden = !prev.hidden; } }, '👁')),
        h('div', { class: 'doc-first' }, x.text.split('\n').filter(l => l.trim()).slice(0, 2).join(' / ')),
        prev);
    }));
    body.append(h('div', { class: 'doc-file' },
      h('div', { class: 'doc-fname' }, '📄 ' + d.name + ' · ' + t('songs', { n: d.songs.length })),
      h('label', { class: 'lab' }, '📁 ' + t('folder')), fIn, list));
  }
  recount();
  const save = async () => {
    const changes = [], add = [], orders = new Map();
    const used = new Set();
    for (const d of docs) {
      const dir = d.folder.split('/').map(x => x.replace(/[\\:*?"<>|]/g, '').trim()).filter(Boolean).join('/');
      for (const x of d.songs.filter(x => x.on)) {
        const name = x.title.replace(/[\\/:*?"<>|]/g, '').trim(); if (!name) continue;
        let p = (dir ? dir + '/' : '') + name + '.txt', i = 2;
        while ((S.songs.has(p) && !S.songs.get(p).del) || used.has(p)) p = (dir ? dir + '/' : '') + `${name} (${i++}).txt`;
        used.add(p);
        if (!orders.has(dir)) orders.set(dir, []); orders.get(dir).push(baseName(p));
        const text = x.text.replace(/\r\n?/g, '\n') + '\n';
        const { bytes, enc } = songToBytes({ t: text, e: 'utf8', n: 1 });
        changes.push({ path: 'repertuar/' + p, bytes });
        add.push({ p, text, enc, bytes });
      }
    }
    if (!add.length) return;
    if (!(await commitFolderChange([], changes, `PDF/Word içe aktarıldı: ${add.length} şarkı (${docs.map(d => d.name).join(', ').slice(0, 120)})`))) return;
    const ok = gh().ok, puts = [];
    for (const a of add) {
      const sha = await gitBlobSha(a.bytes);
      const rec = decorate({ p: a.p, t: a.text, e: a.enc, n: 1, s: ok ? sha : undefined, dirty: !ok, m: Date.now(), ...(ok ? { up: sha, upAt: Date.now() } : {}) });
      S.songs.set(a.p, rec); puts.push(strip(rec));
    }
    await db.putSongs(puts);
    // PDF'deki sıra korunur: klasörün kendi sırası (siralama.json) PDF sırasıyla yazılır
    for (const [dir, names] of orders) {
      const prev = ((S.order.order[dir] || {}).names || []).filter(n => !names.includes(n));
      S.order.order[dir] = { names: [...prev, ...names], updated: Date.now() };
    }
    saveOrder();
    closeModal(); rebuildIndex();
    const first = dirName(add[0].p);
    goDir(first); scheduleSync(800);
    toast(t('docSaved', { n: add.length }));
  };
  modal(
    h('div', { class: 'modal-head' }, h('h2', {}, '📄 ' + t('importDoc')), h('button', { class: 'mh-btn', onclick: closeModal }, '✕')),
    h('p', { class: 'hint' }, t('docHelp')),
    body,
    h('div', { class: 'btn-row' }, h('button', { class: 'btn primary fix-apply', onclick: save }, '✓ ', count), h('button', { class: 'btn', onclick: closeModal }, t('cancel'))),
  );
}

async function importZip(file) {
  toast(t('unpacking'));
  try {
    const entries = await readZip(await file.arrayBuffer(), n => /\.txt$/i.test(n));
    await importEntries(entries);
  } catch (e) { toast('ZIP: ' + e.message); }
}

function exportZip() {
  const files = visibleSongs().map(r => ({ name: 'Repertuar/' + r.p, bytes: songToBytes(r).bytes }));
  const blob = writeZip(files);
  const a = h('a', { href: URL.createObjectURL(blob), download: `Muzik-Defteri-${new Date().toISOString().slice(0, 10)}.zip` });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}

// ------------------------------------------------------------------ modal yardımcıları
function modal(...kids) { $('modal').classList.remove('sheet'); $('modalCard').replaceChildren(...kids.filter(Boolean)); $('modal').hidden = false; }
function closeModal() { $('modal').hidden = true; $('modal').onclick = null; $('modal').classList.remove('sheet'); $('modalCard').replaceChildren(); }
function promptText(title, value) {
  return new Promise(res => {
    const inp = h('input', { class: 'field', value });
    const ok = () => { const v = inp.value.trim(); closeModal(); res(v || null); };
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') ok(); if (e.key === 'Escape') { closeModal(); res(null); } });
    modal(h('h2', {}, title), inp, h('div', { class: 'btn-row' },
      h('button', { class: 'btn primary', onclick: ok }, 'OK'),
      h('button', { class: 'btn', onclick: () => { closeModal(); res(null); } }, t('cancel'))));
    setTimeout(() => { inp.focus(); inp.select(); }, 30);
  });
}
function confirmBox(text) {
  return new Promise(res => {
    modal(h('p', { style: 'font-size:15px;color:var(--text)' }, text), h('div', { class: 'btn-row' },
      h('button', { class: 'btn primary', onclick: () => { closeModal(); res(true); } }, 'OK'),
      h('button', { class: 'btn', onclick: () => { closeModal(); res(false); } }, t('cancel'))));
  });
}

// ------------------------------------------------------------------ ayarlar
let installEvt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; });

async function openSettings() {
  const g = S.settings.gh;
  const f = {
    owner: h('input', { class: 'field', value: g.owner, placeholder: 'HAKANO45', autocapitalize: 'off' }),
    repo: h('input', { class: 'field', value: g.repo, placeholder: '-Muzik-Defteri-Repertuar', autocapitalize: 'off' }),
    branch: h('input', { class: 'field', value: g.branch || 'main', autocapitalize: 'off' }),
    token: h('input', { class: 'field', type: 'password', value: g.token, placeholder: 'github_pat_…', autocomplete: 'off', autocapitalize: 'off' }),
  };
  const status = h('div', { class: 'status' });
  const readGh = async () => {
    S.settings.gh = { owner: f.owner.value.trim(), repo: f.repo.value.trim(),
      branch: f.branch.value.trim() || 'main', token: f.token.value.trim() };
    const ok = await saveSettings();
    if (!ok) { status.className = 'status err'; status.textContent = t('settingsSaveError'); }
    return ok;
  };
  // iPhone'da uygulama arka plana atılsa bile token ilk yazıldığı anda yerel yedeğe girer.
  for (const field of Object.values(f)) field.addEventListener('input', () => { readGh(); });
  const test = async () => {
    if (!(await readGh())) return;
    status.className = 'status'; status.textContent = t('working');
    try {
      const r = await gh().testAccess();
      status.className = 'status ok';
      status.textContent = t('connOk', { vis: r.private ? t('private') : t('public'), perm: r.canPush ? t('canWrite') : t('readOnly') });
      if (!r.private) { status.className = 'status err'; status.textContent += ' — ' + t('notPrivateWarn'); }
    } catch (e) { status.className = 'status err'; status.textContent = e.message; }
  };
  let storageTxt = '';
  try {
    const est = await navigator.storage.estimate();
    const persisted = navigator.storage.persisted ? await navigator.storage.persisted() : false;
    storageTxt = t('storage', { used: (est.usage / 1048576).toFixed(1) + ' MB' }) + ' · ' + (persisted ? t('persistOk') : t('persistNo'));
  } catch (_) {}
  const langSel = h('select', { class: 'field', onchange: e => { setLang(e.target.value); applyLang(); closeModal(); openSettings(); } },
    h('option', { value: 'tr', selected: getLang() === 'tr' }, 'Türkçe'), h('option', { value: 'en', selected: getLang() === 'en' }, 'English'));
  const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  modal(
    // her zaman görünen başlık: ✕ Kapat ve ⌂ Ana sayfa (uzun sayfayı aşağı kaydırmadan çıkış)
    h('div', { class: 'modal-head' },
      h('button', { class: 'mh-btn mh-home', title: t('root'), onclick: async () => { if (await readGh()) { closeModal(); goHome(); } } }, '⌂'),
      h('h2', {}, '⚙ ' + t('settings')),
      h('button', { class: 'mh-btn', title: t('close'), onclick: async () => { if (await readGh()) { closeModal(); toast(t('settingsSaved')); } } }, '✕')),
    h('div', { class: 'btn-row' }, h('button', { class: 'btn primary', onclick: () => { closeModal(); openAppearance(); } }, '🎨 ' + t('appearance')),
      VIEW_ONLY ? null : h('button', { class: 'btn ton-set', onclick: () => openOrganizer() }, '🧹 ' + t('orgTitle')),
      S.tonOpen ? h('button', { class: 'btn ton-set', onclick: () => { closeModal(); lockTon(); } }, '🔒 ' + t('tonHide'))
                : h('button', { class: 'btn ton-set', onclick: () => { openTonDefteri(); } }, '🎼 ' + t('tonShow'))),
    h('label', {}, t('language')), langSel,
    h('h3', {}, t('github')),
    h('div', { class: 'grid2' }, h('div', {}, h('label', {}, t('owner')), f.owner), h('div', {}, h('label', {}, t('repo')), f.repo)),
    h('div', { class: 'grid2' }, h('div', {}, h('label', {}, t('branch')), f.branch), h('div', {}, h('label', {}, t('token')), f.token)),
    h('p', {}, t('tokenHelp')),
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn', onclick: test }, t('testConn')),
      h('button', { class: 'btn primary', onclick: async () => { if (!(await readGh())) return; closeModal(); sync(); } }, '⟳ ' + t('sync'))),
    status,
    h('p', {}, (pendingCount() ? t('pending', { n: pendingCount() }) + ' · ' : '') + t('lastSync', { time: S.sync.last ? new Date(S.sync.last).toLocaleString(getLang()) : t('never') })),
    VIEW_ONLY ? null : missingLettersBox(),
    h('h3', {}, t('importExport')),
    h('p', {}, t('importTarget', { f: S.dir || t('root') })),
    VIEW_ONLY ? h('p', {}, t('viewOnly')) : null,
    h('div', { class: 'btn-row' },
      VIEW_ONLY ? null : h('button', { class: 'btn', onclick: () => { closeModal(); $('fileZip').click(); } }, t('importZip')),
      VIEW_ONLY ? null : h('button', { class: 'btn', onclick: () => { closeModal(); $('fileTxt').click(); } }, t('importTxt')),
      VIEW_ONLY ? null : h('button', { class: 'btn primary', onclick: () => { closeModal(); pickDocuments(); } }, '📄 ' + t('importDoc')),
      VIEW_ONLY || isIos ? null : h('button', { class: 'btn', onclick: () => { closeModal(); $('fileDir').click(); } }, t('importFolder')),
      h('button', { class: 'btn', onclick: () => { closeModal(); exportZip(); } }, t('exportZip'))),
    h('h3', {}, t('install')),
    standalone ? h('p', {}, '✓') : installEvt ? h('div', { class: 'btn-row' }, h('button', { class: 'btn primary', onclick: async () => { installEvt.prompt(); installEvt = null; closeModal(); } }, t('install'))) : h('p', {}, isIos ? t('installIos') : 'Edge/Chrome: ⋯ → ' + t('install')),
    h('p', {}, t('keyboardHelp')),
    h('h3', {}, t('danger')),
    h('p', {}, storageTxt),
    h('div', { class: 'btn-row' }, h('button', { class: 'btn danger', onclick: clearLocal }, t('clearLocal'))),
    h('p', {}, t('version') + ' ' + VERSION),
    h('div', { class: 'btn-row' }, h('button', { class: 'btn', onclick: async () => { if (await readGh()) { closeModal(); toast(t('settingsSaved')); } } }, t('close'))),
  );
}

async function clearLocal() {
  if (!(await confirmBox(t('confirmClear')))) return;
  await db.clearSongs(); await db.del('bundleSha');
  S.songs.clear(); S.sync.bundleSha = ''; S.current = null;
  rebuildIndex(); closeModal(); renderList(); renderEmpty(); updateSyncDot();
}

function saveSettings() {
  return persistSettingsReliably(S.settings).catch(e => {
    console.error('Could not save settings:', e);
    toast(t('settingsSaveError'));
    return false;
  });
}

// ------------------------------------------------------------------ boş ekran / dil
function renderEmpty() {
  $('song').hidden = true; $('empty').hidden = false;
  const box = $('emptyText'); box.replaceChildren();
  if (S.songs.size) {
    box.append(h('div', {}, t('songs', { n: visibleSongs().length })), h('p', { class: 'hint' }, t('keyboardHelp')));
    return;
  }
  box.append(h('h2', { style: 'color:var(--gold)' }, t('welcomeTitle')), h('p', {}, t('welcomeText')),
    h('div', { class: 'btn-row' }, h('button', { class: 'btn primary', onclick: openSettings }, t('connectGithub'))),
    VIEW_ONLY ? null : h('p', { class: 'hint', style: 'margin-top:18px' }, t('orLocal')),
    VIEW_ONLY ? null : h('div', { class: 'btn-row' },
      h('button', { class: 'btn', onclick: () => $('fileZip').click() }, t('importZip')),
      h('button', { class: 'btn', onclick: () => $('fileTxt').click() }, t('importTxt'))));
}

function applyLang() {
  document.documentElement.lang = getLang();
  $('btnLang').textContent = getLang().toUpperCase();
  $('brandName').textContent = t('appName');
  $('q').placeholder = t('search');
  $('qTextLabel').textContent = t('searchIn');
  $('btnSettings').title = t('settings');
  $('btnBack').setAttribute('aria-label', t('back'));
  renderList();
  if (S.current && !$('song').hidden) renderSong(); else if ($('editor').hidden) renderEmpty();
  updateSyncDot();
}

// ------------------------------------------------------------------ görünüm (tema, düğme boyutu, düzen) — tüm cihazlara senkron
const LOOK_DEFAULT = { theme: 'gold', ui: 1, meta: true, tags: true, phoneClock: false, font: 22, caseFolder: 'asis', caseSong: 'asis', caseLyrics: 'asis', updated: 0 };
const THEMES = [
  ['gold', 'themeGold', ['#0b0b0b', '#d4af37', '#f2ead3']],
  ['bw', 'themeBw', ['#000000', '#ffffff', '#8a8a8a']],
  ['light', 'themeLight', ['#fbfaf7', '#9a7414', '#15130e']],
  ['navy', 'themeNavy', ['#0a1020', '#d4af37', '#eef2fb']],
  ['red', 'themeRed', ['#0d0606', '#e0b44a', '#f6ece6']],
];
function look() { return { ...LOOK_DEFAULT, ...(S.settings.look || {}) }; }
/** Yazım: sadece görünüş (dosyalar değişmez). Türkçe kurala göre i/İ, ı/I. */
function caseText(x, mode) {
  if (!x || !mode || mode === 'asis') return x;
  if (mode === 'upper') return x.toLocaleUpperCase('tr');
  const low = x.toLocaleLowerCase('tr');
  if (mode === 'title') return low.replace(/(^|[\s\-–(\/.,"'“])(\p{L})/gu, (m, a, c) => a + c.toLocaleUpperCase('tr'));
  if (mode === 'sentence') return low.replace(/^(\s*)(\p{L})/u, (m, a, c) => a + c.toLocaleUpperCase('tr'));
  return x;
}
function showTitle(x) { return caseText(x, look().caseSong); }
function showFolder(x) { return caseText(x, look().caseFolder); }
function applyLook(L = look()) {
  const r = document.documentElement;
  if (L.theme && L.theme !== 'gold') r.dataset.theme = L.theme; else delete r.dataset.theme;
  r.style.setProperty('--ui', L.ui || 1);
  r.classList.toggle('hide-meta', !L.meta);
  r.classList.toggle('hide-tags', !L.tags);
  r.classList.toggle('show-clock', !!L.phoneClock);
  const tc = { gold: '#0b0b0b', bw: '#000000', light: '#fbfaf7', navy: '#0a1020', red: '#0d0606' }[L.theme] || '#0b0b0b';
  const m = document.querySelector('meta[name=theme-color]'); if (m) m.setAttribute('content', tc);
}
function openAppearance() {
  const before = look();
  const L = { ...before };
  const seg = (opts, key, onChange) => h('div', { class: 'seg' }, ...opts.map(([v, label]) => h('button', {
    class: L[key] === v ? 'on' : '', onclick: e => { L[key] = v; for (const b of e.target.parentNode.children) b.classList.remove('on'); e.target.classList.add('on'); applyLook(L); onChange && onChange(v); } }, label)));
  const sw = h('div', { class: 'theme-row' }, ...THEMES.map(([id, label, cols]) => h('button', {
    class: 'theme-sw' + (L.theme === id ? ' on' : ''), style: `background:${cols[0]};color:${cols[2]}`,
    onclick: e => { L.theme = id; for (const b of sw.children) b.classList.remove('on'); e.currentTarget.classList.add('on'); applyLook(L); } },
    h('div', { class: 'sw-bar' }, ...cols.map(c => h('i', { style: `background:${c};border:1px solid ${cols[1]}` }))), h('b', {}, t(label)))));
  const prevBox = h('div', { class: 'case-prev' });
  const casePrev = () => {
    const sample = [['📁', 'caseFolder', '9-8 Roman', 0], ['📁', 'caseFolder', 'EGE YÖRESI', 1], ['♪', 'caseSong', 'Abe kaynana neyap', 2], ['♪', 'caseSong', 'KARA GÖZLÜ CİNGENEM', 2], ['♪', 'caseSong', 'iC iC KUDUR', 2]];
    prevBox.replaceChildren(...sample.map(([i, k, x, lv]) => h('div', { class: 'case-row', style: `padding-left:${lv * 22 + 6}px` }, i + ' ' + caseText(x, L[k]))),
      h('div', { class: 'case-row lyr' }, caseText('Sevenleri sevdiğine vermezler', L.caseLyrics)));
  };
  casePrev();
  const cancel = () => { applyLook(before); document.documentElement.style.setProperty('--lyrics-size', S.settings.font + 'px'); closeModal(); };
  const save = () => {
    S.settings.look = { ...L, updated: Date.now() };
    S.settings.font = L.font; document.documentElement.style.setProperty('--lyrics-size', L.font + 'px');
    S.lookDirty = true; saveSettings(); applyLook(); closeModal(); scheduleSync(500); toast(t('lookSaved'));
    renderList(); if (S.current && !$('song').hidden) renderSong(); if (!$('stage').hidden) renderStage();
  };
  modal(h('div', { class: 'modal-head' }, h('h2', {}, '🎨 ' + t('appearance')),
      h('button', { class: 'mh-btn mh-save', onclick: () => save() }, t('save')),
      h('button', { class: 'mh-btn', title: t('cancel'), onclick: () => cancel() }, '✕')),
    h('h3', {}, t('theme')), sw,
    h('h3', {}, t('buttonSize')), seg([[0.85, t('sizeS')], [1, t('sizeM')], [1.2, t('sizeL')], [1.4, t('sizeXL')]], 'ui'),
    h('h3', {}, t('lyricsSize')), seg([[18, 'A'], [22, 'A+'], [28, 'A++'], [34, 'A+++']], 'font', v => document.documentElement.style.setProperty('--lyrics-size', v + 'px')),
    h('h3', {}, t('layout')),
    h('label', {}, t('infoLine')), seg([[true, t('show')], [false, t('hide')]], 'meta'),
    h('label', {}, t('tagsLabel')), seg([[true, t('show')], [false, t('hide')]], 'tags'),
    h('label', {}, t('phoneTop')), seg([[false, 'HAKANO REPERTUVAR'], [true, t('clockWord')]], 'phoneClock'),
    h('h3', {}, t('caseTitle')),
    h('label', {}, t('caseFolder')), seg([['asis', t('caseAsIs')], ['upper', t('caseUpper')], ['title', t('caseTitleCase')]], 'caseFolder', () => casePrev()),
    h('label', {}, t('caseSong')), seg([['asis', t('caseAsIs')], ['upper', t('caseUpper')], ['title', t('caseTitleCase')]], 'caseSong', () => casePrev()),
    h('label', {}, t('caseLyrics')), seg([['asis', t('caseAsIs')], ['upper', t('caseUpper')], ['sentence', t('caseSentence')]], 'caseLyrics', () => casePrev()),
    prevBox, h('p', { class: 'case-note' }, t('caseNote')),
    h('p', {}, t('lookSyncNote')),
    h('div', { class: 'btn-row' }, h('button', { class: 'btn primary', onclick: save }, t('save')), h('button', { class: 'btn', onclick: cancel }, t('cancel'))));
  $('modal').onclick = e => { if (e.target === $('modal')) cancel(); };
}

// ------------------------------------------------------------------ paneller: genişlik, gizle, liste boyu, araç çubuğu
function applyPanels() {
  const st = S.settings;
  document.documentElement.style.setProperty('--side-w', (st.sideW || 340) + 'px');
  document.documentElement.style.setProperty('--list-size', (st.listSize || 15) + 'px');
  $('layout').classList.toggle('side-hidden', !!st.sideHidden);
  $('btnPanel').classList.toggle('on', !st.sideHidden);
  $('viewer').classList.toggle('compact', !!st.compact);
  $('unfoldBtn').hidden = !st.compact || $('song').hidden;
  $('listSize').replaceChildren(t('listSizeLabel'),
    h('button', { class: 'small-btn', onclick: () => setListSize(-1) }, 'a−'),
    h('span', {}, (st.listSize || 15) + ''),
    h('button', { class: 'small-btn', onclick: () => setListSize(1) }, 'a+'),
    h('span', { class: 'spacer', style: 'flex:1' }),
    h('button', { class: 'small-btn', title: t('togglePanel'), onclick: () => togglePanel() }, '⇤'));
}
function setListSize(d) { S.settings.listSize = Math.max(11, Math.min(26, (S.settings.listSize || 15) + d)); saveSettings(); applyPanels(); }
function togglePanel(force) { S.settings.sideHidden = force !== undefined ? force : !S.settings.sideHidden; saveSettings(); applyPanels(); }
function setCompact(on) { S.settings.compact = on; saveSettings(); applyPanels(); }
function bindSplitter() {
  const sp = $('splitter');
  let startX = 0, startW = 0, dragging = false;
  const move = e => {
    if (!dragging) return;
    const x = (e.touches ? e.touches[0].clientX : e.clientX);
    const max = Math.max(260, window.innerWidth * 0.6);
    S.settings.sideW = Math.round(Math.max(200, Math.min(max, startW + x - startX)));
    document.documentElement.style.setProperty('--side-w', S.settings.sideW + 'px');
    e.preventDefault();
  };
  const up = () => { if (!dragging) return; dragging = false; sp.classList.remove('drag'); document.body.style.userSelect = ''; saveSettings(); };
  const down = e => { dragging = true; startX = (e.touches ? e.touches[0].clientX : e.clientX); startW = S.settings.sideW || 340; sp.classList.add('drag'); document.body.style.userSelect = 'none'; e.preventDefault(); };
  sp.addEventListener('mousedown', down); sp.addEventListener('touchstart', down, { passive: false });
  window.addEventListener('mousemove', move); window.addEventListener('touchmove', move, { passive: false });
  window.addEventListener('mouseup', up); window.addEventListener('touchend', up);
  sp.addEventListener('dblclick', () => { S.settings.sideW = 340; saveSettings(); applyPanels(); });
}

// ------------------------------------------------------------------ saat
function tick() {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, '0'), mm = String(d.getMinutes()).padStart(2, '0'), ss = String(d.getSeconds()).padStart(2, '0');
  $('clock').innerHTML = `${hh}:${mm}<span class="sec">:${ss}</span>`;
  $('stageClock').textContent = `${hh}:${mm}`;
}

// ------------------------------------------------------------------ olaylar
function bind() {
  let qTimer;
  $('q').addEventListener('input', () => { clearTimeout(qTimer); qTimer = setTimeout(() => { S.limit = 300; renderList(); $('list').scrollTop = 0; }, 180); });
  $('qText').addEventListener('change', () => { S.settings.searchText = $('qText').checked; saveSettings(); renderList(); });
  $('tabs').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    S.tab = b.dataset.tab; S.sortMode = false; S.sel = null; $('q').value = ''; S.limit = 300;
    if (S.tab !== 'programs') S.programId = null;
    saveUi(); renderList(); $('list').scrollTop = 0;
  });
  $('btnHome').addEventListener('click', goHome);
  $('btnBack').addEventListener('click', () => { stopScroll(); setNarrowSong(false); $('editor').hidden = true; if (S.current) renderSong(); });
  $('btnSettings').addEventListener('click', openSettings);
  // eski önbellekten gelen index.html'de düğme yoksa kendimiz ekleriz (sürüm karışıklığında da görünsün)
  if (!$('btnLink')) $('btnSync').before(h('button', { class: 'icon-btn link-btn', id: 'btnLink', title: t('linkTitle') }, '🔗'));
  if (!$('stageLink') && $('stageClock')) $('stageClock').before(h('span', { class: 'stage-link', id: 'stageLink', hidden: true }, '🔗'));
  $('btnLink').addEventListener('click', openLinkSheet);
  bindTonEntry();
  linkConnect();
  $('btnPanel').addEventListener('click', () => togglePanel());
  $('unfoldBtn').addEventListener('click', () => setCompact(false));
  bindSplitter();
  $('btnSync').addEventListener('click', () => sync());
  $('btnLang').addEventListener('click', () => { setLang(getLang() === 'tr' ? 'en' : 'tr'); applyLang(); });
  $('modal').addEventListener('click', e => { if (e.target === $('modal')) closeModal(); });

  $('fileTxt').addEventListener('change', e => { importFiles([...e.target.files], false); e.target.value = ''; });
  $('fileDir').addEventListener('change', e => { importFiles([...e.target.files], true); e.target.value = ''; });
  $('fileZip').addEventListener('change', e => { if (e.target.files[0]) importZip(e.target.files[0]); e.target.value = ''; });

  // sürükle-bırak (masaüstü)
  document.addEventListener('dragover', e => { e.preventDefault(); });
  document.addEventListener('drop', e => {
    e.preventDefault();
    const files = [...(e.dataTransfer.files || [])];
    const zip = files.find(f => /\.zip$/i.test(f.name));
    const docs = files.filter(f => /\.(pdf|docx)$/i.test(f.name));
    if (docs.length && !VIEW_ONLY) importDocuments(docs);
    else if (zip) importZip(zip); else if (files.length) importFiles(files, false);
  });

  // sahne
  $('stageExit').addEventListener('click', closeStage);
  $('stagePrev').addEventListener('click', () => step(-1));
  $('stageNext').addEventListener('click', () => step(1));
  $('stageSmaller').addEventListener('click', () => setFont(-1));
  $('stageBigger').addEventListener('click', () => setFont(1));
  $('stageScrollBtn').addEventListener('click', toggleScroll);
  for (const el of [$('songScroll'), $('stageScroll')]) { addSwipe(el); addPinchFont(el); }
  // sayfa (ekran) yakınlaştırmasını kapat: iki parmak sadece şarkı yazısını büyütür
  for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, e => e.preventDefault(), { passive: false });

  document.addEventListener('keydown', onKey);
  window.addEventListener('online', () => scheduleSync());
}

function addSwipe(el) {
  let x0 = 0, y0 = 0, t0 = 0;
  el.addEventListener('touchstart', e => { const p = e.touches[0]; x0 = p.clientX; y0 = p.clientY; t0 = Date.now(); }, { passive: true });
  el.addEventListener('touchend', e => {
    const p = e.changedTouches[0]; const dx = p.clientX - x0, dy = p.clientY - y0;
    if (Date.now() - t0 < 600 && Math.abs(dx) > 90 && Math.abs(dy) < 60) step(dx < 0 ? 1 : -1);
  }, { passive: true });
}

function onKey(e) {
  const typing = e.target.matches('input, textarea, select');
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') { e.preventDefault(); if (!$('stage').hidden) closeStage(); setNarrowSong(false); $('q').focus(); $('q').select(); return; }
  if (e.key === 'Escape') {
    if (!$('modal').hidden) { closeModal(); return; }
    if (!$('stage').hidden) { closeStage(); return; }
    if (typing) { e.target.blur(); return; }
  }
  if (typing || !$('modal').hidden || !$('editor').hidden) return;
  if (!S.current) return;
  const el = scroller();
  switch (e.key) {
    case 'ArrowRight': e.preventDefault(); step(1); break;
    case 'ArrowLeft': e.preventDefault(); step(-1); break;
    case 'PageDown': {
      e.preventDefault();
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - el.clientHeight * 0.5 - 4) step(1);
      else el.scrollBy({ top: el.clientHeight * 0.8, behavior: 'smooth' });
      break;
    }
    case 'PageUp': {
      e.preventDefault();
      if (el.scrollTop <= 2) step(-1); else el.scrollBy({ top: -el.clientHeight * 0.8, behavior: 'smooth' });
      break;
    }
    case ' ': e.preventDefault(); toggleScroll(); break;
    case 'f': case 'F': $('stage').hidden ? openStage() : closeStage(); break;
    case 'l': case 'L': togglePanel(); break;
    case '+': case '=': setFont(2); break;
    case '-': setFont(-2); break;
  }
}

// ------------------------------------------------------------------ servis çalışanı (çevrimdışı)
function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  // Yeni servis çalışanı devreye girince sayfayı yenile — ama sahnede/düzenlerken değil.
  let reloading = false;
  const hadController = !!navigator.serviceWorker.controller;
  const safeReload = () => {
    if (reloading) return;
    if (!$('stage').hidden || !$('editor').hidden || !$('modal').hidden) {
      toast(t('updateReady'), { label: t('reload'), fn: () => location.reload() });
      return;
    }
    reloading = true; location.reload();
  };
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController) safeReload(); });
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(reg => {
    // iPhone'da uygulama arka plandan dönünce sayfa yeniden yüklenmez → güncellemeyi kendimiz kontrol ederiz
    const check = () => { if (navigator.onLine) reg.update().catch(() => {}); };
    check();
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
    setInterval(check, 30 * 60 * 1000);
  }).catch(() => {});
}

// ------------------------------------------------------------------ başlat
async function start() {
  bind();
  setLang(getLang());
  const [settings, programs, recent, lastSync, bundleSha, songs, vdirs, notes] = await Promise.all([
    loadSettingsReliably(), db.get('programs'), db.get('recent'), db.get('lastSync'), db.get('bundleSha'), db.allSongs(), db.get('virtualDirs'), db.get('notes'),
  ]);
  if (notes && notes.notes) S.notes = notes;
  try { S.removed = (await db.get('removed')) || {}; } catch (_) {}
  try { const o = await db.get('order'); if (o && o.order) S.order = o; } catch (_) {}
  try { S.pers = (await db.get('pers')) || null; } catch (_) {}
  try { S.tonBook = (await db.get('tonlar')) || emptyBook(); } catch (_) { S.tonBook = emptyBook(); }
  try { S.tonOpen = localStorage.getItem('md.tonOpen') === '1'; } catch (_) {}
  if (Array.isArray(vdirs)) S.virtualDirs = new Set(vdirs);
  if (settings) S.settings = { ...S.settings, ...settings, gh: { ...S.settings.gh, ...(settings.gh || {}) } };
  if (programs) S.programs = { ...S.programs, ...programs };
  if (recent) S.recent = recent;
  S.sync.last = lastSync || 0; S.sync.bundleSha = bundleSha || '';
  for (const s of songs) S.songs.set(s.p, decorate(s));
  $('qText').checked = S.settings.searchText !== false;
  document.documentElement.style.setProperty('--lyrics-size', S.settings.font + 'px');
  rebuildIndex();
  loadUi();
  applyLang();
  applyPanels();
  applyLook();
  tick(); setInterval(tick, 1000);
  registerSW();
  requestPersist();
  if (gh().ok && navigator.onLine) sync({ quiet: S.songs.size > 0 });
  // yarım kalan yeni şarkı taslağı (iPhone Safari'ye geçerken uygulama kapanmış olabilir)
  const draft = loadDraft();
  if (!VIEW_ONLY && draft && (draft.text || draft.title || draft.artist)) { openEditor(null, draft); toast(t('draftRestored')); }
}

start();
window.__md = S; window.__mdVersion = VERSION; window.__mdGo = d => goDir(d); window.__mdTon = () => openTonDefteri(); // hata ayıklama için
