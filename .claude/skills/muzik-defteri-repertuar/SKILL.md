---
name: muzik-defteri-repertuar
description: Müzik Defteri repertuvarına (HAKANO45/-Muzik-Defteri-Repertuar, private) şarkı/klasör ekleme, toplu dosya içe aktarma, kodlama ve ad düzeltme, paket (bundle) üretme. Kullanıcı yeni şarkı sözü dosyaları verdiğinde kullan.
---

# Müzik Defteri — repertuvar dosyaları

Şarkı sözleri **private** `HAKANO45/-Muzik-Defteri-Repertuar` deposundadır. Telifli metin: asla public depoya, sohbete toplu halde veya herkese açık bir sayfaya koyma.

## Depo yapısı
```
repertuar/            şarkılar (.txt), klasör = kategori
bundle/repertuar.json.gz   uygulamanın indirdiği paket (Action üretir — elle düzenleme)
programlar.json       programlar (setlist) + favoriler; uygulama yazar
notlar.json           şarkı notları: solist, ton, kısa not (yol → not); uygulama yazar
siralama.json         kullanıcının klasör içi sırası: { order: { <klasör>: { names:[…], updated } } }; uygulama yazar
tools/build_bundle.py paket üretici
tools/fix_filenames.py  "#U00fc" -> "ü" ad düzeltici
legacy/               eski VB6 programı (sadece referans)
.github/workflows/bundle.yml  repertuar/** değişince paketi yeniden üretir
```

## Klasör yapısı (kullanıcı kararı 27.10.2026 sabah — bozma)
- **Eski klasör düzeni aynen geçerli** (`Türküler`, `1.Oyun Havalari`, `2.Slov Fantazi Tsm`, `Halay`, `KINA`, `Yeni/MUSTY-2016/…`, `Yeni/DÜĞÜN/…`, `muzik2` …). Kopyalar dahil, kullanıcı kendisi düzeltecek. **Toplu otomatik yeniden düzenleme, kopya silme, toplu taşıma YAPMA** — kullanıcı açıkça istemedikçe.
- Ek olarak `Sanatçılar/<Sanatçı>/` klasörü var (56 sanatçı, 2.266 şarkı; Türkçe harfleri düzeltilmiş kopyalar). Kullanıcı bunu tutmak istedi.
- Usul dosya/klasör adının başında (`5-8 SARI GELIN.TXT`, `9-8/…`), makam klasörleri (`01.Ussak` …) → uygulama etiketleri.
- Dosya adı = şarkı adı. Windows'ta yasak karakterler `\ / : * ? " < > |` kullanılmaz.
- Geçmiş: 27.10 gece temiz deftere geçildi (tools/duzenle.py) → kullanıcı parçaları bulamadı → sabah eski düzene dönüldü (tools/eski_duzen_geri.py). Eski arşiv `eski-arsiv-2026-10-27` dalında.

## Taşıma / silme kuralı
Bir şarkı dosyası taşınır, yeniden adlandırılır veya kopyası silinirse `programlar.json` (items + fav) ve `notlar.json` içindeki eski yollar **aynı commit'te** yeni/kalan yola çevrilir. Hiçbir program şarkı, hiçbir not sahibini kaybetmez.

## Kodlama
Mevcut 15.823 dosya: Windows‑1254 (14.347), DOS Türkçe CP857 (977), ASCII (451), UTF‑16 (36), UTF‑8 (12).
- **Var olan dosyanın baytlarını dönüştürme** — uygulama ve `build_bundle.py` hepsini doğru okur; `.gitattributes` git'in dönüşüm yapmasını engeller (`repertuar/** -text`).
- Yeni dosyalar UTF‑8 (BOM'suz), satır sonu CRLF olabilir.
- Tespit kuralı (`detect`): BOM → UTF‑8/16; geçerli UTF‑8 → utf8; değilse Türkçe harf baytları sayılır: CP857 (`81 87 a7 8d 9f 94 …`) > Windows‑1254 (`fc e7 f0 fd fe f6 …`) ise cp857.

## Toplu dosya ekleme (kullanıcı ZIP/klasör verirse)
1. Ayrı boş klasöre aç. Adlarda `#U00fc` gibi kaçışlar varsa: `python tools/fix_filenames.py <klasör>` (önizleme) → `--apply`.
2. Sadece `.txt` dosyalarını `repertuar/<hedef>/` altına kopyala. `.doc/.pptx/.rtf` uygulamada görünmez (paket sadece .txt alır) — kullanıcıya söyle.
3. Kopya kontrolü: aynı katlanmış başlık zaten varsa (ör. `KARA TREN.TXT` ve `kara tren.txt`) kullanıcıya listele, kendiliğinden silme.
4. `python tools/build_bundle.py` çalıştır, sayıyı ve kodlama dağılımını kontrol et.
5. Commit + push. Action paketi yeniden üretir; uygulamada ⟳ Senkronize et.

Tek tük şarkıları kullanıcı uygulamadan da ekleyebilir (＋♪, .txt / ZIP içe aktar) — uygulama bunları GitHub'a kendisi yükler.

## Analiz
`python -I tools/build_bundle.py` çıktısındaki sayı = uygulamadaki şarkı sayısı. Kodlama dağılımı için paketi okuyup `e` alanını say.
