---
name: muzik-defteri-gelistirme
description: Müzik Defteri (HAKANO45/Muzik-Defteri) PWA uygulamasına özellik ekleme, hata düzeltme, test ve yayınlama. Bu depoda kod değiştirirken her zaman kullan.
---

# Müzik Defteri — geliştirme

Şarkı sözü repertuvarı uygulaması. Eski "MÜZİK DEFTERİ v3.0" (VB6, Ray-Tech) programının yerine geçer.
Windows 11 (Edge/Chrome), iPad ve iPhone (Safari) üzerinde **tek kod** ile çalışan, yüklenebilir, internetsiz açılan bir PWA.

## Değişmez kararlar (kullanıcı istedi — sormadan değiştirme)
- **Önce önizleme resmi:** Arayüzde bir değişikliği yayınlamadan önce iPhone (ve gerekirse masaüstü) ekran görüntüsüyle önce/sonra resmi hazırla, kullanıcıya gönder, "tamam" demeden `main`'e push etme.
- Kullanıcı ~50 yaşında: düğmeler büyük ve belirgin olmalı, küçük gri yazı/ikon ekleme.
- Tema: varsayılan siyah‑altın; kullanıcı ⚙ → Görünüm'den tema/düğme boyutu seçer (`gorunum.json`, tüm cihazlara senkron). Yeni renk kullanırken sabit renk yazma, `:root` değişkenlerini kullan (`--soft`, `--active`, `--on-gold` …) ki tüm temalarda çalışsın; boyutlarda `calc(… * var(--ui))`.
- Arayüz **Türkçe + İngilizce**. Her yeni metin `js/i18n.js` içinde **iki dile birden** eklenir; koda düz metin yazılmaz, `t('anahtar')` kullanılır.
- Dijital saat: masaüstü/iPad üst çubukta ve sahne modunda var; iPhone üst çubuğunda varsayılan olarak ortada "HAKANO REPERTUVAR" yazar (Görünüm'den saate çevrilebilir).
- Sade arayüz. Derleme adımı yok (bundler, npm bağımlılığı yok) — saf ES modülleri. GitHub Pages doğrudan depo kökünü yayınlar.
- Not etiketi sırası (kullanıcı kararı): `🎤 Eylem · 🎵 LAm · BPM 90 · 🥁 Slow 1 Pro · not` — BPM'de emoji yok.
- Ton yazımı: **LAm, REm, FA#m, SI♭** (nota büyük, minör küçük m) — `tonLabel()`; veride `Lam` saklanır, gösterimde çevrilir.
- **iPhone şarkılar için sadece görüntüleme** (`VIEW_ONLY`, user‑agent ile; yatay iPhone dahil). Şarkı ekleme/düzenleme/silme/içe aktarma yalnız Windows, MacBook, iPad. **Klasör işlemleri (⋯ menüsü: yeniden adlandır, yeni, kopyala, taşı, sil) iPhone'da da açık.** Yeni düzenleme özelliği eklersen `VIEW_ONLY` ile gizle ve fonksiyonun başına koruma koy. "İnternette ara" iPhone'da da var.
- Şarkı sözleri bu **public** depoya ASLA girmez. Sözler `HAKANO45/-Muzik-Defteri-Repertuar` (private) deposundadır. Test verisi gerekiyorsa uydurma metin kullan.

## Dosyalar
| Dosya | Görev |
|---|---|
| `index.html` | İskelet: üst çubuk, kenar çubuğu (arama, sekmeler, liste), görüntüleyici, sahne katmanı, modal |
| `css/app.css` | Tüm stil. Renkler `:root` değişkenlerinde. Kırılımlar: 820px (liste ↔ şarkı geçişi) ve **600px = iPhone dikey** (üst araç çubuğu gizli, `#phoneBar` alt çubuk + `openSongSheet()` alt sayfa). iPhone'a özel değişiklik sadece 600px bloğuna; iPad/Windows düzenine dokunma |
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

## Şarkı sözü kaynağı (kesin kural)
Uygulama veya araçlar hiçbir söz sitesinden içerik çekmez/kazımaz (scraping yok). Yeni şarkı akışı: kullanıcı "İnternette ara" ile sayfayı kendisi açar, metni kendisi kopyalar, "Panodan yapıştır" ile ekler. Otomatik söz getirme ancak lisanslı bir API (Musixmatch/LyricFind ticari anahtar, anahtar sunucu tarafında) ile eklenebilir.

## Veri modeli
Şarkı kaydı: `{ p, t, e, n, s, dirty?, del?, up?, upAt?, m }`
- `p` = `repertuar/` içindeki göreli yol (`Türküler/01.Ussak/Haydar Haydar.txt`). Klasörler yoldan türetilir; ayrı klasör kaydı yok (boş yeni klasör = `S.virtualDirs`).
- `t` = metin, satır sonu her zaman `\n`. `n:1` → dosyaya CRLF yazılır. `e` = orijinal kodlama; kaydederken **aynı kodlama** korunur (kodlamada olmayan karakter varsa UTF‑8'e geçer).
- `s` = GitHub blob sha. `dirty` = gönderilmedi. `del` = silinecek işareti. `up/upAt` = gönderildi, paket henüz yetişmedi.
- `_` ile başlayan alanlar (`_title`, `_ft`, `_fx` …) bellekte türetilir, DB'ye yazılmaz (`strip()`).

Şarkı notları (solist/ton/BPM/style) iPhone'da da düzenlenebilir (`openNoteDialog` VIEW_ONLY engeli yok); sadece söz yazma/silme kapalı.

İnternette ara (`webSearch`): sadece Google'ı ayrı pencerede açar + cihaza göre (`DEVICE`) reklamsız/gece okuma ipuçları (`wsTips_*`). Söz sitelerinden içerik çekme, iframe veya ara sunucu YOK — kullanıcı kopyala‑yapıştır ile ekler (yasal).

Ortak Sahne (`openLinkSheet`, `linkConnect`, `linkSend`, durum `L`): ntfy.sh konusu `hakano-sahne-<oda>`; mesaj `{p, by, id, t}` — asla söz gönderme. `openSong` sonunda `linkSend`; uzaktan açılışta `L.applying` döngüyü engeller. Test: `tools/e2e-link.js` (ntfy taklit).

Sıralama: `siralama.json` → klasör başına ad listesi (`orderedChildren`, `moveItem`); sırası olmayanlar alfabetik sona. Liste satırlarında tek dokunuş = aç, çift dokunuş = menü (`addTaps`), basılı tut = menü (`addLongPress`). Çoklu seçim: `S.sel`, `filesCopyMove`, `filesDelete`, `renameSong` (iPhone'da da açık — dosya yönetimi).

Şarkı notları: `notlar.json` → `{ notes: { <yol>: { solist, bpm, ton, style, not, updated, deleted? } } }` — yol başına `updated` ile birleştirilir. Şarkı yeniden adlandırılınca/taşınınca not da taşınır (`replacePathEverywhere`). Toplu taşımada (repertuvar düzenleme) `notlar.json` ve `programlar.json` yolları da güncellenmeli.

Programlar: `{ programs: [{id, name, items:[p], updated, deleted?}], fav: [p], favUpdated }` — senkronda id + `updated` ile birleştirilir; silinen program iz olarak kalır.

## Klasör işlemleri
`renameFolder` / `deleteFolder` → `commitFolderChange` → `GitHub.commitBatch` (Git Data API: ref → commit → trees(base_tree, 2000'lik parçalar, silme = sha:null) → commit → PATCH ref). Önce klasördeki gönderilmemiş şarkılar senkronlanır. Yerelde `remapPaths()` notlar/programlar/favoriler/son açılanları günceller; `markRemoved()` eski paketin eski yolları geri getirmesini 15 dk engeller. Test: `tools/e2e-folders-ops.js`.

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
