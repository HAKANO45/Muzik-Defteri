// Müzik Defteri v4 — ana uygulama
import { db, requestPersist, loadSettingsReliably, persistSettingsReliably } from './db.js';
import { GitHub } from './github.js';
import { bytesToSong, songToBytes, ENC_LABEL } from './encoding.js';
import { readZip, writeZip } from './zip.js';
import { fold, titleOf, tagsOf, baseName, dirName, isChordLine, transposeLine, escapeHtml } from './textutil.js';
import { t, getLang, setLang } from './i18n.js';

export const VERSION = '4.0.2';
const $ = id => document.getElementById(id);

// ------------------------------------------------------------------ durum
const S = {
  songs: new Map(),          // yol -> kayıt (del:true olanlar silinmeyi bekleyen işaretler)
  dirs: new Map(),           // klasör -> { dirs:Set, files:[] }
  titleIndex: new Map(),     // katlanmış başlık -> [yollar] (kopya tespiti)
  virtualDirs: new Set(),    // henüz dosyası olmayan yeni klasörler
  tab: 'library', dir: '', programId: null,
  current: null, context: { list: [], label: '' },
  programs: { format: 1, programs: [], fav: [], favUpdated: 0 },
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
    if (terms.every(w => rec._ft.includes(w))) score = rec._ft.startsWith(terms[0]) ? 4 : 3;
    else if (terms.every(w => rec._fp.includes(w))) score = 2;
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
    b.textContent = t(b.dataset.tab);
    b.classList.toggle('active', b.dataset.tab === S.tab && !$('q').value.trim());
  }
}

function songItem(p, { sub, html, acts, ctx } = {}) {
  const rec = S.songs.get(p);
  const missing = !rec || rec.del;
  const title = missing ? baseName(p).replace(/\.txt$/i, '') + ' ' + t('missingSong') : rec._title;
  const tags = missing ? [] : rec._tags.map(x => h('span', { class: 'tag' }, x));
  const subEl = html ? h('span', { class: 'sub', html }) : h('span', { class: 'sub' }, sub != null ? sub : dirName(p) || t('root'));
  return h('div', { class: 'item' + (p === S.current ? ' active' : ''), role: 'button', tabindex: 0, 'data-p': p,
      onclick: e => { if (e.target.closest('.acts')) return; if (!missing) openSong(p, ctx); },
      onkeydown: e => { if (e.key === 'Enter' && !missing) openSong(p, ctx); } },
    h('span', { class: 'ico' }, rec && rec.dirty ? '✱' : '♪'),
    h('span', { class: 'main' }, h('span', { class: 'name' }, title, ...tags), subEl),
    acts ? h('span', { class: 'acts' }, ...acts) : null);
}

