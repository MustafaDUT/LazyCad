/**
 * Pürüzsüz yüzey mesh'i — voxel verisinden görsel önizleme yüzeyi üretir.
 *
 * Marching Tetrahedra: voxel verisinden su geçirmez üçgen mesh üretir
 * (Marching Cubes'ın sağlam kardeşi: 256 yerine 16 vaka, yönelimler
 * çalışma anında doğrulanır → garantili dışa bakan normaller).
 * Taubin yumuşatma: λ/μ çift geçişiyle hacmi koruyarak köşeleri
 * organikleştirir (klasik Laplacian'ın büzüşme sorununu yaşamaz).
 *
 * Yönlülük: Bölüntü varyantları (TET_TABLES) sayesinde köşegen şekiller
 * (V, kalp kolları...) simetrik yumuşar, "italik" eğiklik olmaz.
 *
 * NOT: Pürüzsüz mesh yalnızca GÖRSEL ÖNİZLEMEDİR — baskı hattı hassas
 * voxel STL üzerinde kalır. Dual ızgara (örneklem = voxel merkezi) üzerinde
 * yürüdüğü için ham (0 geçişli) çıktı, her voxel'i saran "elmas zarf"tır:
 * tek küp → oktahedron, yumuşatma arttıkça küreye yaklaşır; bitişik
 * küpler tek parça halinde birleşir. KP'nin mm boyutu geometriyi etkilemez
 * (mesh ızgara birimindedir); mm yalnızca STL hattında anlam taşır.
 */

import { decodeKey, type CellMap } from "./model";

export interface SmoothMeshData {
  positions: Float32Array;
  colors: Float32Array;
  indices: Uint32Array;
  vertexCount: number;
  triangleCount: number;
}

const MAX_AXIS = 160; // eksen başına en çok örneklem — dev modellerde otomatik seyrekleştirme
const ISO = 0.5;

/**
 * Temel bölüntü (varyant 0): ana köşegen 0(000)–7(111) etrafında 6 tetrahedra.
 * Köşe numaralama: li → (x = bit0, y = bit1, z = bit2).
 */
const TETS_BASE: ReadonlyArray<readonly [number, number, number, number]> = [
  [0, 1, 3, 7],
  [0, 1, 5, 7],
  [0, 2, 3, 7],
  [0, 2, 6, 7],
  [0, 4, 5, 7],
  [0, 4, 6, 7],
];

/**
 * YÖNSÜZLÜK DÜZELTMESİ (v0.2.2): Bütün hücreler aynı köşegeni kullanırsa yüzey
 * tek yöne "italik" eğilir — V gibi köşegen şekiller yatık çıkardı. Çözüm:
 * hücrenin global konumunun paritesine göre 4 bölüntü varyantından birini seç.
 * Varyantlar temel bölüntünün x/y/z ayna görüntüleridir; seçim kuralı
 *   index = 2·(b⊕c) + (c⊕a),  a=i&1, b=j&1, c=k&1 (global hücre koordinatı)
 * hem komşu hücrelerin ortak yüzlerinde ÇATLAKSIZ (aynı yüz köşegeni),
 * hem de her eksende AYNA-SİMETRİK (V0↔V1, V2↔V3 / V0↔V2, V1↔V3 / V0↔V3, V1↔V2).
 * Sonuç: simetrik çizimler birebir simetrik yumuşar, el yazısı eğikliği biter.
 */
const MIRROR_X: Readonly<Record<number, number>> = { 0: 1, 1: 0, 2: 3, 3: 2, 4: 5, 5: 4, 6: 7, 7: 6 };
const MIRROR_Y: Readonly<Record<number, number>> = { 0: 2, 1: 3, 2: 0, 3: 1, 4: 6, 5: 7, 6: 4, 7: 5 };
const MIRROR_Z: Readonly<Record<number, number>> = { 0: 4, 1: 5, 2: 6, 3: 7, 4: 0, 5: 1, 6: 2, 7: 3 };

const mirror = (m: Readonly<Record<number, number>>) =>
  TETS_BASE.map((t) => [m[t[0]], m[t[1]], m[t[2]], m[t[3]]] as [number, number, number, number]);

const TET_TABLES: ReadonlyArray<ReadonlyArray<readonly [number, number, number, number]>> = [
  TETS_BASE,
  mirror(MIRROR_X),
  mirror(MIRROR_Y),
  mirror(MIRROR_Z),
];

const variantIndex = (i: number, j: number, k: number): number => {
  const a = i & 1;
  const b = j & 1;
  const c = k & 1;
  return 2 * (b ^ c) + (c ^ a);
};

