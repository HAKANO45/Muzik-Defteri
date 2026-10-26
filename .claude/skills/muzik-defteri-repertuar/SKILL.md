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
tools/build_bundle.py paket üretici
tools/fix_filenames.py  "#U00fc" -> "ü" ad düzeltici
legacy/               eski VB6 programı (sadece referans)
.github/workflows/bundle.yml  repertuar/** değişince paketi yeniden üretir
```

## Klasör ve ad kuralları (mevcut düzen — bozma)
- Üst klasörler: `Türküler`, `1.Oyun Havalari`, `2.Slov Fantazi Tsm`, `Halay`, `KINA`, `Ciftetelli`, `9-8 Roman`, `Yeni`, … Yeni dosyayı en uygun mevcut klasöre koy; emin değilsen kullanıcıya sor.
- Usul dosya veya klasör adının başında: `5-8 SARI GELIN.TXT`, `9-8/…`. Uygulama bunu `5/8` etiketine çevirir (`textutil.js → tagsOf`).
- Makam klasörleri: `01.Ussak`, `02.Kürdi`, `03.Hicaz`, `04.Nihavent`, `Rast`… → `Uşşak`, `Kürdi` etiketleri.
- Sanatçı klasörleri: `Türküler/Neset Ertas`, `2.Slov Fantazi Tsm/Orhan Gencebay` …
- Baştaki sıra numarası (`01.`, `3.`) görünen başlıktan atılır; sıralama için kullanılabilir.
- Dosya adı = şarkı adı. Windows'ta yasak karakterler `\ / : * ? " < > |` kullanılmaz.

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