function renderList() {
  renderTabs();
  const list = $('list'), head = $('sideHead');
  list.replaceChildren(); head.replaceChildren();
  const q = $('q').value.trim();

  if (q) {
    const res = search(q, $('qText').checked);
    head.append(t('results', { n: res.length }));
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
    head.append(h('button', { class: 'crumb', onclick: () => goDir('') }, t('root')));
    parts.forEach((part, i) => {
      head.append(h('span', { class: 'crumb-sep' }, '›'));
      const d = parts.slice(0, i + 1).join('/');
      head.append(h('button', { class: 'crumb', onclick: () => goDir(d) }, part));
    });
    head.append(h('span', { class: 'spacer' }),
      h('button', { class: 'small-btn', title: t('newFolder'), onclick: newFolder }, '＋📁'),
      h('button', { class: 'small-btn', title: t('newSong'), onclick: () => openEditor(null) }, '＋♪'));
    const node = S.dirs.get(S.dir) || { dirs: new Set(), files: [] };
    const dirs = [...node.dirs].sort((a, b) => S.collator.compare(baseName(a), baseName(b)));
    for (const d of dirs) {
      list.append(h('div', { class: 'item', role: 'button', tabindex: 0, onclick: () => goDir(d), onkeydown: e => { if (e.key === 'Enter') goDir(d); } },
        h('span', { class: 'ico' }, '📁'),
        h('span', { class: 'main' }, h('span', { class: 'name' }, baseName(d))),
        h('span', { class: 'count' }, countIn(d))));
    }
    const ctx = { list: node.files, label: S.dir || t('root') };
    for (const p of node.files.slice(0, S.limit)) list.append(songItem(p, { ctx, sub: '' }));
    if (node.files.length > S.limit) list.append(h('button', { class: 'small-btn', style: 'margin:10px', onclick: () => { S.limit += 300; renderList(); } }, t('showMore', { n: node.files.length - S.limit })));
    if (!dirs.length && !node.files.length) {
      list.append(h('div', { class: 'list-note' }, S.songs.size ? t('emptyFolder') : t('welcomeText')));
      if (S.dir && S.virtualDirs.has(S.dir)) list.append(h('button', { class: 'small-btn', style: 'margin:0 12px', onclick: () => deleteEmptyFolder(S.dir) }, '🗑 ' + t('deleteFolder')));
    }
    return;
  }

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
  const progs = S.programs.programs.filter(p => !p.deleted);
  const prog = progs.find(p => p.id === S.programId);
  if (!prog) {
    head.append(h('span', { class: 'spacer' }), h('button', { class: 'small-btn', onclick: newProgram }, '＋ ' + t('newProgram')));
    for (const p of progs) {
      list.append(h('div', { class: 'item', role: 'button', tabindex: 0, onclick: () => { S.programId = p.id; saveUi(); renderList(); } },
        h('span', { class: 'ico' }, '☰'),
        h('span', { class: 'main' }, h('span', { class: 'name' }, p.name)),
        h('span', { class: 'count' }, p.items.length)));
    }
    if (!progs.length) list.append(h('div', { class: 'list-note' }, t('emptyProgram')));
    return;
  }
  head.append(h('button', { class: 'crumb', onclick: () => { S.programId = null; saveUi(); renderList(); } }, '‹ ' + t('programs')),
    h('span', { class: 'crumb-sep' }, '›'), h('b', { style: 'color:var(--gold)' }, prog.name), h('span', { class: 'spacer' }),
    h('button', { class: 'small-btn', title: t('rename'), onclick: () => renameProgram(prog) }, '✎'),
    h('button', { class: 'small-btn', title: t('delete'), onclick: () => deleteProgram(prog) }, '🗑'),
    prog.items.length ? h('button', { class: 'small-btn', onclick: () => { openSong(prog.items[0], { list: prog.items, label: prog.name }); openStage(); } }, '▶ ' + t('startStage')) : null);
  const ctx = { list: prog.items, label: prog.name };
  prog.items.forEach((p, i) => {
    list.append(songItem(p, { ctx, sub: `${i + 1}. ${dirName(p)}`, acts: [
      h('button', { title: t('moveUp'), onclick: () => moveInProgram(prog, i, -1) }, '▲'),
      h('button', { title: t('moveDown'), onclick: () => moveInProgram(prog, i, 1) }, '▼'),
      h('button', { title: t('remove'), onclick: () => { prog.items.splice(i, 1); touchProgram(prog); } }, '✕'),
    ] }));
  });
  if (!prog.items.length) list.append(h('div', { class: 'list-note' }, t('emptyProgram')));
}

function goDir(d) { S.dir = d; S.tab = 'library'; S.limit = 300; $('q').value = ''; saveUi(); renderList(); $('list').scrollTop = 0; }

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

