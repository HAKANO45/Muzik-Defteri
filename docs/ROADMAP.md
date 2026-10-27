# Yol haritası

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
