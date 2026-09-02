/* KP veri modeli + palet + damgalar + STL + baskı analizi */

export const CELL_LIMIT = 30000;
const OFF = 32768;
const SPAN = 65536;
const KSPAN = 2048;
const KOFF = 512;

export type CellMap = Map<number, number>;

export function keyOf(i: number, j: number, k: number): number {
  return ((i + OFF) * SPAN + (j + OFF)) * KSPAN + (k + KOFF);
}

export function decodeKey(key: number): [number, number, number] {
  const k = (key % KSPAN) - KOFF;
  const rest = Math.floor(key / KSPAN);
  const j = (rest % SPAN) - OFF;
  const i = Math.floor(rest / SPAN) - OFF;
  return [i, j, k];
}

export function inRange(i: number, j: number): boolean {
  return Math.abs(i) <= CELL_LIMIT && Math.abs(j) <= CELL_LIMIT;
}

export function bresenham(i0: number, j0: number, i1: number, j1: number): [number, number][] {
  const pts: [number, number][] = [];
  const di = Math.abs(i1 - i0);
  const dj = -Math.abs(j1 - j0);
  const si = i0 < i1 ? 1 : -1;
  const sj = j0 < j1 ? 1 : -1;
  let err = di + dj;
  let i = i0;
  let j = j0;
  for (let g = 0; g < 20000; g++) {
    pts.push([i, j]);
    if (i === i1 && j === j1) break;
    const e2 = 2 * err;
    if (e2 >= dj) { err += dj; i += si; }
    if (e2 <= di) { err += di; j += sj; }
  }
  return pts;
}

export interface BBox {
  minI: number; maxI: number;
  minJ: number; maxJ: number;
  minK: number; maxK: number;
}

export function computeBBox(data: CellMap): BBox | null {
  if (data.size === 0) return null;
  let minI = Infinity, maxI = -Infinity, minJ = Infinity, maxJ = -Infinity, minK = Infinity, maxK = -Infinity;
  for (const key of data.keys()) {
    const [i, j, k] = decodeKey(key);
    if (i < minI) minI = i;
    if (i > maxI) maxI = i;
    if (j < minJ) minJ = j;
    if (j > maxJ) maxJ = j;
    if (k < minK) minK = k;
    if (k > maxK) maxK = k;
  }
  return { minI, maxI, minJ, maxJ, minK, maxK };
}

/* ---------------- palet ---------------- */

export const PALETTE = [
  { hex: "#ff8a3d", name: "Kor" },
  { hex: "#ffb454", name: "Amber" },
  { hex: "#f2e86d", name: "Kum" },
  { hex: "#8ac926", name: "Çimen" },
  { hex: "#3fd6b6", name: "Nane" },
  { hex: "#4cc9f0", name: "Buz" },
  { hex: "#5aa9ff", name: "Gök" },
  { hex: "#9d7bff", name: "Mor" },
  { hex: "#ff6b9d", name: "Pembe" },
  { hex: "#e9eef6", name: "Kemik" },
];

/* ---------------- damga kalıpları ---------------- */

export interface StampDef {
  id: string;
  name: string;
  art: string[];
}

export const STAMPS: StampDef[] = [
  { id: "heart", name: "Kalp", art: [".XX.XX.", "XXXXXXX", "XXXXXXX", ".XXXXX.", "..XXX..", "...X..."] },
  { id: "star", name: "Yıldız", art: ["...X...", "..XXX..", "XXXXXXX", ".XXXXX.", "..XXX..", ".XX.XX."] },
  { id: "arrow", name: "Ok", art: ["...X...", "..XXX..", ".XXXXX.", "...X...", "...X...", "...X..."] },
  { id: "plus", name: "Artı", art: ["..XXX..", "..XXX..", "XXXXXXX", "..XXX..", "..XXX.."] },
  { id: "ring", name: "Halka", art: [".XXXXX.", "XX...XX", "X.....X", "X.....X", "XX...XX", ".XXXXX."] },
  { id: "frame", name: "Çerçeve", art: ["XXXXXXX", "X.....X", "X.....X", "X.....X", "XXXXXXX"] },
];

export function stampOffsets(art: string[]): [number, number][] {
  const out: [number, number][] = [];
  const w = art[0].length;
  const h = art.length;
  const ox = Math.floor(w / 2);
  const oy = Math.floor(h / 2);
  for (let r = 0; r < h; r++)
    for (let c = 0; c < w; c++)
      if (art[r][c] === "X") out.push([c - ox, oy - r]);
  return out;
}

/* ---------------- JSON model ---------------- */

export interface KpModel {
  format: "kp-model";
  version: 1;
  app: string;
  name: string;
  kpSizeMm: number;
  createdAt: string;
  cells: [number, number, number, number][];
}

export function serializeModel(name: string, kpSizeMm: number, data: CellMap): string {
  const cells: [number, number, number, number][] = [];
  for (const [key, c] of data) {
    const [i, j, k] = decodeKey(key);
    cells.push([i, j, k, c]);
  }
  return JSON.stringify({
    format: "kp-model",
    version: 1,
    app: "kp-atolye",
    name,
    kpSizeMm,
    createdAt: new Date().toISOString(),
    cells,
  } satisfies KpModel);
}