async function newFolder() {
  const name = await promptText(t('newFolder'), '');
  if (!name) return;
  const clean = name.replace(/[\\/:*?"<>|]/g, '').trim();
  if (!clean) return;
  const d = S.dir ? S.dir + '/' + clean : clean;
  S.virtualDirs.add(d);
  await saveVirtualDirs();
  rebuildIndex();
  goDir(d);
}

async function deleteEmptyFolder(d) {
  if (countIn(d)) return;
  if (!(await confirmBox(t('confirmDelete', { name: baseName(d) })))) return;
  for (const v of [...S.virtualDirs]) if (v === d || v.startsWith(d + '/')) S.virtualDirs.delete(v);
  await saveVirtualDirs();
  rebuildIndex();
  goDir(dirName(d));
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
}

function lyricsHtml(text) {
  return text.split('\n').map(line => {
    if (line.trim() && isChordLine(line)) return '<span class="chord">' + escapeHtml(transposeLine(line, S.transpose)) + '</span>';
    return escapeHtml(line);
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
    tbBtn('✎', t('edit'), () => openEditor(rec.p)),
    tbBtn('⎙', t('print'), () => window.print()),
    tbBtn('🗑', t('delete'), () => deleteSong(rec.p)),
    tbBtn('⛶', t('stage'), openStage),
  ].filter(Boolean));
  $('songTitle').textContent = rec._title;
  const meta = $('songMeta'); meta.replaceChildren();
  const d = dirName(rec.p);
  meta.append(h('button', { onclick: () => goDir(d) }, '📁 ' + (d || t('root'))));
  for (const tg of rec._tags) meta.append(h('span', { class: 'tag' }, tg));
  meta.append(h('span', {}, ENC_LABEL[rec.e] || rec.e || ''));
  if (rec.dirty) meta.append(h('span', { title: t('pending', { n: 1 }) }, '✱'));
  const dups = duplicatesOf(rec.p);
  if (dups.length) meta.append(h('button', { onclick: () => showDuplicates(rec.p, dups) }, t('duplicates', { n: dups.length })));
  $('lyrics').innerHTML = lyricsHtml(rec.t);
  document.documentElement.style.setProperty('--lyrics-size', S.settings.font + 'px');
  $('songScroll').scrollTop = 0;
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
  $('stageTitle').textContent = rec._title;
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

function openEditor(p) {
  stopScroll();
  const rec = p ? S.songs.get(p) : null;
  const ed = $('editor');
  const nameIn = h('input', { class: 'field', value: rec ? baseName(rec.p).replace(/\.txt$/i, '') : '', placeholder: t('fileName') });
  const dl = h('datalist', { id: 'dirList' }, allDirs().map(d => h('option', { value: d })));
  const dirIn = h('input', { class: 'field', list: 'dirList', value: rec ? dirName(rec.p) : S.dir, placeholder: t('root') });
  const ta = h('textarea', { spellcheck: 'false' });
  ta.value = rec ? rec.t : '';
  const save = async () => {
    const name = nameIn.value.replace(/[\\/:*?"<>|]/g, '').trim();
    if (!name) { toast(t('nameRequired')); nameIn.focus(); return; }
    const dir = dirIn.value.split('/').map(x => x.trim()).filter(Boolean).join('/');
    const newPath = (dir ? dir + '/' : '') + (/\.txt$/i.test(name) ? name : name + '.txt');
    const existing = S.songs.get(newPath);
    if (existing && !existing.del && newPath !== (rec && rec.p)) { toast(t('nameExists')); return; }
    await saveSong(rec ? rec.p : null, newPath, ta.value.replace(/\r\n?/g, '\n'));
    ed.hidden = true;
    openSong(newPath, S.context.list.includes(newPath) ? null : { list: S.dirs.get(dirName(newPath))?.files || [newPath], label: dirName(newPath) });
    toast(t('saved'));
  };
  ed.replaceChildren(
    h('div', { class: 'row' },
      h('label', {}, t('fileName'), nameIn),
      h('label', {}, t('folder'), dirIn, dl)),
    ta,
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn primary', onclick: save }, t('save')),
      h('button', { class: 'btn', onclick: () => { ed.hidden = true; if (S.current) renderSong(); else { $('empty').hidden = false; setNarrowSong(false); } } }, t('cancel')),
      rec ? h('span', { class: 'hint', style: 'align-self:center' }, t('encoding') + ': ' + (ENC_LABEL[rec.e] || rec.e)) : null));
  ta.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); } });
  $('song').hidden = true; $('empty').hidden = true; ed.hidden = false;
  setNarrowSong(true);
  (rec ? ta : nameIn).focus();
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
  return { format: 1, programs: [...byId.values()], fav, favUpdated: Math.max(local.favUpdated || 0, remote.favUpdated || 0) };
}

