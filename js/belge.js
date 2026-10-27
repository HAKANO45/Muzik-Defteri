// 📄 PDF / Word (.docx) içe aktarma — tamamen cihazda çalışır, dosya hiçbir yere gönderilmez.
// Kural: belge = klasör (kapak başlığı ya da dosya adı), büyük/kalın/renkli başlık = yeni şarkı.
// İki sütunlu düzen (PDF) ve tablo hücreleri (Word) ayrı ayrı okunur. Resimler ve sayfa numaraları atlanır.
import { readZip } from './zip.js';

/** "Roman 9-8 Ege Havalari" -> "9-8 Roman Ege Havalari" (usul başa: uygulama etiketi kendisi takar) */
export function folderFromTitle(title) {
  let t = (title || '').replace(/\s+/g, ' ').replace(/[\\/:*?"<>|]/g, '').trim();
  const m = t.match(/(?:^|\s)(\d{1,2}\s*[-/]\s*\d{1,2})(?=\s|$)/);
  if (m && t.indexOf(m[1]) > 0) t = (m[1].replace(/\s+/g, '').replace('/', '-') + ' ' + t.replace(m[1], '')).replace(/\s+/g, ' ').trim();
  return t.slice(0, 80);
}
export function safeName(s) { return (s || '').replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim().slice(0, 90); }
const isPageNo = s => /^\s*(sayfa\s*)?\d{1,4}\s*$/i.test(s);
function clean(lines) {
  const out = lines.map(l => l.replace(/\s+$/, '')).filter(l => !isPageNo(l));
  while (out.length && !out[0].trim()) out.shift();
  while (out.length && !out[out.length - 1].trim()) out.pop();
  return out.join('\n').replace(/\n{3,}/g, '\n\n');
}
function median(a) { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; }

// ------------------------------------------------------------------ Word (.docx)
export async function parseDocx(buf, fileName) {
  const files = await readZip(buf, n => n === 'word/document.xml');
  if (!files.length) throw new Error('word/document.xml yok');
  const xml = new DOMParser().parseFromString(new TextDecoder().decode(files[0].bytes), 'application/xml');
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const kids = (el, name) => [...el.children].filter(c => c.namespaceURI === W && c.localName === name);
  const attr = (el, name) => el && (el.getAttributeNS(W, name) || el.getAttribute('w:' + name));
  const para = p => {
    let text = '', big = 0, bold = 0, color = 0, len = 0;
    for (const r of p.getElementsByTagNameNS(W, 'r')) {
      const rPr = kids(r, 'rPr')[0];
      let tx = '';
      for (const c of r.children) {
        if (c.localName === 't') tx += c.textContent;
        else if (c.localName === 'tab') tx += ' ';
        else if (c.localName === 'br' || c.localName === 'cr') tx += '\n';
      }
      if (!tx) continue;
      const sz = rPr && kids(rPr, 'sz')[0] ? +attr(kids(rPr, 'sz')[0], 'val') / 2 : 0;
      const b = rPr && kids(rPr, 'b')[0] && attr(kids(rPr, 'b')[0], 'val') !== '0' && attr(kids(rPr, 'b')[0], 'val') !== 'false';
      const col = rPr && kids(rPr, 'color')[0] ? attr(kids(rPr, 'color')[0], 'val') : '';
      const n = tx.trim().length;
      len += n; if (b) bold += n; if (col && !/^(000000|auto)$/i.test(col)) color += n; big = Math.max(big, sz);
      text += tx;
    }
    return { text, size: big, bold: len && bold / len > 0.6, color: len && color / len > 0.6 };
  };
  // gövde sırası: paragraf ya da tablo (her hücre ayrı blok)
  const blocks = [];      // [[para...], ...]  hücre/akış
  const flow = [];
  const walk = body => {
    for (const el of body.children) {
      if (el.localName === 'p') flow.push(para(el));
      else if (el.localName === 'tbl') {
        if (flow.length) blocks.push(flow.splice(0));
        for (const tr of el.getElementsByTagNameNS(W, 'tr')) for (const tc of kids(tr, 'tc')) {
          const ps = [...tc.getElementsByTagNameNS(W, 'p')].map(para);
          if (ps.some(p => p.text.trim())) blocks.push(ps);
        }
      } else if (el.localName === 'sdt') { const c = el.getElementsByTagNameNS(W, 'sdtContent')[0]; if (c) walk(c); }
    }
  };
  walk(xml.getElementsByTagNameNS(W, 'body')[0]);
  if (flow.length) blocks.push(flow.splice(0));
  const sizes = blocks.flat().filter(p => p.text.trim() && p.size).map(p => p.size);
  const body = median(sizes) || 12;
  const isTitle = p => p.text.trim() && p.text.trim().length < 70 && (p.size >= body * 1.2 || p.bold || p.color);
  return splitSongs(blocks.map(b => b.map(p => ({ text: p.text, title: isTitle(p), size: p.size || body }))), fileName, body);
}

// ------------------------------------------------------------------ PDF
let pdfjs = null;
async function loadPdfjs() {
  if (pdfjs) return pdfjs;
  pdfjs = await import('./vendor/pdfjs/pdf.min.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;
  return pdfjs;
}
export async function parsePdf(buf, fileName) {
  const lib = await loadPdfjs();
  const doc = await lib.getDocument({ data: new Uint8Array(buf), isEvalSupported: false }).promise;
  const blocks = [];
  let allSizes = [];
  const pages = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const vp = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    const items = tc.items.filter(it => it.str && it.str.trim()).map(it => {
      const font = tc.styles[it.fontName] || {};
      return { s: it.str, x: it.transform[4], y: it.transform[5], w: it.width, size: Math.hypot(it.transform[2], it.transform[3]) || it.height,
        bold: /bold|black|heavy/i.test((font.fontFamily || '') + ' ' + (it.fontName || '')) };
    });
    allSizes = allSizes.concat(items.map(i => Math.round(i.size)));
    pages.push({ items, W: vp.width });
  }
  const body = median(allSizes) || 12;
  for (const { items, W } of pages) {
    // sütunlar: sayfanın iki yarısında da yazı varsa ikiye böl
    const mid = W / 2;
    const left = items.filter(i => i.x < mid - 5), right = items.filter(i => i.x >= mid - 5);
    const twoCols = left.length >= 2 && right.filter(i => !isPageNo(i.s)).length >= 2;
    const cols = twoCols ? [left, right] : [items];
    // satırlar
    const colLines = cols.map(col => {
      const lines = [];
      for (const it of [...col].sort((a, b) => b.y - a.y || a.x - b.x)) {
        const L = lines.find(l => Math.abs(l.y - it.y) < Math.max(2, it.size * 0.4));
        if (L) L.items.push(it); else lines.push({ y: it.y, items: [it] });
      }
      return lines.sort((a, b) => b.y - a.y).map(l => {
        l.items.sort((a, b) => a.x - b.x);
        let text = '', end = null;
        for (const it of l.items) { if (end !== null && it.x - end > it.size * 0.25 && !text.endsWith(' ')) text += ' '; text += it.s; end = it.x + it.w; }
        const size = Math.max(...l.items.map(i => i.size));
        return { text, y: l.y, size, bold: l.items.every(i => i.bold), gap: 0 };
      });
    });
    // boşluk = boş satır (büyük dikey aralık)
    for (const lines of colLines) for (let i = 1; i < lines.length; i++) lines[i].gap = lines[i - 1].y - lines[i].y;
    // okuma sırası: aynı yükseklikte başlayan hücreler satır satır (sol, sağ)
    const segs = [];
    colLines.forEach((lines, ci) => {
      let cur = null;
      for (const l of lines) {
        const title = l.text.trim().length < 70 && (l.size >= body * 1.2 || (l.bold && l.size >= body * 1.05));
        if (title || !cur) { cur = { y: l.y, col: ci, lines: [] }; segs.push(cur); }
        cur.lines.push({ text: l.text, title, size: l.size, gap: l.gap });
      }
    });
    segs.sort((a, b) => (Math.abs(a.y - b.y) < body * 2 ? a.col - b.col : b.y - a.y));
    for (const s of segs) blocks.push(s.lines.map((l, i) => ({ text: (i && l.gap > l.size * 1.9 ? '\n' : '') + l.text, title: l.title, size: l.size })));
  }
  return splitSongs(blocks, fileName, body);
}

// ------------------------------------------------------------------ ortak: bloklardan şarkılar
function splitSongs(blocks, fileName, body) {
  const all = blocks.flat().filter(p => p.text.trim());
  // kapak: en büyük yazı (gövdenin 2 katı) ve ilk sayfada → klasör adı
  const maxSize = Math.max(...all.map(p => p.size || 0), 0);
  let folderTitle = '';
  if (maxSize >= body * 2) {
    const cover = all.filter(p => p.size >= maxSize * 0.85).slice(0, 3).map(p => p.text.trim());
    folderTitle = cover.join(' ');
  }
  const songs = [];
  let cur = null;
  for (const b of blocks) {
    for (const p of b) {
      const tx = p.text.replace(/ /g, ' ');
      if (!tx.trim()) { if (cur) cur.lines.push(''); continue; }
      if (folderTitle && p.size >= maxSize * 0.85) continue;          // kapak yazısı şarkı değil
      if (p.title) { cur = { title: tx.trim().replace(/\s+/g, ' '), lines: [] }; songs.push(cur); continue; }
      if (!cur) continue;                                                // başlıksız giriş yazısı atlanır
      for (const line of tx.split('\n')) cur.lines.push(line);
    }
    if (cur) cur.lines.push('');                                        // hücre sonu
    if (blocks.length > 1) cur = cur && cur.lines.some(l => l.trim()) ? null : cur;   // yeni hücre: önceki başlık bitti
  }
  const base = (fileName || '').replace(/\.(pdf|docx)$/i, '');
  return {
    folder: folderFromTitle(folderTitle || base),
    songs: songs.map(s => ({ title: safeName(s.title), text: clean(s.lines) })).filter(s => s.title && s.text.trim()),
  };
}

export async function parseDocument(file) {
  const buf = await file.arrayBuffer();
  if (/\.pdf$/i.test(file.name)) return parsePdf(buf, file.name);
  if (/\.docx$/i.test(file.name)) return parseDocx(buf, file.name);
  throw new Error('desteklenmeyen dosya: ' + file.name);
}
