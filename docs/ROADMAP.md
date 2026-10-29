# Yol haritası

## v5.12.2 — tamam (önizlemeyle onaylandı)
- Ton Defteri: Usul satırı (2/4 3/4 4/4 5/8 6/8 7/8 9/8 10/8), ＋ ile kendi usul/tarz düğmesini ekleme (`tonlar.json` → `extra`, senkron); eski "9-8" tarzı 9/8 usulü sayılır; rozet usul gösterir.
- Ayarlar'da "🎼 Ton Defteri'ni aç / gizle" düğmesi (basılı tutma Mac'te zor). Masaüstünde 5 sekme iki satır.

## v5.12.1 — tamam (önizlemeyle onaylandı)
- Ton Defteri kenar çubuğunda sekme: 🎼 Ton (kilit açıkken görünür, cihazda hatırlanır `md.tonOpen`); dokun → sözler, ‹ › ton listesinin sırasıyla (playlist gibi); 🔒 sekmeyi gizler.

## v5.12.0 — tamam (önizlemeyle onaylandı)
- 🎼 Ton Defteri (gizli): başlığa 2 sn basılı tut → Eylem / Hakan / Düet listeleri; tarza göre gruplu (A–Z düğmesi), arama, ton kutusu; ＋ Ekle (ton düğmeleri, tarz, BPM TAP) telefonlarda da; 📋 Excel/E-Tablolar'dan yapıştır; sözü olan şarkıya dokun → açılır; kilit açıkken sözlerde ton rozetleri. `js/tonlar.js`, `tonlar.json` (öğe başına birleşim). İlk veri: Eylem 34 şarkı.

## v5.11.0 — tamam (önizlemeyle onaylandı)
- Düzelt 2. katman: bağlama bakan tahminci (meacer/deasciifier, MIT, `js/vendor/deasciifier`) — sözlükte olmayan kelimeler turuncu "tahmin". Toplu düzeltmede sadece ş/ğ/ı içermeyen şarkılarda (hız), tek şarkıda her zaman.
- Kişisel seçimler: ✕ = bir daha önerilmez, ✓ tahmin = kesin (`kisisel-sozluk.json`, birleşim senkron).
- Ayarlar: "Türkçe harfi eksik görünen şarkılar" sayacı + klasör listesi → toplu düzelt. Klasör taraması parça parça (UI donmaz).

## v5.10.2 — tamam (önizlemeyle onaylandı)
- Sürükle-bırak ile klasöre taşıma (Mac/Windows): şarkıyı ya da ☑ seçilenlerin hepsini bir klasör satırının veya "Repertuvar" yazısının üstüne bırak → onay → tek commit (`dropMove`, `dropTarget`, sürüklenenler bellekte: Safari).

## v5.10.1 — tamam (önizlemeyle onaylandı)
- Ağaçta ↕ sıralama: açık klasörlerin içindeki şarkı/klasörler ▲▼ ve (masaüstünde) sürükle-bırak ile kendi klasöründe; ☑ seçim ağaçta (farklı klasörlerden seçip birlikte taşı/kopyala/sil). Kaydırma yeri korunur.

## v5.10.0 — tamam (önizlemeyle onaylandı)
- 📄 PDF / Word (.docx) içe aktar (`js/belge.js`, pdf.js legacy `js/vendor/pdfjs`, cihazda): her dosya klasör (kapak yazısı, usul başa), başlık = şarkı, uyarlanır sütun sınırı, çok satırlı başlık, küçük usul yazısı (5-8) dosya adının başına, 2×2 ızgara sırası; önizleme (tik, ad düzeltme, "zaten var"), tek commit, klasör sırası PDF sırası. Gerçek PDF ile test (Karadeniz_2023: 11 şarkı). Eski .doc ve taranmış PDF desteklenmez.

