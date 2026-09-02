# Lazy CAD — Yol haritası

Katman katman voxel stüdyosu: 2D ızgara boyamayı gerçek, baskıya hazır 3D nesnelere çevirir.

Ürün **tamamen tarayıcıda çalışır**: tüm veri `localStorage`'da kalır, cihazdan dışarı çıkmaz.

## Yayında (v1.0.0)

### ✅ Faz 1 — 2D ızgara boyama stüdyosu
- Sınırsız tuval — yalnızca ekrandakini çizen LOD ızgara + görüş alanına göre kırpılmış instanced küpler
- Boya / sil / kova / damlalık / dikdörtgen / daire / şekil damgaları / seçim (taşı–kopyala)
- Simetri (X/Y), Z katmanları (K0–K1023), soğan zarı katman hayaleti
- Çizim düzlemleri XY / XZ / YZ — fırça ortasında düzlem değiştirip dikey çizebilirsin
- KP boyutu 0.1–100 mm, özel palet (14 yuva), geri al (120 adım), otomatik kayıt
- Köşede canlı mini 3D ön-izleme

### ✅ Faz 2 — 3D, düzlemler ve baskı hattı
- Tam 3D modu: yörünge kontrolü, gölgeler, Z-up yön, eksen üçlüsü, baskı yatağı görseli
- Dilimleyici ön-izleme (K0'dan tepeye, aktif dilim vurgulu)
- **STL** — su geçirmez ikili (mm); model + otomatik destek tek dosyada
- Otomatik destek üretimi (dolu / seyrek dama stratejileri)
- Baskı analizi — hapsolmuş hava, yüzen taban, sarkma sayısı, PLA ağırlığı, süre & maliyet tahmini
- **OBJ / GLB** (pürüzsüz ya da voxel) ve şeffaf **PNG** (2×) dışa aktarma
- **JSON** model biçimi — `.kp.json` içe/dışa aktarım, sürükle-bırak

## Sıradaki (tümü tarayıcıda)

### 🚧 Faz 3 — Paylaşım ve içe aktarma
- **Paylaşım linki** — modeli `#m=` koduna kodla; URL'den geri çöz
- **Kolay içe aktarma** — sürükle-bırak'a ek olarak dosya seçici; paylaşım linkinden doğrudan
  çalışma alanına aktarma

### 🔧 Faz 4 — İnce ayar
- **Dokunmatik / kalem** cilası — çoğu yol pointer olaylarıyla hazır