export function parseModel(text: string): KpModel {
  const m = JSON.parse(text) as KpModel;
  if (!m || m.format !== "kp-model" || !Array.isArray(m.cells) || typeof m.kpSizeMm !== "number") {
    throw new Error("Geçersiz KP model dosyası");
  }
  if (m.kpSizeMm <= 0 || m.kpSizeMm > 500) throw new Error("KP boyutu geçerli aralıkta değil");
  return m;
}

/* ---------------- binary STL ---------------- */

export function buildStl(data: CellMap, kp: number, modelName: string): Blob {
  const S = 0.5;
  const tris: number[] = [];
  const quad = (
    n: [number, number, number],
    a: [number, number, number], b: [number, number, number],
    c: [number, number, number], d: [number, number, number],
  ) => {
    tris.push(n[0], n[1], n[2], a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    tris.push(n[0], n[1], n[2], a[0], a[1], a[2], c[0], c[1], c[2], d[0], d[1], d[2]);
  };

  for (const key of data.keys()) {
    const [ci, cj, ck] = decodeKey(key);
    const x0 = (ci - S) * kp, x1 = (ci + S) * kp;
    const y0 = (cj - S) * kp, y1 = (cj + S) * kp;
    const z0 = ck * kp, z1 = (ck + 1) * kp;

    quad([0, 0, 1], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]);
    quad([0, 0, -1], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0]);
    if (!data.has(keyOf(ci + 1, cj, ck)))
      quad([1, 0, 0], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]);
    if (!data.has(keyOf(ci - 1, cj, ck)))
      quad([-1, 0, 0], [x0, y1, z0], [x0, y0, z0], [x0, y0, z1], [x0, y1, z1]);
    if (!data.has(keyOf(ci, cj + 1, ck)))
      quad([0, 1, 0], [x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]);
    if (!data.has(keyOf(ci, cj - 1, ck)))
      quad([0, -1, 0], [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]);
  }

  const triCount = tris.length / 12;
  const buf = new ArrayBuffer(84 + triCount * 50);
  const dv = new DataView(buf);
  const header = `Lazy CAD binary STL — ${modelName}`;
  for (let b = 0; b < 80; b++) dv.setUint8(b, b < header.length ? header.charCodeAt(b) : 0);
  dv.setUint32(80, triCount, true);
  let o = 84;
  for (let t = 0; t < tris.length; t++) {
    dv.setFloat32(o, tris[t], true);
    o += 4;
    if ((t + 1) % 12 === 0) { dv.setUint16(o, 0, true); o += 2; }
  }
  return new Blob([buf], { type: "model/stl" });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/* ---------------- baskı analizi + tahmin ---------------- */

export interface PrintAnalysis {
  pocketCells: number;
  pocketRegions: number;
  floating: boolean;
  overhangs: [number, number, number][];
}