## v5.9.0 — tamam (önizlemeyle onaylandı)
- 🔤 Düzelt: düzenleme ekranında Türkçe harf önerileri (✓/✕), BÜYÜK→normal yazı, fazla boş satır, dosya adı; klasör menüsünde toplu "Türkçe harf düzelt" (liste → onay → tek commit, kodlama korunur, yollar remap). Sözlük `bundle/sozluk.json.gz` (data deposu `tools/build_sozluk.py`, Action üretir; ≥3 geçiş, %90 baskın, tümü büyük harf kelimeler sayılmaz). `js/turkce.js`.
- commitBatch: yeni blob'lar 6'şar paralel.
- Sırada: 📄 PDF/Word içe aktar (pdf.js, .docx), 🧹 Kopya tarama, ayarlar a–f.

## v5.8.0 — tamam (önizlemeyle onaylandı)
- Görünüm → Yazım: klasör adları / şarkı adları / sözler için Olduğu gibi · BÜYÜK HARF · Baş Harfler Büyük (sözlerde Normal yazı). Sadece görünüş (`caseText`, `showTitle`, `showFolder`), Türkçe kural, gorunum.json ile senkron.
- Sırada: 🔤 Düzelt, 🧹 Kopya tarama, ayarlar a–f (çöp kutusu, yedek ZIP, açılış, pedal, kopya uyarısı, okunaklı yazı), GitHub Desktop yardımı.

## v5.7.0 — tamam (önizlemeyle onaylandı)
- Klasör ağacı: klasöre tek dokunuş içini hemen altında açar/kapatır (▸/▾, girinti); çift dokunuş → menü (Aç = klasör sayfası). Açık klasörler hatırlanır (`md.openDirs`); ⌂ hepsini kapatır.
- ⌂ geniş ekranlarda da (Mac, iPad, Windows).
- Sözlerdeki görünmez kontrol karakterleri (DOS Ctrl‑Z 0x1A, 559 dosyada) ekranda gizlenir; dosyaya dokunulmaz.
- Testler: klasöre girmek için `window.__mdGo(yol)`.

## v5.6.0 — tamam (önizlemeyle onaylandı)
- Programlar'da ↕ Sırala: programların sırası (`programlar.json` → `order`, `orderUpdated`) ve program içi şarkı sırası büyük ▲▼✕ ile; normal görünümde küçük oklar kalktı.
- 5.5.1: 🔗 düğmesi eski önbellekli index.html'de de eklenir.

## v5.5.0 — tamam (önizlemeyle onaylandı)
- 🔗 Ortak Sahne: iki cihaz aynı oda koduyla bağlanır; biri şarkı açınca öteki de açar (karşılıklı / takip et / ben yönetirim). Aracı ntfy.sh (SSE + POST), sadece şarkı yolu gider. Oda kodu data deposunda `sahne.json`. Kapalıyken hiçbir şey yapmaz; internet koparsa sadece takip durur. Gerçek ntfy ile saha testi bekliyor.

## v5.4.0 — tamam (önizlemeyle onaylandı)
- İnternette ara sayfası: Google ayrı pencerede ("şarkı sözleri" eklenir); cihaza göre reklamsız + gece modu okuma ipuçları (iPhone/iPad Safari Okuyucu, Android Chrome Okuma modu, Windows Edge F9, Mac Safari). Uygulama içerik çekmez (yasal: kopyala‑yapıştır). Brave/Google arama API'leri değerlendirildi: Google JSON API yeni kullanıcı almıyor (1.1.2027 kapanıyor), Brave anahtarı istemcide olmamalı → ara sunucu gerekir; şimdilik yok.
- Android telefonlar iPhone gibi: görüntüleme + not + dosya yönetimi.

## v5.3.1 — tamam (önizlemeyle onaylandı)
- iPhone ⋯ menüsünde büyük Not düğmesi: solist, ton, BPM (TAP), style, kısa not iPhone'dan da düzenlenir (söz düzenleme hâlâ kapalı).

