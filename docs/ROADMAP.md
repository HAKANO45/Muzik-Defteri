# Yol haritası

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
