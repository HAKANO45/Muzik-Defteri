// 🔤 Türkçe harf düzeltici — tools/turkce_harf.py (data deposu) ile aynı kurallar.
// Sözlük (bundle/sozluk.json.gz) repertuvardaki doğru yazılmış şarkılardan çıkarılır; internet/tahmin yok.
// Emin olunmayan kelimeye dokunulmaz; satır, boşluk, noktalama, büyük/küçük harf korunur.

const FOLD = { 'ş': 's', 'ğ': 'g', 'ı': 'i', 'ç': 'c', 'ö': 'o', 'ü': 'u', 'â': 'a', 'î': 'i', 'û': 'u' };
export const WORD = /[A-Za-zÇĞİÖŞÜçğıöşüÂÎÛâîû]+/g;

export function trLower(w) { return w.replace(/I/g, 'ı').replace(/İ/g, 'i').toLowerCase(); }
export function trUpper(w) { return w.replace(/i/g, 'İ').replace(/ı/g, 'I').toUpperCase(); }
export function key(w) { return trLower(w).replace(/ı/g, 'i').replace(/[şğıçöüâîû]/g, c => FOLD[c]); }

const isUpperWord = w => w.length > 1 && w === w.toUpperCase() && w !== w.toLowerCase();
const isUpperChar = c => c === c.toUpperCase() && c !== c.toLowerCase();

function compatible(orig, cand) {
  if (orig.length !== cand.length) return false;
  for (let i = 0; i < orig.length; i++) {
    const a = orig[i], b = cand[i];
    let ok;
    if (a === 'I') ok = b === 'ı' || b === 'i';
    else if (a === 'İ') ok = b === 'i';
    else {
      const al = a.toLowerCase();
      ok = 'çöüşğıâîû'.includes(al) ? al === b : key(al) === key(b);
    }
    if (!ok) return false;
  }
  return true;
}
function applyCase(orig, cand) {
  // çoğu harfi büyük olan kelime ("CiNGENEM", "iC") tamamen büyük yazılır; değilse harf harf korunur
  const ups = [...orig].filter(isUpperChar).length;
  if (orig.length > 1 && ups * 2 >= orig.length) return trUpper(cand);
  return [...cand].map((c, i) => isUpperChar(orig[i]) ? trUpper(c) : c).join('');
}

/** Metindeki düzeltilebilir kelimeler: [{ from, to, n }] (aynı kelime bir kez, sayısıyla). */
export function suggest(text, lex) {
  const m = new Map();
  for (const w of text.match(WORD) || []) {
    const cand = lex[key(w)];
    if (!cand || !compatible(w, cand)) continue;
    const nw = applyCase(w, cand);
    if (nw === w) continue;
    const e = m.get(w); if (e) e.n++; else m.set(w, { from: w, to: nw, n: 1 });
  }
  return [...m.values()];
}
/** Sadece kabul edilen kelimeleri değiştirir (skip: istenmeyen "from" kümesi). */
export function applyFixes(text, lex, skip = new Set()) {
  return text.replace(WORD, w => {
    if (skip.has(w)) return w;
    const cand = lex[key(w)];
    if (!cand || !compatible(w, cand)) return w;
    return applyCase(w, cand);
  });
}

/** Sözlerin çoğu BÜYÜK HARF mi? */
export function mostlyUpper(text) {
  const letters = text.match(/\p{L}/gu) || [];
  if (letters.length < 20) return false;
  return letters.filter(isUpperChar).length / letters.length > 0.8;
}
/** BÜYÜK HARF → normal yazı (her satırın ilk harfi büyük). */
export function toSentence(text) {
  return text.split('\n').map(line => {
    const low = line.toLocaleLowerCase('tr');
    return low.replace(/^(\s*["'“(]?)(\p{L})/u, (m, a, c) => a + c.toLocaleUpperCase('tr'));
  }).join('\n');
}
/** Satır sonu boşlukları, 2'den fazla boş satır, baştaki/sondaki boş satırlar. */
export function tidyBlank(text) {
  const endNl = /\n\s*$/.test(text);
  const out = text.replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '').replace(/\n+$/, '');
  return endNl ? out + '\n' : out;          // dosya sonundaki tek satır sonu korunur
}

/** Hepsi bir arada: { text, words:[...], upper:bool } */
export function fixAll(text, lex, { turkish = true, upper = false, blank = true, skip } = {}) {
  let out = text;
  if (turkish) out = applyFixes(out, lex, skip);
  if (upper) out = toSentence(out);
  if (blank) out = tidyBlank(out);
  return out;
}
/** Dosya adı (uzantısız): sadece Türkçe harf; ş/ğ/ı içeren ad doğru sayılır. */
export function fixName(stem, lex) {
  if (/[şğıŞĞİ]/.test(stem)) return stem;
  return applyFixes(stem, lex).replace(/[\\/:*?"<>|]/g, '');
}
