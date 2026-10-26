---
name: muzik-defteri-gelistirme
description: Müzik Defteri (HAKANO45/Muzik-Defteri) PWA uygulamasına özellik ekleme, hata düzeltme, test ve yayınlama. Bu depoda kod değiştirirken her zaman kullan.
---

# Müzik Defteri — geliştirme

Şarkı sözü repertuvarı uygulaması. Eski "MÜZİK DEFTERİ v3.0" (VB6, Ray-Tech) programının yerine geçer.
Windows 11 (Edge/Chrome), iPad ve iPhone (Safari) üzerinde **tek kod** ile çalışan, yüklenebilir, internetsiz açılan bir PWA.

## Değişmez kararlar (kullanıcı istedi — sormadan değiştirme)
- Tema **sabit siyah‑altın**. Tema seçici ekleme.
- Arayüz **Türkçe + İngilizce**. Her yeni metin `js/i18n.js` içinde **iki dile birden** eklenir; koda düz metin yazılmaz, `t('anahtar')` kullanılır.
- Üst çubukta **dijital saat** her zaman görünür; sahne modunda da saat var.
- Sade arayüz. Derleme adımı yok (bundler, npm bağımlılığı yok) — saf ES modülleri. GitHub Pages doğrudan depo kökünü yayınlar.
- Şarkı sözleri bu **public** depoya ASLA girmez. Sözler `HAKANO45/-Muzik-Defteri-Repertuar` (private) deposundadır. Test verisi gerekiyorsa uydurma metin kullan.

## Dosyalar
| Dosya | Görev |
|---|---|
| `index.html` | İskelet: üst çubuk, kenar çubuğu (arama, sekmeler, liste), görüntüleyici, sahne katmanı, modal |
| `css/app.css` | Tüm stil. Renkler `:root` değişkenlerinde. Dar ekran kırılımı 820px (iPhone / dikey iPad: liste ↔ şarkı geçişi) |
| `js/app.js` | Durum (`S`), liste/şarkı/editör/sahne çizimi, programlar, senkron, içe/dışa aktarma, klavye |
| `js/db.js` | IndexedDB: `songs` (anahtar `p`) ve `kv` (settings, programs, recent, lastSync, bundleSha) |
| `js/github.js` | GitHub Contents API: paket indirme, dosya yazma/silme, programlar.json |
| `js/encoding.js` | Kodlama tespiti/çözme/geri yazma (cp1254, cp857, utf8, utf8bom, utf16), git blob sha, `#U00fc` ad düzeltme |
| `js/codepages.js` | Üretilmiş tablo — elle düzenleme, `python tools/gen_codepages.py` |
| `js/textutil.js` | `fold()` Türkçe duyarsız arama, `titleOf()`, `tagsOf()` (usul/makam), akor satırı tespiti ve transpoze |
| `js/zip.js` | Kütüphanesiz ZIP okuma (DecompressionStream) ve yazma |
| `js/i18n.js` | TR/EN metinleri |
| `sw.js` | Önbellek (çevrimdışı). **Her yayında `CACHE` sürümünü artır** ve yeni dosya eklediysen `FILES` listesine ekle |
| `manifest.webmanifest`, `icons/` | Yükleme bilgisi; simgeler `python tools/make_icons.py` ile üretilir |

## Veri modeli
Şarkı kaydı: `{ p, t, e, n, s, dirty?, del?, up?, upAt?, m }`
- `p` = `repertuar/` içindeki göreli yol (`Türküler/01.Ussak/Haydar Haydar.txt`). Klasörler yoldan türetilir; ayrı klasör kaydı yok (boş yeni klasör = `S.virtualDirs`).
- `t` = metin, satır sonu her zaman `\n`. `n:1` → dosyaya CRLF yazılır. `e` = orijinal kodlama; kaydederken **aynı kodlama** korunur (kodlamada olmayan karakter varsa UTF‑8'e geçer).
- `s` = GitHub blob sha. `dirty` = gönderilmedi. `del` = silinecek işareti. `up/upAt` = gönderildi, paket henüz yetişmedi.
- `_` ile başlayan alanlar (`_title`, `_ft`, `_fx` …) bellekte türetilir, DB'ye yazılmaz (`strip()`).

Programlar: `{ programs: [{id, name, items:[p], updated, deleted?}], fav: [p], favUpdated }` — senkronda id + `updated` ile birleştirilir; silinen program iz olarak kalır.

## Senkron akışı (`sync()` — sıra önemli)
1. `bundle/repertuar.json.gz` sha'sı değiştiyse indir → `mergeBundle()`. Gönderilmemiş yerel değişiklik **her zaman korunur**; içeriği paketle aynıysa temiz sayılır (ZIP ile içe aktarılan 15 bin dosya böylece yeniden gönderilmez).
2. `dirty` kayıtları tek tek PUT/DELETE (sha çakışmasında son yazan kazanır). 50'den fazlaysa onay ister; sessiz senkronda göndermez.
3. `programlar.json` çek‑birleştir‑yaz.
Paket, private depodaki GitHub Action tarafından her `repertuar/**` değişikliğinde yeniden üretilir.

## Yeni özellik eklerken kontrol listesi
1. Metinler → `i18n.js` (tr + en).
2. Dokunmatik hedefler ≥ 40px; 380px genişlikte yatay kaydırma olmamalı; `env(safe-area-inset-*)` korunur.
3. Klavye/pedal kısayolu ekliyorsan `onKey()` ve `keyboardHelp` metnini güncelle.
4. Kalıcı ayar → `S.settings` + `saveSettings()`; cihaz arası paylaşılacaksa `programlar.json` gibi depoda tut, `localStorage`'a değil.
5. iOS Safari sınırları: `showDirectoryPicker` yok, `webkitdirectory` yok, Fullscreen API iPhone'da yok (sahne modu zaten CSS katmanı), `DecompressionStream` iOS 16.4+.
6. `sw.js` → `CACHE` sürümünü artır, `app.js` → `VERSION` artır.
7. Test et (aşağıda), `docs/ROADMAP.md`'yi güncelle.

## Test
```bash
python3 -m http.server 8765 &          # depo kökünde
node tools/e2e-test.js desk            # 1366x860 masaüstü
node tools/e2e-test.js phone           # iPhone 13 öykünmesi
```
Test GitHub API'yi taklit eder, gerçek paketi `../Muzik-Defteri-Repertuar/bundle/repertuar.json.gz` (veya `BUNDLE=`) okur; ekran görüntülerini `OUT=` klasörüne yazar. Konsol hatası (`ERRORS`) boş olmalı. Ekran görüntülerine bakmadan "bitti" deme.

## Yayınlama
`main`'e push → GitHub Pages (Settings → Pages → Branch: main, / root) → `https://hakano45.github.io/Muzik-Defteri/`. Cihazlar yeni sürümü bir sonraki açılışta "Yeni sürüm hazır → Yenile" bildirimiyle alır.