// ------------------------------------------------------------------ senkronizasyon
function gh() { return new GitHub(S.settings.gh); }
function pendingCount() { let n = 0; for (const s of S.songs.values()) if (s.dirty) n++; return n + (S.programs.dirty ? 1 : 0); }

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
function scheduleSync() {
  if (!gh().ok) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => { if (navigator.onLine) sync({ quiet: true }); }, 4000);
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
function stripPrograms(p) { return { format: 1, programs: p.programs || [], fav: p.fav || [], favUpdated: p.favUpdated || 0 }; }

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
function modal(...kids) { $('modalCard').replaceChildren(...kids); $('modal').hidden = false; }
function closeModal() { $('modal').hidden = true; $('modalCard').replaceChildren(); }
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
    h('h2', {}, '⚙ ' + t('settings')),
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
    h('h3', {}, t('importExport')),
    h('p', {}, t('importTarget', { f: S.dir || t('root') })),
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn', onclick: () => { closeModal(); $('fileZip').click(); } }, t('importZip')),
      h('button', { class: 'btn', onclick: () => { closeModal(); $('fileTxt').click(); } }, t('importTxt')),
      isIos ? null : h('button', { class: 'btn', onclick: () => { closeModal(); $('fileDir').click(); } }, t('importFolder')),
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
    h('p', { class: 'hint', style: 'margin-top:18px' }, t('orLocal')),
    h('div', { class: 'btn-row' },
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
    S.tab = b.dataset.tab; $('q').value = ''; S.limit = 300;
    if (S.tab !== 'programs') S.programId = null;
    saveUi(); renderList(); $('list').scrollTop = 0;
  });
  $('btnBack').addEventListener('click', () => { stopScroll(); setNarrowSong(false); $('editor').hidden = true; if (S.current) renderSong(); });
  $('btnSettings').addEventListener('click', openSettings);
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
    if (zip) importZip(zip); else if (files.length) importFiles(files, false);
  });

  // sahne
  $('stageExit').addEventListener('click', closeStage);
  $('stagePrev').addEventListener('click', () => step(-1));
  $('stageNext').addEventListener('click', () => step(1));
  $('stageSmaller').addEventListener('click', () => setFont(-1));
  $('stageBigger').addEventListener('click', () => setFont(1));
  $('stageScrollBtn').addEventListener('click', toggleScroll);
  for (const el of [$('songScroll'), $('stageScroll')]) addSwipe(el);

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
    case '+': case '=': setFont(2); break;
    case '-': setFont(-2); break;
  }
}

// ------------------------------------------------------------------ servis çalışanı (çevrimdışı)
function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('sw.js').then(reg => {
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      nw && nw.addEventListener('statechange', () => {
        if (nw.state === 'installed' && navigator.serviceWorker.controller) toast(t('updateReady'), { label: t('reload'), fn: () => location.reload() });
      });
    });
  }).catch(() => {});
}

// ------------------------------------------------------------------ başlat
async function start() {
  bind();
  setLang(getLang());
  const [settings, programs, recent, lastSync, bundleSha, songs, vdirs] = await Promise.all([
    loadSettingsReliably(), db.get('programs'), db.get('recent'), db.get('lastSync'), db.get('bundleSha'), db.allSongs(), db.get('virtualDirs'),
  ]);
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
  tick(); setInterval(tick, 1000);
  registerSW();
  requestPersist();
  if (gh().ok && navigator.onLine) sync({ quiet: S.songs.size > 0 });
}

start();
window.__md = S; // hata ayıklama için