## v5.3.0 — tamam (önizlemeyle onaylandı)
- ↕ Kendi sıralama: klasör başına ▲▼ ile sıra, `siralama.json` ile tüm cihazlara senkron; A→Z sıfırlar. Klasörler üstte, şarkılar altta.
- ☑ Çoklu seçim: kopyala / taşı (klasör seçici) / yeniden adlandır (tek) / sil — tek commit, blob sha yeniden kullanılır; programlar, notlar, favoriler yeni yola çevrilir.
- Çift dokunuş → menü (şarkı, klasör, program); basılı tutma da çalışır. Tek dokunuş ~260 ms sonra açar.

## v5.2.0 — tamam (önizlemeyle onaylandı)
- ⋯ düğmeleri kalktı: klasöre ve programa **basılı tut** → menü (klasör: Aç, Yeniden adlandır, İçine yeni klasör, Kopyala, Taşı, Sil · program: Aç, Sahneye başla, Yeniden adlandır, Kopyala, Sil); kısa dokunuş açar
- İki parmak (pinch) sadece şarkı yazısını büyütür/küçültür, sayfa yakınlaşması kapalı; sahne modunda da

## v5.0.0 — tamam (her biri önce önizleme resmiyle onaylandı)
- iPhone üst çubuk: büyük ‹ Geri ve dolu altın ⌂, ortada HAKANO REPERTUVAR (saat yerine; sahne modunda saat var); alt çubukta büyük ‹ ›
- Sade bilgi satırı: sadece klasör adı (tam yol değil) + usul/makam; "Windows‑1254" kalktı; kopya bilgisi iPhone'da gizli
- Klasör menüsü (⋯ veya uzun bas, iPhone dahil): yeniden adlandır, içine yeni klasör, kopyala, taşı (listeden hedef seç), sil
- ⚙ → 🎨 Görünüm: 5 tema (Siyah‑Altın, Siyah‑Beyaz, Beyaz, Lacivert‑Altın, Bordo‑Altın), düğme boyutu (4 kademe), şarkı yazısı, bilgi satırı/etiketler göster‑gizle, iPhone başlık/saat — Kaydet ile `gorunum.json` üzerinden tüm cihazlara senkron
- Ayarlar, Görünüm ve klasör seçicide sabit üst satır: ⌂ ana sayfa, ✕ kapat

## v4.8.0 — tamam
- iPhone / dar ekran: üst çubukta ⌂ (ana klasöre dön, şarkıyı kapatır, aramayı temizler); klasör içindeyken büyük "⌂ Repertuvar" ve "‹ Üst klasör" düğmeleri

## v4.7.1 — tamam
- Taşınmış/silinmiş şarkının eski notu senkronda geri yüklenmiyor

## v4.7.0 — tamam
- Okuma alanı: liste ile şarkı arasındaki çizgi sürüklenerek genişlik ayarlanır (çift tık = sıfırla)
- ☰ / L tuşu: listeyi gizle → şarkı tam genişlik
- ▴: araç çubuğunu ve bilgi satırını katla (▾ ile geri); liste yazı boyu a− / a+
- Tüm ayarlar cihaz başına hatırlanır; iPhone düzeni değişmedi

## v4.6.0 — tamam
- Klasör düzenleme (Windows/Mac/iPad): ✎📁 yeniden adlandır veya taşı ("Arabesk/Müslüm Gürses" gibi tam yol), 🗑📁 sil (20+ şarkıda klasör adını yazarak onay)
- GitHub'da tek commit (Git Data API): içerik yeniden yüklenmez, 13 bin şarkılık klasör bile birkaç saniyede; favori/not/program yolları otomatik güncellenir
- Eski paket koruması: taşınan/silinen yollar 15 dk geri gelmez

## v4.5.2 — tamam
- Etiket sırası kullanıcıya göre: 🎤 Solist · 🎵 Ton · BPM 90 (emojisiz) · 🥁 Style · kısa not

