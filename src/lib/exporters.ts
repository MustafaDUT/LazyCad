/**
 * Oyun motoru / mesh araçları dışa aktarımı (OBJ · GLB).
 *
 * OBJ  — Blender (ve genel mesh araçları) için. Köşe renkleri `v x y z r g b`
 *        uzantısıyla gömülür; Blender bu satırları okur ve vertex-color olarak
 *        içe aktarır. Normaller dahil edilir.
 * GLB  — glTF 2.0 binary. Unity / Unreal / Godot / web için ana format.
 *        Three.js GLTFExporter, köşe renklerini COLOR_0 olarak yazar.
 *        İki çeşit: pürüzsüz (smooth) ve voxel (retro, köşeli).
 *
 * NOT: Birimler "KP başına 1" (ızgara birimi) — oyun asseti konvansiyonu.
 *      STL hattı mm kullanmaya devam eder (baskı için).
 */

import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import type { SmoothMeshData } from "./smooth";
import { keyOf, decodeKey, type CellMap } from "./model";

export type ColorOf = (idx: number) => [number, number, number];

/* ---------------- smooth mesh → geometry ---------------- */

export function smoothToGeometry(sm: SmoothMeshData): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(sm.positions, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(sm.colors, 3));
  geo.setIndex(new THREE.BufferAttribute(sm.indices, 1));
  geo.computeVertexNormals();
  return geo;
}

/* ---------------- voxel mesh → geometry (iç yüzler atlanır) ---------------- */

export function buildVoxelGeometry(data: CellMap, colorOf: ColorOf): THREE.BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  // 6 yüz: her biri 4 köşe ofseti + normal yönü
  const faces = [
    { n: [0, 0, 1], c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], d: [0, 0, 1] },
    { n: [0, 0, -1], c: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]], d: [0, 0, -1] },
    { n: [1, 0, 0], c: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]], d: [1, 0, 0] },
    { n: [-1, 0, 0], c: [[0, 1, 0], [0, 0, 0], [0, 0, 1], [0, 1, 1]], d: [-1, 0, 0] },
    { n: [0, 1, 0], c: [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]], d: [0, 1, 0] },
    { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], d: [0, -1, 0] },
  ];

  let vcount = 0;
  for (const [key, c] of data) {
    const [ci, cj, ck] = decodeKey(key);
    const rgb = colorOf(c);
    for (const f of faces) {
      // komşu doluysa bu yüzü atla (iç yüz olmasın)
      if (data.has(keyOf(ci + f.d[0], cj + f.d[1], ck + f.d[2]))) continue;
      const base = vcount;
      for (const corner of f.c) {
        positions.push(ci + corner[0], cj + corner[1], ck + corner[2]);
        colors.push(rgb[0], rgb[1], rgb[2]);
        vcount++;
      }
      // iki üçgen, dışa bakar sırada
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(positions), 3));
  geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(colors), 3));
  geo.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));
  geo.computeVertexNormals();
  return geo;
}

/* ---------------- OBJ yazıcı (köşe renkleri + normal) ---------------- */

export function geometryToObj(geo: THREE.BufferGeometry, name: string): string {
  const pos = geo.getAttribute("position") as THREE.BufferAttribute;
  const col = geo.getAttribute("color") as THREE.BufferAttribute | null;
  const norm = geo.getAttribute("normal") as THREE.BufferAttribute | null;
  const idx = geo.getIndex();

  const lines: string[] = [`# Lazy CAD OBJ export — ${name}`, `o ${name}`];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    if (col) {
      lines.push(`v ${x} ${y} ${z} ${col.getX(i)} ${col.getY(i)} ${col.getZ(i)}`);
    } else {
      lines.push(`v ${x} ${y} ${z}`);
    }
  }
  if (norm) {
    for (let i = 0; i < norm.count; i++) {
      lines.push(`vn ${norm.getX(i)} ${norm.getY(i)} ${norm.getZ(i)}`);
    }
  }
  if (idx) {
    for (let i = 0; i < idx.count; i += 3) {
      const a = idx.getX(i) + 1, b = idx.getX(i + 1) + 1, c = idx.getX(i + 2) + 1;
      lines.push(norm ? `f ${a}//${a} ${b}//${b} ${c}//${c}` : `f ${a} ${b} ${c}`);
    }
  }
  return lines.join("\n");
}

/* ---------------- GLB (glTF binary) — GLTFExporter ---------------- */

export function exportGeometryAsGlb(geo: THREE.BufferGeometry, filename: string): Promise<void> {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.05 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = filename.replace(/\.glb$/i, "");
  const exporter = new GLTFExporter();
  return new Promise((resolve, reject) => {
    exporter.parse(
      mesh,
      (result) => {
        if (result instanceof ArrayBuffer) {
          downloadBytes(new Blob([result], { type: "model/gltf-binary" }), filename);
        } else {
          downloadBytes(new Blob([JSON.stringify(result)], { type: "model/gltf+json" }), filename.replace(/\.glb$/i, ".gltf"));
        }
        resolve();
      },
      (err) => reject(err instanceof Error ? err : new Error("GLB export failed")),
      { binary: true },
    );
  });
}

function downloadBytes(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
