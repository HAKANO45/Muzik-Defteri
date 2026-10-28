// 🎼 Ton Defteri — gizli bölüm: Eylem / Hakan / Düet için şarkı tonları (tarz, BPM, not).
// Veri: repertuvar deposunda tonlar.json (öğe başına "updated" ile birleşir, silinenler "deleted").
// Giriş: üstteki başlığa 2 sn basılı tut. Telefonlarda da eklenip düzenlenir (söz değil, not).

export const SINGERS = [['eylem', '🎤 Eylem'], ['hakan', '🎤 Hakan'], ['duet', '👥 Düet']];
export const NOTES = ['Do', 'Re', 'Mi', 'Fa', 'Sol', 'La', 'Si'];
export const STYLES = ['9-8', 'Slow', 'Pop', 'Rumba', 'Halay', 'Oyun Havası', 'Türkü', 'Arabesk', 'Fantezi', 'Rock'];

export function emptyBook() { return { format: 1, items: {} }; }
export function newId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

/** tonlar.json birleştirme: öğe başına son değişen kazanır */
export function mergeBooks(local, remote) {
  const out = { format: 1, items: { ...((remote && remote.items) || {}) } };
  for (const [id, it] of Object.entries((local && local.items) || {})) {
    const r = out.items[id];
    if (!r || (it.updated || 0) > (r.updated || 0)) out.items[id] = it;
  }
  return out;
}

/** "Re (72)" → { ton: 'Re', bpm: 72 } · "Rock Vahde 98" → { tarz: 'Rock Vahde', bpm: 98 } · "104" → bpm */
export function parseRow(cells) {
  let [title, artist, ton, rit] = cells.map(c => (c || '').replace(/\s+/g, ' ').trim());
  if (!title) return null;
  let bpm = '', tarz = '';
  const tb = ton && ton.match(/\((\d{2,3})\)/);
  if (tb && +tb[1] >= 40) { bpm = tb[1]; ton = ton.replace(tb[0], '').trim(); }
  if (rit) {
    const m = rit.match(/(\d{2,3})\s*$/);
    if (m && +m[1] >= 40) { bpm = bpm || m[1]; rit = rit.replace(m[0], '').trim(); }
    tarz = rit;
  }
  return { title, artist: artist || '', ton: ton || '', tarz, bpm };
}

/** Excel / Google E-Tablolar'dan kopyalanan satırlar (sekmeyle ayrılmış) ya da HTML tablo dışa aktarımı */
export function parsePasted(text) {
  const rows = [];
  if (/<table/i.test(text)) {
    const doc = new DOMParser().parseFromString(text, 'text/html');
    for (const tr of doc.querySelectorAll('tbody tr, tr')) {
      const cells = [...tr.querySelectorAll('td')].map(td => td.textContent);
      if (cells.length) rows.push(cells);
    }
  } else {
    for (const line of text.split(/\r?\n/)) if (line.trim()) rows.push(line.split('\t'));
  }
  return rows
    .filter(c => !/^\s*şarkı\s*adı\s*$/i.test(c[0] || ''))        // başlık satırı
    .map(parseRow).filter(Boolean);
}
