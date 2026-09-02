/* Hazır şablonlar — "boş ekran korkusu"nu bitiren vitrin.
   Her şablon ASCII katmanlardan oluşur: layers[0] = K0 (taban).
   Karakterler: '0'-'9' → palet indeksi, '.' → boş hücre. */

export interface Template {
  id: string;
  name: string;
  desc: string;
  kp: number; // KP boyutu (mm)
  tag: string;
  featured?: boolean;
  layers: string[][];
}

/* ---------------- üreticiler ---------------- */

/** n×n×n içi boş küp kabuğu (yalnızca duvarlar). */
function shellCube(n: number, ch: string): string[][] {
  const layers: string[][] = [];
  for (let k = 0; k < n; k++) {
    const rows: string[] = [];
    for (let j = 0; j < n; j++) {
      let row = "";
      for (let i = 0; i < n; i++) {
        const wall = k === 0 || k === n - 1 || i === 0 || i === n - 1 || j === 0 || j === n - 1;
        row += wall ? ch : ".";
      }
      rows.push(row);
    }
    layers.push(rows);
  }
  return layers;
}

/** Basamaklı piramit: tabandan tepeye 2'şer küçülen dolu kareler. */
function pyramid(base: number, colors: string[]): string[][] {
  const layers: string[][] = [];
  for (let L = 0; L < colors.length; L++) {
    const size = base - 2 * L;
    if (size < 1) break;
    const off = Math.floor((base - size) / 2);
    const rows: string[] = [];
    for (let j = 0; j < base; j++) {
      let row = "";
      for (let i = 0; i < base; i++) {
        row += i >= off && i < off + size && j >= off && j < off + size ? colors[L] : ".";
      }
      rows.push(row);
    }
    layers.push(rows);
  }
  return layers;
}

const H = [
  ".XX.XX.",
  "XXXXXXX",
  "XXXXXXX",
  ".XXXXX.",
  "..XXX..",
  "...X...",
];

const H_SHINE = [
  ".......",
  ".99....",
  ".9.....",
  ".......",
  ".......",
  ".......",
];

const STAR = [
  "...X...",
  "..XXX..",
  "XXXXXXX",
  ".XXXXX.",
  "..XXX..",
  ".XX.XX.",
];

const STAR_GEM = [
  ".......",
  ".......",
  "...8...",
  "...8...",
  ".......",
  ".......",
];

const LETTER_K = [
  "9..9",
  "9.9.",
  "99..",
  "9.9.",
  "9..9",
];

const FRAME = [
  "777777777",
  "777777777",
  "77.....77",
  "77.....77",
  "77.....77",
  "77.....77",
  "77.....77",
  "777777777",
  "777777777",
];

const ROCKET_K0 = [
  "0...0",
  ".111.",
  ".111.",
  ".111.",
  "0...0",
];
const ROCKET_K1 = ["111", "191", "111"];
const ROCKET_K2 = ["999", "999", "999"];
const ROCKET_K3 = ["0"];

/* ---------------- şablonlar ---------------- */

export const TEMPLATES: Template[] = [
  {
    id: "hollow-cube",
    name: "İçi Boş Küp",
    desc: "10 cm'lik kutu — katman katman örülmüş duvarlar, baskıya hazır kabuk.",
    kp: 10,
    tag: "BAŞLANGIÇ",
    featured: true,
    layers: shellCube(10, "1"),
  },
  {
    id: "heart",
    name: "Kalp Rozeti",
    desc: "İki katmanlı kalp, üstte parlak vuruş. Anahtarlık klasiği.",
    kp: 5,
    tag: "ROZET",
    layers: [
      H.map((r) => r.replace(/X/g, "8")),
      H.map((r) => r.replace(/X/g, "8")),
      H_SHINE,
    ],
  },
  {
    id: "rocket",
    name: "Roket",
    desc: "Paletli taban, gövde, pencere ve burun konisi — 4 katmanda gerçek hacim.",
    kp: 5,
    tag: "3B NESNE",
    layers: [ROCKET_K0, ROCKET_K1, ROCKET_K2, ROCKET_K3],
  },
  {
    id: "letter-k",
    name: "Harf K",
    desc: "Kabartma harf — üç katman extrude edilmiş gibi durur.",
    kp: 10,
    tag: "YAZI",
    layers: [LETTER_K, LETTER_K, LETTER_K],
  },
  {
    id: "pyramid",
    name: "Basamak Piramit",
    desc: "9×9 tabandan 1×1 tepeye, her basamak ayrı renkte.",
    kp: 5,
    tag: "GEOMETRİ",
    layers: pyramid(9, ["1", "0", "3", "6", "8"]),
  },
  {
    id: "star",
    name: "Yıldız Rozet",
    desc: "Kum yıldız, ortasında pembe çekirdek. İki katmanda basılır.",
    kp: 5,
    tag: "ROZET",
    layers: [
      STAR.map((r) => r.replace(/X/g, "2")),
      STAR.map((r, ri) =>
        r
          .split("")
          .map((ch, ci) => (ch === "X" ? (STAR_GEM[ri][ci] === "8" ? "8" : "2") : "."))
          .join(""),
      ),
    ],
  },
  {
    id: "frame",
    name: "Çerçeve",
    desc: "Mor dekor çerçevesi — içi boş, fotoğraf değil ama hayal gücü bedava.",
    kp: 5,
    tag: "DEKOR",
    layers: [FRAME, FRAME],
  },
];

/* ---------------- dönüşümler ---------------- */

/** Şablonu hücre listesine çevirir: [i, j, k, renk]. Desen ortalanır. */
export function buildTemplateCells(t: Template): [number, number, number, number][] {
  const out: [number, number, number, number][] = [];
  t.layers.forEach((rows, k) => {
    const h = rows.length;
    const w = rows[0].length;
    const ox = Math.floor(w / 2);
    const oy = Math.floor(h / 2);
    for (let r = 0; r < h; r++) {
      for (let c = 0; c < w; c++) {
        const ch = rows[r][c];
        if (ch === ".") continue;
        out.push([c - ox, (h - 1 - r) - oy, k, Number(ch)]);
      }
    }
  });
  return out;
}

export interface PreviewCell {
  i: number;
  j: number;
  c: number;
}

/** Kuşbakışı projeksiyon — en üst katman kazanır. Kart önizlemesi için. */
export function templatePreview(t: Template): { cells: PreviewCell[]; w: number; h: number; minI: number; minJ: number } {
  const top = new Map<string, { i: number; j: number; c: number; k: number }>();
  for (const [i, j, k, c] of buildTemplateCells(t)) {
    const id = `${i},${j}`;
    const cur = top.get(id);
    if (!cur || k > cur.k) top.set(id, { i, j, c, k });
  }
  let minI = Infinity,
    maxI = -Infinity,
    minJ = Infinity,
    maxJ = -Infinity;
  for (const v of top.values()) {
    if (v.i < minI) minI = v.i;
    if (v.i > maxI) maxI = v.i;
    if (v.j < minJ) minJ = v.j;
    if (v.j > maxJ) maxJ = v.j;
  }
  if (top.size === 0) return { cells: [], w: 1, h: 1, minI: 0, minJ: 0 };
  return {
    cells: [...top.values()].map(({ i, j, c }) => ({ i, j, c })),
    w: maxI - minI + 1,
    h: maxJ - minJ + 1,
    minI,
    minJ,
  };
}

export function templateStats(t: Template): { count: number; layers: number } {
  return { count: buildTemplateCells(t).length, layers: t.layers.length };
}
