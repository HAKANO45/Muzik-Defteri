// Arama, başlık, etiket (usul/makam) ve akor yardımcıları

/** Türkçe duyarsız arama anahtarı: "Şarkı Gönül" -> "sarki gonul". Eski dosyalarda ş/ı yerine s/i yazıldığı için şart. */
const FOLD = { 'ç':'c','ğ':'g','ı':'i','i̇':'i','ö':'o','ş':'s','ü':'u','â':'a','î':'i','û':'u','é':'e','ë':'e','ə':'e','ä':'a' };
export function fold(s) {
  return s.toLocaleLowerCase('tr').replace(/[çğıöşüâîûéëəä]/g, c => FOLD[c] || c).replace(/̇/g, '');
}

export function baseName(p) { return p.slice(p.lastIndexOf('/') + 1); }
export function dirName(p) { const i = p.lastIndexOf('/'); return i < 0 ? '' : p.slice(0, i); }

/** Dosya adından görünen başlık: uzantı, baştaki "1." / "5-8" numaraları atılır. */
export function titleOf(p) {
  let n = baseName(p).replace(/\.txt$/i, '');
  n = n.replace(/^\s*\d{1,3}\s*[.)\-_]\s*(?!\d)/, '');      // "01.Potbori" -> "Potbori"
  n = n.replace(/^\s*\d{1,2}\s*-\s*(4|8|16)\s+/, '');        // "5-8 SARI GELIN" -> "SARI GELIN"
  n = n.replace(/\s+/g, ' ').trim();
  return n || baseName(p);
}

const MAKAMS = [
  ['Uşşak', /u[sş][sş]ak/], ['Hicaz', /hicaz/], ['Kürdi', /k[uü]rd[iîı]/], ['Nihavent', /nihavend|nihavent/],
  ['Rast', /\brast\b/], ['Hüzzam', /h[uü]zzam/], ['Segah', /segah/], ['Saba', /\bsaba\b/],
  ['Hüseyni', /h[uü]seyn[iî]/], ['Muhayyer', /muhayyer/], ['Karcığar', /karc[iı][gğ]ar/], ['Mahur', /mahur/],
  ['Acemaşiran', /acema[sş]iran/], ['Hicazkar', /hicazkar/], ['Buselik', /bu?selik/], ['Suzinak', /suzinak/],
];
const USUL = /(?:^|[^\d])(2|3|4|5|6|7|9|10)\s*-\s*(4|8|16)(?!\d)/;

/** Klasör ve dosya adından etiketler: usul (5/8, 9/8 ...), makam, sanatçı/klasör */
export function tagsOf(p) {
  const tags = [];
  const low = p.toLocaleLowerCase('tr');
  const u = low.match(USUL);
  if (u) tags.push(`${u[1]}/${u[2]}`);
  for (const [name, re] of MAKAMS) if (re.test(low)) { tags.push(name); break; }
  return tags;
}

// ---------- Akorlar ----------
const CHORD = /^[A-G](?:#|b)?(?:m|maj|min|dim|sus|aug|add|M)?\d*(?:sus\d|add\d|b\d|#\d)*(?:\/[A-G](?:#|b)?)?$/;
export function isChordLine(line) {
  const parts = line.trim().split(/\s+/);
  if (!parts[0]) return false;
  return parts.every(w => CHORD.test(w) || w === '|' || w === '-' || w === '/');
}

const SHARP = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const FLAT  = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
function noteIdx(n) { let i = SHARP.indexOf(n); if (i < 0) i = FLAT.indexOf(n); return i; }
function shiftNote(n, k, useFlat) {
  const i = noteIdx(n); if (i < 0) return n;
  return (useFlat ? FLAT : SHARP)[((i + k) % 12 + 12) % 12];
}
/** Akor satırındaki akorları k yarım ses kaydırır (hizayı korumaya çalışır). */
export function transposeLine(line, k) {
  if (!k) return line;
  return line.replace(/\b([A-G](?:#|b)?)([^\s/]*)(?:\/([A-G](?:#|b)?))?/g, (m, root, rest, bass) => {
    const useFlat = root.includes('b');
    let out = shiftNote(root, k, useFlat) + rest + (bass ? '/' + shiftNote(bass, k, bass.includes('b')) : '');
    return out;
  });
}

export function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