export function analyzePrint(data: CellMap): PrintAnalysis {
  const none: PrintAnalysis = { pocketCells: 0, pocketRegions: 0, floating: false, overhangs: [] };
  const bb = computeBBox(data);
  if (!bb) return none;

  const xi0 = bb.minI - 1, xi1 = bb.maxI + 1;
  const yj0 = bb.minJ - 1, yj1 = bb.maxJ + 1;
  const zk0 = bb.minK - 1, zk1 = bb.maxK + 1;
  const di = xi1 - xi0 + 1, dj = yj1 - yj0 + 1, dk = zk1 - zk0 + 1;

  let pocketCells = 0;
  let pocketRegions = 0;

  if (di * dj * dk <= 2_000_000) {
    const idx = (i: number, j: number, k: number) => ((i - xi0) * dj + (j - yj0)) * dk + (k - zk0);
    const outside = new Uint8Array(di * dj * dk);
    const queue: number[] = [];
    const seed = (i: number, j: number, k: number) => {
      if (data.has(keyOf(i, j, k))) return;
      const id = idx(i, j, k);
      if (!outside[id]) { outside[id] = 1; queue.push(id); }
    };
    for (let i = xi0; i <= xi1; i++) for (let j = yj0; j <= yj1; j++) { seed(i, j, zk0); seed(i, j, zk1); }
    for (let i = xi0; i <= xi1; i++) for (let k = zk0; k <= zk1; k++) { seed(i, yj0, k); seed(i, yj1, k); }
    for (let j = yj0; j <= yj1; j++) for (let k = zk0; k <= zk1; k++) { seed(xi0, j, k); seed(xi1, j, k); }

    let head = 0;
    while (head < queue.length) {
      const id = queue[head++];
      const k = (id % dk) + zk0;
      const j = (Math.floor(id / dk) % dj) + yj0;
      const i = Math.floor(id / (dj * dk)) + xi0;
      if (i > xi0) seed(i - 1, j, k);
      if (i < xi1) seed(i + 1, j, k);
      if (j > yj0) seed(i, j - 1, k);
      if (j < yj1) seed(i, j + 1, k);
      if (k > zk0) seed(i, j, k - 1);
      if (k < zk1) seed(i, j, k + 1);
    }

    const seen = new Uint8Array(di * dj * dk);
    for (let i = bb.minI; i <= bb.maxI; i++)
      for (let j = bb.minJ; j <= bb.maxJ; j++)
        for (let k = bb.minK; k <= bb.maxK; k++) {
          const id = idx(i, j, k);
          if (outside[id] || seen[id] || data.has(keyOf(i, j, k))) continue;
          pocketRegions++;
          const q2 = [id];
          seen[id] = 1;
          let h2 = 0;
          while (h2 < q2.length) {
            const id2 = q2[h2++];
            pocketCells++;
            const k2 = (id2 % dk) + zk0;
            const j2 = (Math.floor(id2 / dk) % dj) + yj0;
            const i2 = Math.floor(id2 / (dj * dk)) + xi0;
            const nb = (a: number, b: number, c: number) => {
              if (a < bb.minI || a > bb.maxI || b < bb.minJ || b > bb.maxJ || c < bb.minK || c > bb.maxK) return;
              const nid = idx(a, b, c);
              if (!seen[nid] && !outside[nid] && !data.has(keyOf(a, b, c))) { seen[nid] = 1; q2.push(nid); }
            };
            nb(i2 - 1, j2, k2); nb(i2 + 1, j2, k2);
            nb(i2, j2 - 1, k2); nb(i2, j2 + 1, k2);
            nb(i2, j2, k2 - 1); nb(i2, j2, k2 + 1);
          }
        }
  } else {
    pocketCells = -1;
    pocketRegions = -1;
  }

  const overhangs: [number, number, number][] = [];
  for (const key of data.keys()) {
    const [i, j, k] = decodeKey(key);
    if (k === 0) continue;
    if (!data.has(keyOf(i, j, k - 1))) overhangs.push([i, j, k]);
  }
  return { pocketCells, pocketRegions, floating: bb.minK > 0, overhangs };
}

export interface PrintEstimate {
  weightG: number;
  minutes: number;
  costTL: number;
}

export function estimatePrint(volumeMm3: number): PrintEstimate {
  const weightG = (volumeMm3 / 1000) * 1.24;
  const minutes = volumeMm3 > 0 ? (volumeMm3 / 4.8 / 60) * 1.15 + 2 : 0;
  return { weightG, minutes, costTL: (weightG / 1000) * 250 };
}

export function formatVolume(mm3: number): string {
  if (mm3 >= 1000) return `${(mm3 / 1000).toLocaleString("tr-TR", { maximumFractionDigits: 2 })} cm³`;
  return `${mm3.toLocaleString("tr-TR", { maximumFractionDigits: 0 })} mm³`;
}

export function formatDuration(min: number): string {
  if (min <= 0) return "—";
  if (min < 1) return "<1 dk";
  if (min < 60) return `${Math.round(min)} dk`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m > 0 ? `${h} sa ${m} dk` : `${h} sa`;
}

/* ---------------- otomatik destek üretimi ---------------- */

export type SupportMode = "full" | "sparse";

/**
 * Havada kalan (altı boş) her hücrenin altına dikey destek sütunu indirir.
 * Sütun, modelin kendi yüzeyine ya da baskı tablasına (k=0) kadar uzanır.
 * "sparse" modda dama deseniyle her iki overhang'dan birine sütun koyar
 * (malzeme tasarrufu — geniş düz yüzeyler için yeterlidir).
 * Modelin kendi hücrelerine ASLA dokunmaz; ayrı bir küme döner.
 */
export function computeSupports(modelData: CellMap, mode: SupportMode): [number, number, number][] {
  const data = modelData;
  const out: [number, number, number][] = [];
  const used = new Set<number>();
  for (const key of data.keys()) {
    const [i, j, k] = decodeKey(key);
    if (k <= 0) continue;
    if (data.has(keyOf(i, j, k - 1))) continue; // altı dolu → destek gerekmez
    if (mode === "sparse" && ((i + j) & 1) === 1) continue; // dama: her iki sütundan biri
    for (let z = k - 1; z >= 0; z--) {
      if (data.has(keyOf(i, j, z))) break; // modelin kendi yüzeyine oturdu
      const sk = keyOf(i, j, z);
      if (!used.has(sk)) {
        used.add(sk);
        out.push([i, j, z]);
      }
    }
  }
  return out;
}

/** Model + destekleri tek sızdırmaz STL olarak birleştirir (ortak yüzler otomatik atılır). */
export function buildStlWithSupports(
  data: CellMap,
  supports: [number, number, number][],
  kp: number,
  modelName: string,
): Blob {
  const merged: CellMap = new Map(data);
  for (const [i, j, k] of supports) merged.set(keyOf(i, j, k), 0);
  return buildStl(merged, kp, modelName);
}