## v4.5.1 — tamam
- Ton gösterimi kullanıcı tercihine göre: nota büyük harf + minör "m" (LAm, REm, FA#m, SI♭)

## v4.5.0 — tamam
- Şarkı notuna ⏱ BPM (TAP ile ritimde dokunarak ölçme) ve 🥁 Style (aranjör ritim adı; daha önce yazılanlar öneri olarak gelir) eklendi
- Sıra: 🎤 Solist · ⏱ BPM · 🎵 Ton · 🥁 Style · kısa not — başlık yanında, sahnede büyük, listede küçük (solist/BPM/ton)

## v4.4.0 — tamam
- Şarkı notu: 🎤 Solist (Eylem, Hakan, "Eylem & Hakan"…), 🎵 Ton (Do…Si, minör "m"), kısa not — başlığın yanında, sahne modunda da büyük
- Notlar `notlar.json` (private depo) ile tüm cihazlara senkron; iPhone'da görünür, düzenleme Windows/Mac/iPad'de
- Aramada solist/ton/not ile bulma, sonuçlarda en üstte ("eylem" → Eylem'in şarkıları)

## v4.3.1 — tamam
- Güncellemeler iPhone'a güvenilir ulaşıyor: servis çalışanı dosyaları HTTP önbelleğini atlayarak indiriyor, uygulama öne gelince güncelleme kontrolü, yeni sürüm hazır olunca otomatik yenileme (sahnede/düzenlerken değil)

## v4.3.0 — tamam
- iPhone = sadece görüntüleme (kullanıcı kararı): ＋♪ yeni şarkı, ＋📁 klasör, düzenle, sil, içe aktarma iPhone'da yok; bunlar Windows, MacBook ve iPad'de
- iPhone'da kalan: okuma, arama, sahne modu, otomatik kaydırma, favori, programlar, senkron, ZIP dışa aktarma
- "🔎 İnternette ara" her cihazda: arama sonuçlarının üstünde ve şarkı menüsünde (ayrı sekmede Google araması)

## v4.2.0 — tamam
- Yeni şarkı ekranı: Sanatçı + Şarkı adı → dosya adı otomatik "Sanatçı - Şarkı adı.txt", son kullanılan klasör hatırlanır
- "İnternette ara": aramayı ayrı sekmede açar (uygulama hiçbir siteden içerik çekmez)
- "Panodan yapıştır": kullanıcının kopyaladığı metni temizleyip ekler (görünmez karakterler, fazla boş satırlar)
- Kaydedince GitHub'a hemen gönderilir; iPhone Safari'ye geçerken uygulama kapanırsa taslak geri gelir
- iPhone: editör sığdırıldı, Kaydet hep görünür, bildirimler üstte

## v4.1.0 — tamam
- iPhone dikey (≤ 600px) için ayrı düzen: üstteki iki sıra düğme yerine başparmakla ulaşılan alt çubuk (‹ A− ▶ A+ › ⋯), "⋯" alt sayfasında favori/program/sahne/düzenle/yazdır/sil/hız/ton
- Uzun şarkı adları artık kesilmiyor; sıra numarası (14/64) başlığın altında
- Hız/yazı/favori değişince okunan yer başa atlamıyor
- iPad ve Windows düzeni değişmedi

## v4.0.2 — tamam
- iPhone: yeni (boş) klasör uygulama kapanınca kayboluyordu → artık IndexedDB'de saklanıyor; boş klasör silinebilir
- ZIP/klasör içe aktarırken üst klasör atılıyordu ("2.Slov Fantazi Tsm.zip" içeriği köke dağılıyordu) → klasör korunuyor; sadece "Repertuar…" kökü veya zaten içinde bulunulan klasör atlanır
- Windows ZIP'lerindeki Türkçe adlar (ı → "�") düzeltildi: Unicode Path (0x7075) alanı okunuyor
- Uygulama yeniden açılınca son klasör/sekme/program hatırlanıyor

## v4.0.0 — tamam
- PWA (Windows / iPad / iPhone), çevrimdışı, IndexedDB
- Kütüphane, Türkçe duyarsız arama (başlık + söz + tam ifade), usul/makam etiketleri
- 6 kodlama desteği, orijinal kodlamayla kaydetme
- Görüntüleyici: yazı boyu, otomatik kaydırma, sahne modu, ekran açık kalır, akor vurgulama/transpoze
- Programlar, favoriler, son açılanlar
- Düzenleme / yeni / sil / yazdır, kopya tespiti
- GitHub senkronu (paket + tek dosya yükleme + programlar)
- İçe aktarma (.txt, klasör, ZIP), ZIP dışa aktarma
- TR/EN, dijital saat, siyah‑altın tema

## v4.0.1 — iPhone GitHub token kalıcılığı
- Token ve GitHub bağlantısı, IndexedDB'ye ek olarak aynı cihazın localStorage alanına anında yedeklenir.
- Ayar girişleri yazılırken kaydedilir; Test/Senkron/Kapat düğmeleri kaydın sonucunu bekler ve hata gösterebilir.
- Açılışta son kayıt geri yüklenir; repertuvar özel depoda kalır.

## Fikirler (sırasız — Hakan karar verir)
- Şarkıya not / ton / tempo / ritim (Ketron/Pa4X style adı) bilgisi ekleme
- Sahne modunda iki sütun (yatay iPad)
- MIDI ile şarkı açma (HAKANO EVENT / LiveStation entegrasyonu: Program Change → şarkı)
- Kopya şarkıları birleştirme aracı
- .doc / .pptx dosyalarını metne çevirme
- Klasörleri yeniden adlandırma / taşıma

- 5.13.0 — 🧹 Repertuvar Düzenleyici (Ayarlar): yedek dal, ① adlar/gereksiz yazılar (sayı, alt çizgi, sanatçı adı, Türkçe harf, site/künye satırları), ② sanatçıları Sanatçılar/<Ad>/ altında topla (klasör bazlı işaretli, addan bulunanlar elle). ③ kopyalar, ④ bölümler sırada.
- 5.13.1 — Yeniden adlandırılan klasör/şarkı listede yerinde kalır (en alta gitmez); açık klasörler açık kalır.
- 5.14.0 — 📋 Windows gibi: sağ tık / basılı tut menüsü (Kes, Kopyala, Yapıştır, Yeniden adlandır, Sil), panodaki öğe için klasörlerde 📥 ve alt şerit, Ctrl+X/C/V, Entf, F2, Ctrl+tık seçim; klasör de sürüklenip başka klasöre bırakılır; yapıştırınca ağaçta kalır.
- 5.14.1 — Taşı/Kopyala penceresi: düz uzun liste yerine ana klasörler ağaç gibi (▸ ile içi açılır, ada dokun = seç); arama yazınca düz liste.
- 5.14.2 — ☑ seçimde klasörler de seçilir (içindeki bütün şarkılarla); birden fazla klasör + şarkı birlikte kopyalanır / taşınır / kesilir / silinir.
- 5.14.3 — PDF/Word içe aktarma: 'Sıra numarası ekle (01. 02. …)' (varsayılan açık) → şarkılar her cihazda, GitHub'da ve bilgisayar klasöründe PDF sırasıyla; numara listede görünmez.
- 5.15.0 — ＋☰ Programa ekle: şarkı menüsünde, sağ tık menüsünde ve ☑ seçimde (klasörler dahil); pencere açık kalır, dokun = ekle ✓ / tekrar = çıkar. Programlar tarzlara göre gruplu (Slow, Halay, THM …, kendi tarzın); programın menüsünde 'Tarzını değiştir'.
