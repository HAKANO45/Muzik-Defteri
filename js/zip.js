// Küçük ZIP okuyucu/yazıcı (kütüphanesiz). Okuma: stored + deflate. Yazma: stored (sıkıştırmasız).
import { decode, fixEscapedName } from './encoding.js';

const td = new TextDecoder();

/** UTF-8 bayrağı olmayan ad: geçerli UTF-8 ise o, değilse DOS Türkçe (857).
 *  Windows'un 857 varyantında 0xD5 = "ı" (IBM tablosunda tanımsız). */
function decodeLegacyName(bytes) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch (_) {}
  return decode(bytes, 'cp857').replace(/\uFFFD/g, 'ı');
}

async function inflateRaw(data) {
  const s = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}

/** ZIP içindeki dosyaları döner: [{ name, bytes }] (klasörler hariç) */
export async function readZip(buf, filter = () => true) {
  const u8 = new Uint8Array(buf);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  // End of central directory
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('ZIP okunamadı');
  let count = dv.getUint16(eocd + 10, true);
  let cdOff = dv.getUint32(eocd + 16, true);
  // ZIP64
  if (cdOff === 0xffffffff || count === 0xffff) {
    const loc = eocd - 20;
    if (dv.getUint32(loc, true) === 0x07064b50) {
      const z64 = Number(dv.getBigUint64(loc + 8, true));
      count = Number(dv.getBigUint64(z64 + 32, true));
      cdOff = Number(dv.getBigUint64(z64 + 48, true));
    }
  }
  const out = [];
  let p = cdOff;
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const flags = dv.getUint16(p + 8, true);
    const method = dv.getUint16(p + 10, true);
    let csize = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commLen = dv.getUint16(p + 32, true);
    let lho = dv.getUint32(p + 42, true);
    const nameBytes = u8.subarray(p + 46, p + 46 + nameLen);
    // ZIP64 ek alanı
    if (csize === 0xffffffff || lho === 0xffffffff) {
      let e = p + 46 + nameLen; const end = e + extraLen;
      while (e < end) {
        const id = dv.getUint16(e, true), sz = dv.getUint16(e + 2, true);
        if (id === 1) {
          let q = e + 4;
          if (dv.getUint32(p + 24, true) === 0xffffffff) q += 8;
          if (csize === 0xffffffff) { csize = Number(dv.getBigUint64(q, true)); q += 8; }
          if (lho === 0xffffffff) lho = Number(dv.getBigUint64(q, true));
        }
        e += 4 + sz;
      }
    }
    let name = (flags & 0x800) ? td.decode(nameBytes) : decodeLegacyName(nameBytes);
    // Info-ZIP Unicode Path (0x7075): Windows'un "Sıkıştırılmış klasör"ü gerçek UTF-8 adı buraya yazar
    if (!(flags & 0x800)) {
      let e = p + 46 + nameLen; const end = e + extraLen;
      while (e + 4 <= end) {
        const id = dv.getUint16(e, true), sz = dv.getUint16(e + 2, true);
        if (id === 0x7075 && sz > 5 && u8[e + 4] === 1) { name = td.decode(u8.subarray(e + 9, e + 4 + sz)); break; }
        e += 4 + sz;
      }
    }
    name = fixEscapedName(name.replace(/\\/g, '/'));
    p += 46 + nameLen + extraLen + commLen;
    if (name.endsWith('/') || !filter(name)) continue;
    const lnl = dv.getUint16(lho + 26, true), lel = dv.getUint16(lho + 28, true);
    const start = lho + 30 + lnl + lel;
    const data = u8.subarray(start, start + csize);
    let bytes;
    if (method === 0) bytes = data.slice();
    else if (method === 8) bytes = await inflateRaw(data);
    else continue;
    out.push({ name, bytes });
  }
  return out;
}

// ---------- yazma ----------
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(b) { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

/** files: [{ name, bytes }] -> Blob (application/zip). Adlar UTF-8 bayrağıyla yazılır. */
export function writeZip(files) {
  const te = new TextEncoder();
  const parts = [], central = [];
  let offset = 0;
  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  for (const f of files) {
    const nb = te.encode(f.name);
    const crc = crc32(f.bytes);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x800, true);
    h.setUint16(8, 0, true); h.setUint16(10, dosTime, true); h.setUint16(12, dosDate, true);
    h.setUint32(14, crc, true); h.setUint32(18, f.bytes.length, true); h.setUint32(22, f.bytes.length, true);
    h.setUint16(26, nb.length, true); h.setUint16(28, 0, true);
    parts.push(h.buffer, nb, f.bytes);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x800, true);
    c.setUint16(10, 0, true); c.setUint16(12, dosTime, true); c.setUint16(14, dosDate, true);
    c.setUint32(16, crc, true); c.setUint32(20, f.bytes.length, true); c.setUint32(24, f.bytes.length, true);
    c.setUint16(28, nb.length, true); c.setUint32(42, offset, true);
    central.push(c.buffer, nb);
    offset += 30 + nb.length + f.bytes.length;
  }
  const cdSize = central.reduce((a, b) => a + b.byteLength, 0);
  const e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
  e.setUint32(12, cdSize, true); e.setUint32(16, offset, true);
  return new Blob([...parts, ...central, e.buffer], { type: 'application/zip' });
}
