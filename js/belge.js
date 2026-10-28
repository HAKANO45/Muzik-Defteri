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
  const USUL = /^\d{1,2}\s*[-/]\s*\d{1,2}$/;
  const pages = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const tc = await page.getTextContent();
    pages.push({ W: page.getViewport({ scale: 1 }).width, items: tc.items.filter(it => it.str && it.str.trim()).map(it => ({
      s: it.str, x: it.transform[4], y: it.transform[5], w: it.width, size: Math.hypot(it.transform[2], it.transform[3]) || it.height })) });
  }
  const docBody = median(pages.flatMap(p => p.items.map(i => Math.round(i.size)))) || 12;
  const songs = [];
  let cover = '', cur = null, started = false;
  for (const { W, items: all } of pages) {
    // kapak yazısı: belgenin gövde yazısının 2 katından büyük, ilk şarkıdan önce → klasör adı
    const big = all.filter(i => i.size >= docBody * 2);
    let items = all;
    if (!started && big.length) {
      if (!cover) {
        // kapak satırları yukarıdan aşağı; tek kelimelik ad ("HAKAN") başka çok kelimeli satır varsa atlanır
        const cl = [...big].sort((a, b) => b.y - a.y || a.x - b.x).map(i => i.s.trim()).filter(Boolean);
        const multi = cl.filter(x => x.split(/\s+/).length > 1);
        cover = (multi.length ? multi : cl).join(' ');
      }
      items = all.filter(i => i.size < docBody * 2);
    }
    if (!items.length) continue;
    // sütun sınırı: sayfanın sağ tarafında en az 3 satırın başladığı ilk x
    let boundary = 0;
    const xs = [...new Set(items.filter(i => i.x > W * 0.4).map(i => Math.round(i.x)))].sort((a, b) => a - b);
    for (const x of xs) if (items.filter(i => Math.abs(i.x - x) <= 3).length >= 3) { boundary = x - 4; break; }
    const cols = boundary ? [items.filter(i => i.x < boundary), items.filter(i => i.x >= boundary)] : [items];
    const segs = [];
    cols.forEach((col, ci) => {
      if (!col.length) return;
      const lines = [];
      for (const it of [...col].sort((a, b) => b.y - a.y || a.x - b.x)) {
        const L = lines.find(l => Math.abs(l.y - it.y) < Math.max(2, it.size * 0.45));
        if (L) L.items.push(it); else lines.push({ y: it.y, items: [it] });
      }
      lines.sort((a, b) => b.y - a.y);
      for (const l of lines) {
        l.items.sort((a, b) => a.x - b.x);
        l.size = Math.max(...l.items.map(i => i.size));
        const main = l.items.filter(i => i.size >= l.size * 0.75);
        let text = '', end = null;
        for (const it of main) { if (end !== null && it.x - end > it.size * 0.2 && !text.endsWith(' ')) text += ' '; text += it.s; end = it.x + it.w; }
        l.text = text.replace(/\s+$/, ''); l.small = l.items.filter(i => i.size < l.size * 0.75).map(i => i.s.trim()).filter(Boolean);
      }
      const body = median(lines.map(l => l.size)) || docBody;
      const step = median(lines.slice(1).map((l, i) => lines[i].y - l.y).filter(g => g > 0)) || body * 1.25;
      const isT = l => l.size >= body * 1.08 && l.text.trim().length < 70;
      let seg = null;
      for (let i = 0; i < lines.length; i++) {
        const l = lines[i];
        if (isPageNo(l.text)) continue;
        if (isT(l)) {
          if (seg && seg.title && !seg.lines.length) { seg.title.push(l); continue; }     // çok satırlı başlık
          seg = { y: l.y, col: ci, title: [l], lines: [] }; segs.push(seg); continue;
        }
        if (!seg) { seg = { y: l.y, col: ci, title: null, lines: [] }; segs.push(seg); }
        if (seg.lines.length && lines[i - 1] && lines[i - 1].y - l.y > step * 1.5) seg.lines.push('');
        seg.lines.push(l.text);
      }
    });
    // okuma sırası: satır satır (aynı yükseklikteki kutular soldan sağa), sonra aşağı
    segs.sort((a, b) => (Math.abs(a.y - b.y) < docBody * 3 ? a.col - b.col : b.y - a.y));
    for (const sg of segs) {
      if (sg.title) {
        let title = sg.title.map(l => l.text.trim()).join(' ').replace(/\s+/g, ' ');
        const smalls = sg.title.flatMap(l => l.small);
        const usul = smalls.find(x => USUL.test(x));
        const extra = smalls.filter(x => !USUL.test(x) && !isPageNo(x)).join(' ');
        if (extra) title += ' (' + extra + ')';
        if (usul) title = usul.replace(/\s+/g, '').replace('/', '-') + ' ' + title;   // "5-8 Cerrahpaşa" → uygulama 5/8 etiketi takar
        cur = { title, lines: [] }; songs.push(cur); started = true;
      }
      if (cur) { if (!sg.title && cur.lines.length) cur.lines.push(''); cur.lines.push(...sg.lines); }   // başlıksız kutu: önceki şarkının devamı
    }
  }
  const base = (fileName || '').replace(/\.pdf$/i, '').replace(/_/g, ' ');
  return {
    folder: folderFromTitle(cover || base),
    songs: songs.map(s => ({ title: safeName(s.title), text: clean(s.lines) })).filter(s => s.title && s.text.trim()),
  };
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