export function buildSmoothMesh(
  data: CellMap,
  colorOf: (idx: number) => [number, number, number],
  iterations = 4,
): SmoothMeshData | null {
  if (data.size === 0) return null;

  /* ---------- 1) bbox + seyrekleştirme ---------- */
  let minI = Infinity,
    maxI = -Infinity,
    minJ = Infinity,
    maxJ = -Infinity,
    minK = Infinity,
    maxK = -Infinity;
  for (const key of data.keys()) {
    const [i, j, k] = decodeKey(key);
    if (i < minI) minI = i;
    if (i > maxI) maxI = i;
    if (j < minJ) minJ = j;
    if (j > maxJ) maxJ = j;
    if (k < minK) minK = k;
    if (k > maxK) maxK = k;
  }
  const s = Math.max(1, Math.ceil(Math.max(maxI - minI, maxJ - minJ, maxK - minK) / MAX_AXIS));

  /* ---------- 2) dual ızgara: örneklem = voxel merkezi (0/1 alan) ---------- */
  const SX = Math.ceil((maxI - minI + 1) / s) + 2;
  const SY = Math.ceil((maxJ - minJ + 1) / s) + 2;
  const SZ = Math.ceil((maxK - minK + 1) / s) + 2;
  const N = SX * SY * SZ;
  const field = new Uint8Array(N);
  const sampleColor = new Int16Array(N).fill(-1);

  for (const [key, c] of data) {
    const [i, j, k] = decodeKey(key);
    const x = Math.floor((i - minI) / s) + 1;
    const y = Math.floor((j - minJ) / s) + 1;
    const z = Math.floor((k - minK) / s) + 1;
    const id = x + y * SX + z * SX * SY;
    field[id] = 1;
    if (sampleColor[id] === -1) sampleColor[id] = c;
  }

  const sampleWorldX = (x: number) => minI + (x - 1) * s + s * 0.5;
  const sampleWorldY = (y: number) => minJ + (y - 1) * s + s * 0.5;
  const sampleWorldZ = (z: number) => minK + (z - 1) * s + s * 0.5;

  /* ---------- 3) Marching Tetrahedra ---------- */
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const vertMap = new Map<number, number>();

  const fallback: [number, number, number] = [0.85, 0.8, 0.74];

  /** Kenar kesişim noktası (ikili alanda her zaman orta nokta) — kenara göre tekilleştirilir. */
  const edgeVertex = (
    x1: number, y1: number, z1: number, f1: number, c1: number,
    x2: number, y2: number, z2: number, f2: number, c2: number,
  ): number => {
    const key = (x1 + x2) + (y1 + y2) * (2 * SX) + (z1 + z2) * (2 * SX) * (2 * SY);
    const hit = vertMap.get(key);
    if (hit !== undefined) return hit;
    const t = (ISO - f1) / (f2 - f1);
    const px = sampleWorldX(x1) + t * (sampleWorldX(x2) - sampleWorldX(x1));
    const py = sampleWorldY(y1) + t * (sampleWorldY(y2) - sampleWorldY(y1));
    const pz = sampleWorldZ(z1) + t * (sampleWorldZ(z2) - sampleWorldZ(z1));
    const insideColor = f1 > ISO ? c1 : c2;
    const rgb = insideColor >= 0 ? colorOf(insideColor) : fallback;
    const idx = vertMap.size;
    vertMap.set(key, idx);
    positions.push(px, py, pz);
    colors.push(rgb[0], rgb[1], rgb[2]);
    return idx;
  };

  const insideCenter = (pts: number[][]): [number, number, number] => {
    let cx = 0, cy = 0, cz = 0;
    for (const p of pts) { cx += p[0]; cy += p[1]; cz += p[2]; }
    return [cx / pts.length, cy / pts.length, cz / pts.length];
  };

  /** Üçgeni dışa bakar şekilde yönlendirip ekler (yönelim garantisi). */
  const pushTri = (a: number, b: number, c: number, ic: [number, number, number]) => {
    const ax = positions[a * 3], ay = positions[a * 3 + 1], az = positions[a * 3 + 2];
    const bx = positions[b * 3] - ax, by = positions[b * 3 + 1] - ay, bz = positions[b * 3 + 2] - az;
    const cx = positions[c * 3] - ax, cy = positions[c * 3 + 1] - ay, cz = positions[c * 3 + 2] - az;
    const nx = by * cz - bz * cy;
    const ny = bz * cx - bx * cz;
    const nz = bx * cy - by * cx;
    const gx = (ax + positions[b * 3] + positions[c * 3]) / 3 - ic[0];
    const gy = (ay + positions[b * 3 + 1] + positions[c * 3 + 1]) / 3 - ic[1];
    const gz = (az + positions[b * 3 + 2] + positions[c * 3 + 2]) / 3 - ic[2];
    if (nx * gx + ny * gy + nz * gz < 0) {
      indices.push(a, c, b);
    } else {
      indices.push(a, b, c);
    }
  };

  const CX = SX - 1, CY = SY - 1, CZ = SZ - 1;
  for (let z = 0; z < CZ; z++)
    for (let y = 0; y < CY; y++)
      for (let x = 0; x < CX; x++) {
        // hücrenin 8 köşe örneği (v0..v7)
        const base = x + y * SX + z * SX * SY;
        const stepY = SX, stepZ = SX * SY;
        // f[li], cornerCoord(li) ile BİREBİR aynı köşenin alan değeri olmalı:
        // li: x=bit0, y=bit1, z=bit2 (eski sıralama y-komşularını kaydırıyordu).
        const f = [
          field[base],                          // 0 → (0,0,0)
          field[base + 1],                      // 1 → (1,0,0)
          field[base + stepY],                  // 2 → (0,1,0)
          field[base + 1 + stepY],              // 3 → (1,1,0)
          field[base + stepZ],                  // 4 → (0,0,1)
          field[base + 1 + stepZ],              // 5 → (1,0,1)
          field[base + stepY + stepZ],          // 6 → (0,1,1)
          field[base + 1 + stepY + stepZ],      // 7 → (1,1,1)
        ];
        let mn = 255, mx = 0;
        for (let q = 0; q < 8; q++) {
          if (f[q] < mn) mn = f[q];
          if (f[q] > mx) mx = f[q];
        }
        if (mn === mx) continue; // tamamen içerde ya da dışarda → yüzey yok

        const sx0 = x, sy0 = y, sz0 = z;
        const cornerCoord = (li: number): [number, number, number] => [
          sx0 + (li & 1),
          sy0 + ((li >> 1) & 1),
          sz0 + ((li >> 2) & 1),
        ];

        // Global konum paritesine göre bölüntü varyantı (yönsüzlük — bkz. TET_TABLES)
        const tets = TET_TABLES[variantIndex(minI + x * s, minJ + y * s, minK + z * s)];
        for (const [la, lb, lc, ld] of tets) {
          const loc = [la, lb, lc, ld];
          const ins: number[] = [];
          const outs: number[] = [];
          for (const li of loc) (f[li] > ISO ? ins : outs).push(li);
          if (ins.length === 0 || ins.length === 4) continue;

          const ev = (A: number, B: number): number => {
            const [x1, y1, z1] = cornerCoord(A);
            const [x2, y2, z2] = cornerCoord(B);
            const bA = x1 + y1 * SX + z1 * SX * SY;
            const bB = x2 + y2 * SX + z2 * SX * SY;
            return edgeVertex(x1, y1, z1, f[A], sampleColor[bA], x2, y2, z2, f[B], sampleColor[bB]);
          };

          const ic = insideCenter(ins.map((li) => {
            const [px, py, pz] = cornerCoord(li);
            return [sampleWorldX(px), sampleWorldY(py), sampleWorldZ(pz)];
          }));

          if (ins.length === 1) {
            const A = ins[0];
            pushTri(ev(A, outs[0]), ev(A, outs[1]), ev(A, outs[2]), ic);
          } else if (ins.length === 3) {
            const A = outs[0];
            pushTri(ev(A, ins[0]), ev(A, ins[1]), ev(A, ins[2]), ic);
          } else {
            // 2'ye 2: dörtgen → iki üçgen (paylaşılan köşegen pAC–pBD)
            const pAC = ev(ins[0], outs[0]);
            const pAD = ev(ins[0], outs[1]);
            const pBC = ev(ins[1], outs[0]);
            const pBD = ev(ins[1], outs[1]);
            pushTri(pAC, pBC, pBD, ic);
            pushTri(pAC, pBD, pAD, ic);
          }
        }
      }

  let vertexCount = vertMap.size;
  let triangleCount = indices.length / 3;
  if (triangleCount === 0) return null;

  /* ---------- 4) Alt-bölme (subdivision) — küre yakınsaması için detay ---------- */
  // Taubin yalnızca var olan köşeleri oynatır; köşe eklenmeden düşük poligonlu
  // zarf (tek küpte oktahedron) küreye dönüşemez, "sekizgen" gibi kalır.
  // Bu yüzden yumuşatma şiddetine göre orta-nokta bölmesi uygulanır: her düzey
  // üçgen sayısını 4'e katlar ve yüzeye gerçek detay ekler. Büyük modellerde
  // düzey, üçgen sayısı sınırıyla otomatik kısılır (performans koruması).
  let posArr: number[] = positions;
  let colArr: number[] = colors;
  let idxArr: number[] = indices;

  let level = iterations <= 0 ? 0 : iterations <= 2 ? 1 : iterations <= 5 ? 2 : 3;
  while (level > 0 && triangleCount * Math.pow(4, level) > 120000) level--;

  const subdivide = () => {
    const N = vertexCount; // bu geçişteki özgün köşe sayısı (kenar anahtarı için)
    const nPos: number[] = posArr.slice();
    const nCol: number[] = colArr.slice();
    const nIdx: number[] = [];
    const mid = new Map<number, number>();
    const getMid = (a: number, b: number): number => {
      const key = a < b ? a * N + b : b * N + a;
      const hit = mid.get(key);
      if (hit !== undefined) return hit;
      const id = nPos.length / 3;
      nPos.push(
        (posArr[a * 3] + posArr[b * 3]) / 2,
        (posArr[a * 3 + 1] + posArr[b * 3 + 1]) / 2,
        (posArr[a * 3 + 2] + posArr[b * 3 + 2]) / 2,
      );
      nCol.push(
        (colArr[a * 3] + colArr[b * 3]) / 2,
        (colArr[a * 3 + 1] + colArr[b * 3 + 1]) / 2,
        (colArr[a * 3 + 2] + colArr[b * 3 + 2]) / 2,
      );
      mid.set(key, id);
      return id;
    };
    for (let t = 0; t < idxArr.length; t += 3) {
      const a = idxArr[t], b = idxArr[t + 1], c = idxArr[t + 2];
      const ab = getMid(a, b);
      const bc = getMid(b, c);
      const ca = getMid(c, a);
      nIdx.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
    }
    posArr = nPos;
    colArr = nCol;
    idxArr = nIdx;
    vertexCount = nPos.length / 3;
    triangleCount = nIdx.length / 3;
  };
  for (let lv = 0; lv < level; lv++) subdivide();

  /* ---------- 5) Taubin yumuşatma (hacim korumalı Laplacian) ---------- */
  let pos = new Float32Array(posArr);
  if (iterations > 0) {
    const V = vertexCount;
    const neighbors: number[][] = Array.from({ length: V }, () => []);
    const seenEdge = new Set<number>();
    for (let t = 0; t < idxArr.length; t += 3) {
      const a = idxArr[t], b = idxArr[t + 1], c = idxArr[t + 2];
      const pairs = [
        a < b ? a * V + b : b * V + a,
        b < c ? b * V + c : c * V + b,
        a < c ? a * V + c : c * V + a,
      ];
      for (const pk of pairs) {
        if (seenEdge.has(pk)) continue;
        seenEdge.add(pk);
        const lo = pk % V;
        const hi = Math.floor(pk / V);
        neighbors[lo].push(hi);
        neighbors[hi].push(lo);
      }
    }

    const LAMBDA = 0.5;
    const MU = -0.53;
    const pass = (kk: number) => {
      const out = new Float32Array(pos.length);
      for (let i = 0; i < V; i++) {
        const nb = neighbors[i];
        const i3 = i * 3;
        if (nb.length === 0) {
          out[i3] = pos[i3];
          out[i3 + 1] = pos[i3 + 1];
          out[i3 + 2] = pos[i3 + 2];
          continue;
        }
        let ax = 0, ay = 0, az = 0;
        for (const m of nb) {
          ax += pos[m * 3];
          ay += pos[m * 3 + 1];
          az += pos[m * 3 + 2];
        }
        const inv = 1 / nb.length;
        out[i3] = pos[i3] + kk * (ax * inv - pos[i3]);
        out[i3 + 1] = pos[i3 + 1] + kk * (ay * inv - pos[i3 + 1]);
        out[i3 + 2] = pos[i3 + 2] + kk * (az * inv - pos[i3 + 2]);
      }
      pos = out;
    };
    for (let it = 0; it < iterations; it++) {
      pass(LAMBDA);
      pass(MU);
    }
  }

  return {
    positions: pos,
    colors: new Float32Array(colArr),
    indices: new Uint32Array(idxArr),
    vertexCount,
    triangleCount,
  };
}
