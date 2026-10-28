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

// ---- 2. katman: bağlama bakan tahminci (meacer/deasciifier, MIT) — sözlükte olmayan kelimeler için
let GUESS = null;
export async function loadGuesser() {
  if (GUESS) return GUESS;
  const m = await import('./vendor/deasciifier/deasciifier.mjs');
  const pat = await (await fetch(new URL('./vendor/deasciifier/patterns.json', import.meta.url))).json();
  m.Deasciifier.init(pat);
  GUESS = m.Deasciifier;
  return GUESS;
}
export const guesserReady = () => !!GUESS;
let memoIn = null, memoOut = null;
function deasc(text) { if (text !== memoIn) { memoIn = text; memoOut = GUESS.deasciify(text).text; } return memoOut; }

/** pers: kişisel seçimler { acc: {iskelet: doğru}, rej: Set('iskelet>öneri') } */
function candidates(text, lex, pers, useGuess = true) {
  // tahminci sadece hiç ş/ğ/ı içermeyen sözlerde çalışır (asıl sorun bunlar; hem hızlı hem güvenli)
  const g = useGuess && GUESS && (useGuess === 'always' || !/[şğıŞĞ]/.test(text)) ? deasc(text) : null;
  const out = [];
  WORD.lastIndex = 0;
  let m;
  while ((m = WORD.exec(text))) {
    const w = m[0], k = key(w);
    let to = null, src = 'lex';
    const best = (pers && pers.acc && pers.acc[k]) || lex[k];
    if (best && compatible(w, best)) to = applyCase(w, best);
    else if (g && !/[şğıŞĞİ]/.test(w)) {
      const gw = g.substr(m.index, w.length);
      if (gw !== w && /[çğışöüÇĞİŞÖÜ]/.test(gw)) { to = gw; src = 'guess'; }
    }
    if (!to || to === w) continue;
    if (pers && pers.rej && pers.rej.has(k + '>' + trLower(to))) continue;
    out.push({ i: m.index, w, to, src });
  }
  return out;
}

/** Metindeki düzeltilebilir kelimeler: [{ from, to, n, src }] (aynı kelime bir kez, sayısıyla). src: lex | guess */
export function suggest(text, lex, pers, useGuess = true) {
  const m = new Map();
  for (const c of candidates(text, lex, pers, useGuess)) {
    const e = m.get(c.w); if (e) e.n++; else m.set(c.w, { from: c.w, to: c.to, n: 1, src: c.src });
  }
  return [...m.values()];
}
/** Sadece kabul edilen kelimeleri değiştirir (skip: istenmeyen "from" kümesi). */
export function applyFixes(text, lex, skip = new Set(), pers, useGuess = true) {
  let out = '', last = 0;
  for (const c of candidates(text, lex, pers, useGuess)) {
    if (skip.has(c.w)) continue;
    out += text.slice(last, c.i) + c.to; last = c.i + c.w.length;
  }
  return out + text.slice(last);
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
export function fixAll(text, lex, { turkish = true, upper = false, blank = true, skip, pers, guess = true } = {}) {
  let out = text;
  if (turkish) out = applyFixes(out, lex, skip, pers, guess);
  if (upper) out = toSentence(out);
  if (blank) out = tidyBlank(out);
  return out;
}
/** Dosya adı (uzantısız): sadece Türkçe harf; ş/ğ/ı içeren ad doğru sayılır. */
export function fixName(stem, lex, pers) {
  if (/[şğıŞĞİ]/.test(stem)) return stem;
  return applyFixes(stem, lex, undefined, pers).replace(/[\\/:*?"<>|]/g, '');
}
