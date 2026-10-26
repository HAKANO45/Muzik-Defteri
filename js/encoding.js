// Metin kodlama: eski Türkçe .txt dosyalarını doğru okuma / aynı kodlamayla geri yazma.
// Desteklenen: cp1254 (Windows Türkçe), cp857 (DOS Türkçe), utf8, utf8bom, utf16 (LE+BOM), ascii
import { CP1254, CP857 } from './codepages.js';

const TABLES = { cp1254: CP1254, cp857: CP857 };
const REVERSE = {};
for (const [name, tbl] of Object.entries(TABLES)) {
  const m = new Map();
  tbl.forEach((cp, i) => { if (cp !== 0xFFFD) m.set(cp, 0x80 + i); });
  REVERSE[name] = m;
}

// Türkçe harflerin bayt değerleri (tespit için)
const W1254 = new Set([0xfc,0xe7,0xf0,0xfd,0xfe,0xf6,0xc7,0xd0,0xdd,0xde,0xd6,0xdc,0xe2,0xc2,0xee,0xfb]);
const D857  = new Set([0x81,0x87,0xa7,0x8d,0x9f,0x94,0x80,0x9e,0xa6,0x98,0x99,0x9a,0x83,0xb6,0x8c,0x96]);

export function detect(bytes) {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return 'utf8bom';
  if ((bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff)) return 'utf16';
  let high = false;
  for (let i = 0; i < bytes.length; i++) if (bytes[i] > 127) { high = true; break; }
  if (!high) return 'ascii';
  try { new TextDecoder('utf-8', { fatal: true }).decode(bytes); return 'utf8'; } catch (_) { /* değil */ }
  let w = 0, d = 0;
  for (let i = 0; i < bytes.length; i++) { const c = bytes[i]; if (W1254.has(c)) w++; else if (D857.has(c)) d++; }
  return d > w ? 'cp857' : 'cp1254';
}

function decodeTable(bytes, tbl) {
  let s = '';
  const CHUNK = 8192;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const part = bytes.subarray(i, i + CHUNK);
    const arr = new Array(part.length);
    for (let j = 0; j < part.length; j++) { const b = part[j]; arr[j] = b < 128 ? b : tbl[b - 128]; }
    s += String.fromCharCode.apply(null, arr);
  }
  return s;
}

export function decode(bytes, enc = detect(bytes)) {
  switch (enc) {
    case 'utf8bom': return new TextDecoder('utf-8').decode(bytes.subarray(3));
    case 'utf16': {
      const be = bytes[0] === 0xfe;
      return new TextDecoder(be ? 'utf-16be' : 'utf-16le').decode(bytes.subarray(2));
    }
    case 'ascii': case 'utf8': return new TextDecoder('utf-8').decode(bytes);
    default: return decodeTable(bytes, TABLES[enc] || CP1254);
  }
}

/** Metni dosya baytlarına çevirir. Kodlamada olmayan karakter varsa UTF-8'e geçer. */
export function encode(text, enc) {
  if (enc === 'cp1254' || enc === 'cp857' || enc === 'ascii') {
    const rev = REVERSE[enc === 'ascii' ? 'cp1254' : enc];
    const out = new Uint8Array(text.length);
    let ok = true;
    for (let i = 0; i < text.length; i++) {
      const c = text.charCodeAt(i);
      if (c < 128) out[i] = c;
      else { const b = rev.get(c); if (b === undefined) { ok = false; break; } out[i] = b; }
    }
    if (ok) return { bytes: out, enc: enc === 'ascii' && /[^\x00-\x7f]/.test(text) ? 'cp1254' : enc };
    enc = 'utf8';
  }
  if (enc === 'utf16') {
    const out = new Uint8Array(2 + text.length * 2);
    out[0] = 0xff; out[1] = 0xfe;
    for (let i = 0; i < text.length; i++) { const c = text.charCodeAt(i); out[2 + i * 2] = c & 0xff; out[3 + i * 2] = c >> 8; }
    return { bytes: out, enc };
  }
  const u = new TextEncoder().encode(text);
  if (enc === 'utf8bom') { const o = new Uint8Array(u.length + 3); o.set([0xef, 0xbb, 0xbf]); o.set(u, 3); return { bytes: o, enc }; }
  return { bytes: u, enc: 'utf8' };
}

/** Dosya baytlarından uygulama içi kayıt: metin "\n" ile, CRLF bilgisi ayrı. */
export function bytesToSong(bytes) {
  const e = detect(bytes);
  let t = decode(bytes, e);
  const n = t.includes('\r\n') ? 1 : 0;
  t = t.replace(/\r\n?/g, '\n');
  return { t, e, n };
}

export function songToBytes(song) {
  const text = song.n ? song.t.replace(/\n/g, '\r\n') : song.t;
  return encode(text, song.e || 'utf8');
}

/** GitHub ile aynı: sha1("blob <len>\0" + bytes) */
export async function gitBlobSha(bytes) {
  const head = new TextEncoder().encode(`blob ${bytes.length}\0`);
  const all = new Uint8Array(head.length + bytes.length);
  all.set(head); all.set(bytes, head.length);
  const h = await crypto.subtle.digest('SHA-1', all);
  return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export function toBase64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** "T#U00fcrk#U00fcler" gibi bozuk ZIP adlarını düzeltir. */
export function fixEscapedName(name) {
  return name.replace(/#U([0-9A-Fa-f]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

export const ENC_LABEL = {
  cp1254: 'Windows-1254', cp857: 'DOS Türkçe (857)', utf8: 'UTF-8', utf8bom: 'UTF-8 BOM', utf16: 'UTF-16', ascii: 'ASCII',
};
