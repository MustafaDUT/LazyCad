# CHANGELOG

## v1.1.0 — 2026-09-02 · Docker dağıtımı
- `Dockerfile` eklendi: çok aşamalı build — `node` ile statik `dist/` üretilir, `nginx` ile sunulur
- Tek komut: `docker build -t lazycad . && docker run -p 8080:80 lazycad`
- `nginx.conf`: gzip + SPA fallback (`index.html`) + hashlı asset önbelleği (`/assets/`)
- `.dockerignore` (node_modules/dist/.git/ortam dosyaları image'a girmez)

## v1.0.0 — 2026-09-02 · İlk genel sürüm

Katman katman voxel stüdyosunun **ilk genel sürümü** — kendine yeten, tamamen tarayıcıda çalışır:
açılış doğrudan çalışma alanını gösterir, çizimler `localStorage`'a kaydedilir ve sayfa yenilense de
geri gelir. Veri cihazdan dışarı çıkmaz.

### Açılış
- Uygulama doğrudan proje panosunu açar.
- Yapı saf statik `dist/` üretir — herhangi bir statik barındırıcıda çalışır.

### Tasarım çalışma alanı
- **2D ızgara motoru:** sınırsız tuval, boya/sil/kova/pipet/dikdörtgen/daire/damga/seçim
  (taşı–kopyala), simetri (X/Y), Z katmanları (K0–K1023) + soğan zarı, XY/XZ/YZ çizim düzlemleri.
- Canlı mini 3D ön-izleme, tam 3D modu ve dilimleyici ön-izleme.
- **Baskı:** su geçirmez ikili STL (destekli ya da desteksiz), otomatik destek üretimi,
  baskı analizi & tahmin.
- **Dışa aktarım:** OBJ / GLB (pürüzsüz ya da voxel), şeffaf PNG (2×), JSON (`.kp.json` içe/dışa).
- **Proje panosu:** canlı küçük resimler, kopyala/sil, şablon galerisi — hepsi tarayıcıda kalıcı.

### Sürüm
- Tek kaynak `src/lib/version.ts` → `1.0.0`. Yerel etiket: `git tag v1.0.0`.
