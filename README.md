# ♪ Müzik Defteri v4

Sahne için şarkı sözü defteri — eski **MÜZİK DEFTERİ v3.0** (VB6) programının yeni sürümü.
Tek uygulama: **Windows 11**, **iPad**, **iPhone**. Kurulduktan sonra internetsiz çalışır.

**Aç:** https://hakano45.github.io/Muzik-Defteri/

## Özellikler
- 15.000+ şarkılık repertuvar: klasör gezgini, Türkçe karakter duyarsız hızlı arama (başlık **ve** sözler; "sari gelin" = "Sarı Gelin")
- Eski dosyaların hepsi doğru Türkçe karakterle: Windows‑1254, DOS‑857, UTF‑8, UTF‑16 — kaydederken orijinal kodlama korunur
- Usul (5/8, 9/8 …) ve makam (Uşşak, Hicaz …) etiketleri klasör adlarından otomatik
- Büyük yazı, A−/A+, otomatik kaydırma (hız ayarlı), **sahne modu** (tam ekran, saat, ekran kapanmaz)
- **Programlar** (setlist): oluştur, sırala, sahnede sırayla çal; **favoriler**, son açılanlar
- Klavye / Bluetooth pedal: ← → şarkı, PageDown/PageUp sayfa, Boşluk kaydırma; dokunmatikte kaydırarak şarkı değiştir
- Düzenle, yeni şarkı, yeni klasör, sil, yazdır; aynı adlı kopyaları gösterir; akor satırlarını vurgular ve ton değiştirir
- Senkron: şarkılar ve programlar private GitHub deposunda — tüm cihazlarda aynı
- İçe aktar: .txt, klasör, ZIP (bozuk `#U00fc` adlarını düzeltir) · Dışa aktar: ZIP
- Siyah‑altın tema, dijital saat, Türkçe / English

## Kurulum
1. **Windows 11:** Edge veya Chrome ile adresi aç → adres çubuğundaki "Uygulamayı yükle" simgesi.
2. **iPhone / iPad:** Safari ile aç → Paylaş ⬆ → **Ana Ekrana Ekle**.
3. İlk açılışta ⚙ Ayarlar → GitHub deposu:
   - Kullanıcı: `HAKANO45`, Depo: `-Muzik-Defteri-Repertuar`, Dal: `main`
   - Erişim anahtarı: GitHub → Settings → Developer settings → Personal access tokens → **Fine‑grained tokens** → Generate → *Repository access: Only select repositories → -Muzik-Defteri-Repertuar* → *Permissions → Contents: Read and write*. Anahtar sadece o cihazda saklanır.
   - **Senkronize et** (ilk indirme ~4 MB).

## Mimari
```
Muzik-Defteri (public)            -Muzik-Defteri-Repertuar (private)
  index.html, css/, js/  ──PWA──▶   repertuar/**.txt   (orijinal dosyalar)
  sw.js (çevrimdışı)                bundle/repertuar.json.gz  ◀── GitHub Action
  IndexedDB (cihazda)   ◀──indir──  programlar.json
                        ──yükle──▶  (değişen şarkı / program)
```

## Geliştirme
Derleme yok. `python3 -m http.server 8765` → http://localhost:8765 · Test: `node tools/e2e-test.js desk|phone`
Ayrıntı: [`.claude/skills/muzik-defteri-gelistirme/SKILL.md`](.claude/skills/muzik-defteri-gelistirme/SKILL.md) · Yol haritası: [`docs/ROADMAP.md`](docs/ROADMAP.md)
