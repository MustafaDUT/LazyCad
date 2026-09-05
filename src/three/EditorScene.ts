import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { PALETTE } from "../lib/model";
import { keyOf, decodeKey, inRange, bresenham, computeBBox, stampOffsets, STAMPS } from "../lib/model";
import { buildSmoothMesh } from "../lib/smooth";

export type Tool = "paint" | "erase" | "pick" | "fill" | "rect" | "circle" | "stamp" | "select" | "ruler";
export type ViewMode = "2d" | "3d";
export type DrawPlane = "xy" | "xz" | "yz";

export interface EngineStats {
  count: number;
  layers: number;
  sliceCount: number;
  canUndo: boolean;
  canRedo: boolean;
  dimsMm: { w: number; h: number; d: number } | null;
  volumeMm3: number;
  weightG: number;
  floating: boolean;
  baseContact: number;
  minK: number;
  maxK: number;
  plane: DrawPlane;
  slice: number;
}

export interface RulerResult {
  count: number; // seçim dahil küp sayısı
  mm: number; // dıştan dışa span (count × kpSizeMm)
  kp: number; // kullanılan küp aralığı (mm)
  label: string; // hazır görünen metin: "5 küp · 50 mm"
}

export interface EngineCallbacks {
  onStats: (s: EngineStats) => void;
  onCursor: (cell: [number, number] | null, filled: boolean) => void;
  onZoom: (pct: number) => void;
  onStroke: () => void;
  onPickColor: (i: number) => void;
  onToast: (msg: string) => void;
  onMiniLayout: (r: { x: number; y: number; w: number; h: number } | null) => void;
  onMiniMaximize: () => void;
  onMeasure: (r: RulerResult | null) => void;
}

const BASE_S = 26;
const MIN_S = 3.5;
const MAX_S = 220;
const CELL_RADIUS = 4;
const FILL_LIMIT = 30000;

export class EditorScene {
  private mount: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private ortho: THREE.OrthographicCamera;
  private persp: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private ro: ResizeObserver;
  private raf = 0;
  private disposed = false;
  private w = 2;
  private h = 2;

  // veri
  private data: Map<number, number> = new Map();
  private dataVersion = 0;
  private kpSizeMm: number;
  private undoStack: Map<number, number | null>[] = [];
  private redoStack: Map<number, number | null>[] = [];
  private stroke: Map<number, number | null> | null = null;
  private lastCell: [number, number] | null = null;
  private strokeOp: "paint" | "erase" = "paint";
  private lastPaintCell: [number, number] | null = null;

  // durum
  private mode: ViewMode = "2d";
  private tool: Tool = "paint";
  private plane: DrawPlane = "xy";
  private layer = 0;
  private sliceI = 0;
  private sliceJ = 0;
  private colorIndex = 0;
  private spaceHeld = false;
  private altHeld = false;

  // dilimleyici (slicer) önizleme — 3D modda katman katman gezinme
  private slicerActive = false;
  private slicerLayer = 100000;
  private hlColor = new THREE.Color();
  private whiteCol = new THREE.Color(0xffffff);
  private darkCol = new THREE.Color(0x0a0e15);

  // 2D kamera
  private cx = 0;
  private cy = 0;
  private s = BASE_S;
  private tcx = 0;
  private tcy = 0;
  private ts = BASE_S;
  private panning: { x0: number; y0: number; cx0: number; cy0: number } | null = null;
  private pointers = new Map<number, { x: number; y: number }>();
  private pinch: { d0: number; s0: number } | null = null;
  private suppressPaint = false;
  private hoverCell: [number, number] | null = null;

  // nesneler
  private boxGeo2d: THREE.BoxGeometry;
  private boxGeo3d: THREE.BoxGeometry;
  private fillMat: THREE.MeshStandardMaterial;
  private fillMesh: THREE.InstancedMesh | null = null;
  private fillCap = 0;
  private builtVersion = -1;
  private builtWin = "";
  private paletteColors: THREE.Color[];
  private gridLines: THREE.LineSegments;
  private gridPos: Float32Array;
  private gridSig = "";
  private ghost: THREE.Group;
  private ghostEdge: THREE.LineSegments;
  private ghostMat: THREE.MeshBasicMaterial;
  private ghostEdgeMat: THREE.LineBasicMaterial;
  private ghostMeshes: THREE.InstancedMesh[] = [];
  private ghostMats: THREE.MeshBasicMaterial[] = [];
  private ghostCaps: number[] = [];
  private ghostDepth = 2;
  private ghostOpacity = 0.34;
  private static readonly GHOST_DECAY = 0.62;
  private static readonly MAX_GHOSTS = 5;

  // şekil / önizleme
  private shapeDrag: { i0: number; j0: number; i1: number; j1: number } | null = null;
  private shapeSig = "";
  private previewLines: THREE.LineSegments;
  private previewPos: Float32Array;
  private axisLines: THREE.LineSegments;
  private axisSig = "";
  private symX = false;
  private symY = false;
  private symCol = 0;
  private symRow = 0;
  private stampCells: [number, number][] | null = null;

  // seçim aracı
  private selDrag: { i0: number; j0: number; i1: number; j1: number } | null = null;
  private selRect: THREE.LineSegments;
  private selRectPos: Float32Array;
  private selCells: Map<number, number> | null = null;
  private selWasCut = false;
  private selNeverPlaced = true;
  private selAnchor: [number, number] | null = null;
  private selCursor: [number, number] | null = null;
  private selPreview: THREE.InstancedMesh | null = null;
  private selPreviewCap = 0;
  private selPreviewMat: THREE.MeshBasicMaterial;

  // çetvel (ölçüm) aracı
  private rulerStart: [number, number, number] | null = null;
  private rulerEnd: [number, number, number] | null = null;
  private rulerActive = false;
  private rulerSegs: THREE.LineSegments;
  private rulerPos: Float32Array;
  private rulerSprite: THREE.Sprite | null = null;
  private rulerTex: THREE.CanvasTexture | null = null;
  private rulerMid: [number, number] | null = null;
  private rulerPx: [number, number] = [0, 0];

  // mini 3D önizleme
  private miniEnabled = true;
  private miniCam: THREE.PerspectiveCamera;
  private miniMesh: THREE.InstancedMesh | null = null;
  private miniCap = 0;
  private miniBuiltVersion = -1;
  private miniAz = 0.62;
  private miniPol = 0.51;
  private miniZoom = 1;
  private miniTarget = new THREE.Vector3();
  private miniRadius = 12;
  private miniRotating = false;
  private miniLastX = 0;
  private miniLastY = 0;

  // 3D sahne
  private hemi: THREE.HemisphereLight;
  private key: THREE.DirectionalLight;
  private front: THREE.DirectionalLight;
  private fillA: THREE.DirectionalLight;
  private fillB: THREE.DirectionalLight;
  private ambient: THREE.AmbientLight;
  private bed: THREE.Group;
  private bedSlab: THREE.Mesh;
  private bedMinor: THREE.LineSegments;
  private bedMinorPos: Float32Array;
  private bedMajor: THREE.LineSegments;
  private bedMajorPos: Float32Array;
  private bedOrigin: THREE.Group;
  private bedVisible = true;
  private bedSig = "";
  private triad: THREE.Group;
  private triadSig = "";
  private overhangMesh: THREE.InstancedMesh | null = null;
  private overhangCap = 0;
  private overhangGeo: THREE.BoxGeometry | null = null;
  private overhangMat: THREE.MeshBasicMaterial | null = null;

  // otomatik üretilen destek sütunları (modele dokunmayan ayrı katman)
  private supportMesh: THREE.InstancedMesh | null = null;
  private supportCap = 0;

  // pürüzsüz yüzey (marching tetrahedra + Taubin) — yalnızca 3D önizleme
  private smoothMesh: THREE.Mesh | null = null;
  private smoothBuiltVersion = -1;
  private smoothIters = 4;
  private smoothOn = false;
  private smoothStats: { tris: number; verts: number } | null = null;
  private supportMat: THREE.MeshStandardMaterial | null = null;

  private tmpMat = new THREE.Matrix4();
  private cb: EngineCallbacks;

  constructor(mount: HTMLElement, kpSizeMm: number, cb: EngineCallbacks) {
    this.mount = mount;
    this.cb = cb;
    this.kpSizeMm = kpSizeMm;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const canvas = this.renderer.domElement;
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.display = "block";
    canvas.style.touchAction = "none";
    mount.appendChild(canvas);

    this.paletteColors = PALETTE.map((p) => new THREE.Color(p.hex));

    const aspect = 1;
    this.ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
    this.ortho.position.set(0, 0, 20);
    this.persp = new THREE.PerspectiveCamera(46, aspect, 0.1, 4000);
    this.persp.up.set(0, 0, 1); // Z yukarı — CAD standardı
    this.persp.position.set(8, 6, 18);

    this.controls = new OrbitControls(this.persp, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 2.5;
    this.controls.maxDistance = 1200;
    this.controls.autoRotateSpeed = 1.6;
    this.controls.enabled = false;

    // ışıklar
    this.hemi = new THREE.HemisphereLight(0xcfdcec, 0x1a212c, 0.95);
    this.key = new THREE.DirectionalLight(0xffe9cf, 0.55);
    this.key.position.set(7, 11, 9);
    this.key.castShadow = false;
    this.key.shadow.mapSize.set(2048, 2048);
    this.key.shadow.bias = -0.0006;
    this.front = new THREE.DirectionalLight(0xe9f1ff, 1.45);
    this.front.position.set(0, 0, 12);
    this.fillA = new THREE.DirectionalLight(0xdfe9ff, 0.55);
    this.fillA.position.set(-8, 4, -7);
    this.fillB = new THREE.DirectionalLight(0xffe3c4, 0.45);
    this.fillB.position.set(4, -8, 5);
    this.ambient = new THREE.AmbientLight(0xb9c9de, 0.5);
    this.scene.add(this.hemi, this.key, this.key.target, this.front, this.fillA, this.fillB, this.ambient);

    // geometriler
    this.boxGeo2d = new THREE.BoxGeometry(0.955, 0.955, 0.955);
    this.boxGeo3d = new THREE.BoxGeometry(1.002, 1.002, 1.002);
    this.fillMat = new THREE.MeshStandardMaterial({ roughness: 0.48, metalness: 0.06 });

    // grid
    this.gridPos = new Float32Array(24000 * 3);
    const gridGeo = new THREE.BufferGeometry();
    gridGeo.setAttribute("position", new THREE.BufferAttribute(this.gridPos, 3).setUsage(THREE.DynamicDrawUsage));
    gridGeo.setDrawRange(0, 0);
    this.gridLines = new THREE.LineSegments(
      gridGeo,
      new THREE.LineBasicMaterial({ color: 0x33445f, transparent: true, opacity: 0.5 }),
    );
    this.gridLines.frustumCulled = false;
    this.scene.add(this.gridLines);

    // hayalet (hover) küp
    const ghostGeo = new THREE.BoxGeometry(0.955, 0.955, 0.955);
    this.ghostMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.32, depthWrite: false });
    const ghostBox = new THREE.Mesh(ghostGeo, this.ghostMat);
    this.ghostEdgeMat = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.95 });
    this.ghostEdge = new THREE.LineSegments(new THREE.EdgesGeometry(ghostGeo), this.ghostEdgeMat);
    const ghostGroup = new THREE.Group();
    ghostGroup.add(ghostBox, this.ghostEdge);
    ghostGroup.visible = false;
    this.ghost = ghostGroup;
    this.scene.add(ghostGroup);
    this.updateGhostColor();

    // şekil önizleme çizgileri
    this.previewPos = new Float32Array(16000 * 3);
    const previewGeo = new THREE.BufferGeometry();
    previewGeo.setAttribute("position", new THREE.BufferAttribute(this.previewPos, 3).setUsage(THREE.DynamicDrawUsage));
    previewGeo.setDrawRange(0, 0);
    this.previewLines = new THREE.LineSegments(
      previewGeo,
      new THREE.LineBasicMaterial({ color: 0xffb454, transparent: true, opacity: 0.95 }),
    );
    this.previewLines.frustumCulled = false;
    this.previewLines.visible = false;
    this.scene.add(this.previewLines);

    // simetri eksenleri
    const axisGeo = new THREE.BufferGeometry();
    axisGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(24), 3).setUsage(THREE.DynamicDrawUsage));
    axisGeo.setDrawRange(0, 0);
    this.axisLines = new THREE.LineSegments(
      axisGeo,
      new THREE.LineBasicMaterial({ color: 0x3fd6b6, transparent: true, opacity: 0.85 }),
    );
    this.axisLines.frustumCulled = false;
    this.axisLines.visible = false;
    this.scene.add(this.axisLines);

    // seçim dikdörtgeni
    this.selRectPos = new Float32Array(8 * 3);
    const selRectGeo = new THREE.BufferGeometry();
    selRectGeo.setAttribute("position", new THREE.BufferAttribute(this.selRectPos, 3).setUsage(THREE.DynamicDrawUsage));
    selRectGeo.setDrawRange(0, 0);
    this.selRect = new THREE.LineSegments(
      selRectGeo,
      new THREE.LineBasicMaterial({ color: 0x3fd6b6, transparent: true, opacity: 0.95 }),
    );
    this.selRect.frustumCulled = false;
    this.selRect.visible = false;
    this.scene.add(this.selRect);
    this.selPreviewMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.5, depthWrite: false });

    // çetvel çizgisi + uç artıları
    this.rulerPos = new Float32Array(64 * 3);
    const rulerGeo = new THREE.BufferGeometry();
    rulerGeo.setAttribute("position", new THREE.BufferAttribute(this.rulerPos, 3).setUsage(THREE.DynamicDrawUsage));
    rulerGeo.setDrawRange(0, 0);
    this.rulerSegs = new THREE.LineSegments(
      rulerGeo,
      new THREE.LineBasicMaterial({ color: 0xffb454, transparent: true, opacity: 0.95 }),
    );
    this.rulerSegs.frustumCulled = false;
    this.rulerSegs.visible = false;
    this.scene.add(this.rulerSegs);

    // mini kamera
    this.miniCam = new THREE.PerspectiveCamera(38, 16 / 10, 0.1, 4000);
    this.miniCam.up.set(0, 0, 1);

    // baskı tablası
    this.bed = new THREE.Group();
    this.bedSlab = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 0.12),
      new THREE.MeshStandardMaterial({ color: 0x1c2637, roughness: 0.9, metalness: 0.05 }),
    );
    this.bedSlab.receiveShadow = true;
    this.bedMinorPos = new Float32Array(6000 * 3);
    const bedMinorGeo = new THREE.BufferGeometry();
    bedMinorGeo.setAttribute("position", new THREE.BufferAttribute(this.bedMinorPos, 3).setUsage(THREE.DynamicDrawUsage));
    bedMinorGeo.setDrawRange(0, 0);
    this.bedMinor = new THREE.LineSegments(
      bedMinorGeo,
      new THREE.LineBasicMaterial({ color: 0x2c3c58, transparent: true, opacity: 0.55 }),
    );
    this.bedMajorPos = new Float32Array(1600 * 3);
    const bedMajorGeo = new THREE.BufferGeometry();
    bedMajorGeo.setAttribute("position", new THREE.BufferAttribute(this.bedMajorPos, 3).setUsage(THREE.DynamicDrawUsage));
    bedMajorGeo.setDrawRange(0, 0);
    this.bedMajor = new THREE.LineSegments(
      bedMajorGeo,
      new THREE.LineBasicMaterial({ color: 0x42587c, transparent: true, opacity: 0.75 }),
    );
    this.bedOrigin = new THREE.Group();
    const originDot = new THREE.Mesh(
      new THREE.CircleGeometry(0.22, 24),
      new THREE.MeshBasicMaterial({ color: 0xffb454 }),
    );
    originDot.rotation.x = -Math.PI / 2;
    const originRing = new THREE.Mesh(
      new THREE.RingGeometry(0.32, 0.42, 32),
      new THREE.MeshBasicMaterial({ color: 0xffb454, transparent: true, opacity: 0.6, side: THREE.DoubleSide }),
    );
    originRing.rotation.x = -Math.PI / 2;
    this.bedOrigin.add(originDot, originRing);
    this.bed.add(this.bedSlab, this.bedMinor, this.bedMajor, this.bedOrigin);
    this.bed.visible = false;
    this.scene.add(this.bed);

    // eksen üçlüsü (X kırmızı, Y yeşil, Z mavi)
    this.triad = new THREE.Group();
    const TL = 1.7;
    const triadPos = new Float32Array([0, 0, 0, TL, 0, 0, 0, 0, 0, 0, TL, 0, 0, 0, 0, 0, 0, TL]);
    const triadCol = new Float32Array([
      1, 0.42, 0.42, 1, 0.42, 0.42,
      0.32, 0.82, 0.45, 0.32, 0.82, 0.45,
      0.35, 0.66, 1, 0.35, 0.66, 1,
    ]);
    const triadGeo = new THREE.BufferGeometry();
    triadGeo.setAttribute("position", new THREE.BufferAttribute(triadPos, 3));
    triadGeo.setAttribute("color", new THREE.BufferAttribute(triadCol, 3));
    const triadLines = new THREE.LineSegments(
      triadGeo,
      new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.95 }),
    );
    triadLines.renderOrder = 9;
    this.triad.add(triadLines);
    const mkLabel = (letter: string, css: string, x: number, y: number, z: number) => {
      const cv = document.createElement("canvas");
      cv.width = 64;
      cv.height = 64;
      const ctx = cv.getContext("2d");
      if (!ctx) return;
      ctx.font = "bold 46px 'IBM Plex Mono', monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = css;
      ctx.fillText(letter, 32, 34);
      const tex = new THREE.CanvasTexture(cv);
      const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
      spr.position.set(x, y, z);
      spr.scale.set(1.15, 1.15, 1);
      spr.renderOrder = 10;
      this.triad.add(spr);
    };
    mkLabel("X", "#ff6b6b", TL + 0.6, 0, 0);
    mkLabel("Y", "#52d273", 0, TL + 0.6, 0);
    mkLabel("Z", "#5aa9ff", 0, 0, TL + 0.6);
    this.triad.visible = false;
    this.scene.add(this.triad);

    // olaylar
    canvas.addEventListener("pointerdown", this.onDown);
    canvas.addEventListener("pointermove", this.onMove);
    canvas.addEventListener("pointerup", this.onUp);
    canvas.addEventListener("pointercancel", this.onUp);
    canvas.addEventListener("pointerleave", this.onLeave);
    canvas.addEventListener("wheel", this.onWheel, { passive: false });
    canvas.addEventListener("contextmenu", this.onCtx);
    canvas.addEventListener("dblclick", this.onDbl);
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(mount);
    this.resize();

    const loop = () => {
      if (this.disposed) return;
      this.raf = requestAnimationFrame(loop);
      this.tick();
    };
    loop();
  }

  /* ---------------- düzlem / dilim ---------------- */

  private get slice(): number {
    return this.plane === "xy" ? this.layer : this.plane === "xz" ? this.sliceJ : this.sliceI;
  }

  private toWorld(u: number, v: number): [number, number, number] {
    if (this.plane === "xy") return [u, v, this.layer];
    if (this.plane === "xz") return [u, this.sliceJ, v];
    return [this.sliceI, u, v];
  }

  private toScreen(i: number, j: number, k: number): [number, number, number] {
    if (this.plane === "xy") return [i, j, k];
    if (this.plane === "xz") return [i, k, j];
    return [j, k, i];
  }

  private keyAt(u: number, v: number): number | null {
    const [i, j, k] = this.toWorld(u, v);
    if (!inRange(i, j) || k < -512 || k > 1500) return null;
    return keyOf(i, j, k);
  }

  getPlane(): DrawPlane {
    return this.plane;
  }

  getMode(): ViewMode {
    return this.mode;
  }

  /* ---------------- pürüzsüz yüzey (smooth mesh) ----------------
     Marching tetrahedra + Taubin yumuşatma. Yalnızca görsel önizleme —
     baskı hattı hassas voxel STL üzerinde kalır. */

  setSmoothMode(on: boolean) {
    if (this.smoothOn === on) return;
    this.smoothOn = on;
    if (on && this.smoothBuiltVersion !== this.dataVersion) this.rebuildSmooth();
    this.applySmoothVisibility();
  }

  setSmoothIterations(n: number) {
    const v = Math.max(0, Math.min(10, Math.round(n)));
    if (v === this.smoothIters) return;
    this.smoothIters = v;
    this.smoothBuiltVersion = -1; // sonraki açılışta mutlaka yeniden üret
    if (this.smoothOn) {
      this.rebuildSmooth();
      this.applySmoothVisibility();
    }
  }

  getSmoothStats(): { tris: number; verts: number } | null {
    return this.smoothStats;
  }

  private rebuildSmooth() {
    const t0 = performance.now();
    const res = buildSmoothMesh(
      this.data,
      (idx) => {
        const c = this.colOf(idx);
        return [c.r, c.g, c.b];
      },
      this.smoothIters,
    );
    this.smoothBuiltVersion = this.dataVersion;
    if (!res) {
      this.smoothStats = null;
      if (this.smoothMesh) this.smoothMesh.visible = false;
      return;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(res.positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(res.colors, 3));
    geo.setIndex(new THREE.BufferAttribute(res.indices, 1));
    geo.computeVertexNormals();
    if (this.smoothMesh) {
      this.smoothMesh.geometry.dispose();
      this.smoothMesh.geometry = geo;
    } else {
      const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.05 });
      this.smoothMesh = new THREE.Mesh(geo, mat);
      this.smoothMesh.castShadow = true;
      this.smoothMesh.receiveShadow = true;
      this.scene.add(this.smoothMesh);
    }
    this.smoothStats = { tris: res.triangleCount, verts: res.vertexCount };
    this.cb.onToast(
      `Pürüzsüz yüzey hazır · ${res.triangleCount.toLocaleString("tr-TR")} üçgen · ${Math.round(performance.now() - t0)} ms`,
    );
  }

  private applySmoothVisibility() {
    const hasSmooth =
      !!this.smoothMesh && this.smoothMesh.geometry.getAttribute("position").count > 0;
    const show = this.smoothOn && this.mode === "3d" && hasSmooth;
    if (this.smoothMesh) this.smoothMesh.visible = show;
    if (this.fillMesh) this.fillMesh.visible = !show;
  }

  /* ---------------- dilimleyici (3D) ---------------- */

  /** Dilimleyici önizlemeyi aç/kapa. null = kapalı (tüm model görünür). */
  setSlicerLayer(k: number | null) {
    if (k === null) {
      this.slicerActive = false;
      this.slicerLayer = 100000;
    } else {
      this.slicerActive = true;
      this.slicerLayer = Math.round(k);
    }
    this.builtWin = ""; // 3D önbelleğini geçersiz kıl
  }

  isSlicerActive(): boolean {
    return this.slicerActive;
  }

  getSlice(): number {
    return this.slice;
  }

  setSlice(v: number): number {
    const val = Math.max(-512, Math.min(1023, Math.round(v)));
    const changed = val !== this.slice;
    if (this.plane === "xy") this.layer = Math.max(0, val);
    else if (this.plane === "xz") this.sliceJ = val;
    else this.sliceI = val;
    if (changed) {
      this.finalizeStroke(false);
      this.hoverCell = null;
      this.ghost.visible = false;
      this.cb.onCursor(null, false);
      this.emitStats();
    }
    return this.slice;
  }

  setPlane(p: DrawPlane) {
    if (this.plane === p) return;
    if (this.rulerStart || this.rulerEnd) this.clearRuler();
    this.finalizeStroke(false);
    const from = this.plane;

    // 1) akıllı çapa: imleç → son boyanan → model ön kenarı
    let anchor: [number, number, number] | null = null;
    if (this.hoverCell) anchor = this.toWorld(this.hoverCell[0], this.hoverCell[1]);
    else if (this.lastPaintCell) anchor = this.toWorld(this.lastPaintCell[0], this.lastPaintCell[1]);
    else {
      const bb = computeBBox(this.data);
      if (bb) {
        if (p === "xz") anchor = [Math.round((bb.minI + bb.maxI) / 2), bb.minJ, Math.round((bb.minK + bb.maxK) / 2)];
        else if (p === "yz") anchor = [bb.minI, Math.round((bb.minJ + bb.maxJ) / 2), Math.round((bb.minK + bb.maxK) / 2)];
      }
    }

    // 2) düzlemi değiştir, sabit ekseni çapaya oturt
    this.plane = p;
    if (anchor) {
      if (p === "xz") this.sliceJ = anchor[1];
      else if (p === "yz") this.sliceI = anchor[0];
      const [nu, nv] = this.toScreen(anchor[0], anchor[1], anchor[2]);
      this.tcx = nu + 0.5;
      this.tcy = nv + 0.5;
    }

    this.shapeDrag = null;
    this.previewLines.visible = false;
    this.hoverCell = null;
    this.ghost.visible = false;
    this.builtVersion = -1;
    this.axisSig = "";
    this.cb.onCursor(null, false);
    this.emitStats();

    const axisName = p === "xz" ? "Y" : p === "yz" ? "X" : "K";
    const val = p === "xz" ? this.sliceJ : p === "yz" ? this.sliceI : this.layer;
    const via = anchor ? "imleç" : "model kenarı";
    if (p !== "xy" && from !== p) {
      this.cb.onToast(`${p.toUpperCase()} düzlemi · ${axisName}=${val} (${via})`);
    }

    this.snapMiniCamera();
  }

  private snapMiniCamera() {
    if (this.plane === "xy") {
      this.miniAz = 0.62;
      this.miniPol = 0.51;
    } else if (this.plane === "xz") {
      this.miniAz = -Math.PI / 2;
      this.miniPol = 1.35;
    } else {
      this.miniAz = 0;
      this.miniPol = 1.35;
    }
    this.miniZoom = 1;
  }

  /* ---------------- araçlar ---------------- */

  setTool(t: Tool) {
    const leaveRuler = this.tool === "ruler" && t !== "ruler";
    this.tool = t;
    this.finalizeStroke(false);
    if (leaveRuler) this.clearRuler();
    this.updateGhostColor();
    this.refreshCursor();
  }

  setColorIndex(i: number) {
    this.colorIndex = Math.max(0, Math.min(this.paletteColors.length - 1, i));
    this.updateGhostColor();
  }

  setSymmetry(x: boolean, y: boolean, col: number, row: number) {
    this.symX = x;
    this.symY = y;
    this.symCol = Math.round(col);
    this.symRow = Math.round(row);
    this.axisSig = "";
  }

  getModelCenter(): [number, number] | null {
    const bb = computeBBox(this.data);
    if (!bb) return null;
    return [Math.round((bb.minI + bb.maxI) / 2), Math.round((bb.minJ + bb.maxJ) / 2)];
  }

  setStamp(id: string | null) {
    if (!id) {
      this.stampCells = null;
      return;
    }
    const def = STAMPS.find((s) => s.id === id);
    this.stampCells = def ? stampOffsets(def.art) : null;
  }

  setCustomPalette(hexes: string[]) {
    this.paletteColors = [...PALETTE.map((p) => new THREE.Color(p.hex)), ...hexes.map((h) => new THREE.Color(h))];
    this.builtVersion = -1;
    this.miniBuiltVersion = -1;
    this.updateGhostColor();
  }

  /* ---------------- veri işlemleri ---------------- */

  private applyCell(u: number, v: number) {
    if (!this.stroke) return;
    for (const [cu, cv] of this.mirrorCells(u, v)) {
      const k = this.keyAt(cu, cv);
      if (k === null) continue;
      const old = this.data.has(k) ? (this.data.get(k) as number) : null;
      if (this.strokeOp === "erase") {
        if (old === null) continue;
        this.data.delete(k);
      } else {
        if (old === this.colorIndex) continue;
        this.data.set(k, this.colorIndex);
      }
      if (!this.stroke.has(k)) this.stroke.set(k, old);
      this.dataVersion++;
    }
    this.lastPaintCell = [u, v];
  }

  private mirrorCells(u: number, v: number): [number, number][] {
    if (!this.symX && !this.symY) return [[u, v]];
    const out: [number, number][] = [[u, v]];
    const seen = new Set<number>([keyOf(u, v, 0)]);
    const push = (mu: number, mv: number) => {
      const k = keyOf(mu, mv, 0);
      if (!seen.has(k)) { seen.add(k); out.push([mu, mv]); }
    };
    const mu = 2 * this.symCol - u;
    const mv = 2 * this.symRow - v;
    if (this.symX) push(mu, v);
    if (this.symY) push(u, mv);
    if (this.symX && this.symY) push(mu, mv);
    return out;
  }

  private commitMulti(ops: { key: number; old: number | null; next: number | null }[]): number {
    if (ops.length === 0) return 0;
    const snap = new Map<number, number | null>();
    for (const op of ops) {
      if (!snap.has(op.key)) snap.set(op.key, op.old);
      if (op.next === null) this.data.delete(op.key);
      else this.data.set(op.key, op.next);
    }
    this.undoStack.push(snap);
    if (this.undoStack.length > 120) this.undoStack.shift();
    this.redoStack = [];
    this.dataVersion++;
    this.emitStats();
    this.cb.onStroke();
    return ops.length;
  }

  private floodFill(u0: number, v0: number): number {
    const startKey = this.keyAt(u0, v0);
    if (startKey === null) return 0;
    const target = this.data.has(startKey) ? (this.data.get(startKey) as number) : null;
    if (target === this.colorIndex) return 0;

    const bb = computeBBox(this.data);
    const lo = -2, hi = 2;
    const minU = bb ? Math.min(bb.minI, bb.minJ) + lo : u0 - 1;
    const maxU = bb ? Math.max(bb.maxI, bb.maxJ, bb.minK, bb.maxK) + hi : u0 + 1;

    const visited = new Set<number>();
    const queue: [number, number][] = [[u0, v0]];
    const region: [number, number][] = [];
    visited.add(keyOf(u0, v0, 0));
    let open = false;

    while (queue.length > 0) {
      const [cu, cv] = queue.pop() as [number, number];
      region.push([cu, cv]);
      if (region.length > FILL_LIMIT) {
        this.cb.onToast("Bölge çok büyük — kova için etrafını çevir");
        return 0;
      }
      if (cu <= minU || cu >= maxU || cv <= minU || cv >= maxU) open = true;
      for (const [nu, nv] of [[cu + 1, cv], [cu - 1, cv], [cu, cv + 1], [cu, cv - 1]] as [number, number][]) {
        const nk = this.keyAt(nu, nv);
        const nid = keyOf(nu, nv, 0);
        if (nk === null || visited.has(nid)) continue;
        const state = this.data.has(nk) ? (this.data.get(nk) as number) : null;
        if (state !== target) continue;
        visited.add(nid);
        queue.push([nu, nv]);
      }
    }

    if (open) {
      this.cb.onToast("Bölge kapalı değil — önce etrafını çevir");
      return 0;
    }

    const ops: { key: number; old: number | null; next: number | null }[] = [];
    const done = new Set<number>();
    for (const [cu, cv] of region) {
      for (const [mu, mv] of this.mirrorCells(cu, cv)) {
        const k = this.keyAt(mu, mv);
        if (k === null || done.has(k)) continue;
        done.add(k);
        const old = this.data.has(k) ? (this.data.get(k) as number) : null;
        if (old === this.colorIndex) continue;
        ops.push({ key: k, old, next: this.colorIndex });
      }
    }
    if (ops.length > 0) {
      this.commitMulti(ops);
      this.lastPaintCell = [u0, v0];
      return ops.length;
    }
    return 0;
  }

  private applyStampAt(u0: number, v0: number): number {
    if (!this.stampCells || this.stampCells.length === 0) {
      this.cb.onToast("Önce bir damga kalıbı seç");
      return 0;
    }
    const ops: { key: number; old: number | null; next: number | null }[] = [];
    const done = new Set<number>();
    for (const [cu, cv] of this.mirrorCells(u0, v0)) {
      for (const [du, dv] of this.stampCells) {
        const k = this.keyAt(cu + du, cv + dv);
        if (k === null || done.has(k)) continue;
        done.add(k);
        const old = this.data.has(k) ? (this.data.get(k) as number) : null;
        if (old === this.colorIndex) continue;
        ops.push({ key: k, old, next: this.colorIndex });
      }
    }
    if (ops.length > 0) {
      this.commitMulti(ops);
      this.lastPaintCell = [u0, v0];
      return ops.length;
    }
    return 0;
  }

  /* ---------------- imperative yazma yüzeyi ----------------
     Model tool'ları bu metotlarla çalışır. Hepsi commitMulti'den geçtiği için
     otomatik kayıt + istatistik + undo zinciri korunur. Koordinatlar (u,v) = 2D ızgara hücresi;
     işlenen hücre sayısını döndürürler (0 = değişiklik yok). */

  /** color çözümle: undefined → seçili renk; "0"-"9" → palet indeksi; "#hex" → özel renk (palete eklenir). */
  private resolveColor(color?: string | number): number {
    if (color === undefined || color === null) return this.colorIndex;
    if (typeof color === "number") {
      return Math.max(0, Math.min(this.paletteColors.length - 1, Math.round(color)));
    }
    const s = String(color).trim();
    if (/^\d+$/.test(s)) return Math.max(0, Math.min(this.paletteColors.length - 1, parseInt(s, 10)));
    const hex = (s.startsWith("#") ? s : `#${s}`).toLowerCase();
    const existing = this.paletteColors.findIndex((c) => `#${c.getHexString()}` === hex);
    if (existing >= 0) return existing;
    this.setCustomPalette([hex]);
    return this.paletteColors.length - 1;
  }

  /** Tek hücre boya. color: palet indeksi 0-9 ya da hex. */
  paintCell(x: number, y: number, color?: string | number): number {
    const col = this.resolveColor(color);
    const ops: { key: number; old: number | null; next: number | null }[] = [];
    for (const [cu, cv] of this.mirrorCells(Math.round(x), Math.round(y))) {
      const k = this.keyAt(cu, cv);
      if (k === null) continue;
      const old = this.data.has(k) ? (this.data.get(k) as number) : null;
      if (old === col) continue;
      ops.push({ key: k, old, next: col });
    }
    this.lastPaintCell = [Math.round(x), Math.round(y)];
    return ops.length ? this.commitMulti(ops) : 0;
  }

  /** Tek hücre sil. */
  eraseCell(x: number, y: number): number {
    const ops: { key: number; old: number | null; next: number | null }[] = [];
    for (const [cu, cv] of this.mirrorCells(Math.round(x), Math.round(y))) {
      const k = this.keyAt(cu, cv);
      if (k === null) continue;
      const old = this.data.has(k) ? (this.data.get(k) as number) : null;
      if (old === null) continue;
      ops.push({ key: k, old, next: null });
    }
    this.lastPaintCell = [Math.round(x), Math.round(y)];
    return ops.length ? this.commitMulti(ops) : 0;
  }

  /** (x,y)'den başlayan kapalı boş bölgeyi seçili renkle doldur (kova). */
  fillAt(x: number, y: number): number {
    return this.floodFill(Math.round(x), Math.round(y));
  }

  /** (x,y)'e kalıp basar. stamp verilmezse seçili kalıp kullanılır. */
  stampAt(x: number, y: number, stamp?: string): number {
    if (stamp) this.setStamp(stamp);
    if (!this.stampCells || this.stampCells.length === 0) return 0;
    return this.applyStampAt(Math.round(x), Math.round(y));
  }

  /** Toplu boyama — tek commitMulti (tek undo adımı, son renk kazanır). */
  paintCells(ops: { x: number; y: number; color?: string | number }[]): number {
    const flat: { key: number; old: number | null; next: number | null }[] = [];
    for (const op of ops) {
      const col = this.resolveColor(op.color);
      for (const [cu, cv] of this.mirrorCells(Math.round(op.x), Math.round(op.y))) {
        const k = this.keyAt(cu, cv);
        if (k === null) continue;
        const old = this.data.has(k) ? (this.data.get(k) as number) : null;
        if (old === col) continue;
        flat.push({ key: k, old, next: col });
      }
      this.lastPaintCell = [Math.round(op.x), Math.round(op.y)];
    }
    return flat.length ? this.commitMulti(flat) : 0;
  }

  /** (x,y) sol üst köşe; w×h boyutunda dolu dikdörtgen. */
  drawRect(x: number, y: number, w: number, h: number, color?: string | number): number {
    const col = this.resolveColor(color);
    const x0 = Math.round(x), y0 = Math.round(y);
    const w0 = Math.max(1, Math.round(w)), h0 = Math.max(1, Math.round(h));
    const ops: { key: number; old: number | null; next: number | null }[] = [];
    for (let u = x0; u < x0 + w0; u++) {
      for (let v = y0; v < y0 + h0; v++) {
        for (const [cu, cv] of this.mirrorCells(u, v)) {
          const k = this.keyAt(cu, cv);
          if (k === null) continue;
          const old = this.data.has(k) ? (this.data.get(k) as number) : null;
          if (old === col) continue;
          ops.push({ key: k, old, next: col });
        }
      }
    }
    this.lastPaintCell = [x0, y0];
    return ops.length ? this.commitMulti(ops) : 0;
  }

  /** 3D katı prizma (kutu) — düzlemden BAĞIMSIZ, dünya koordinatında (i,j,k) yazar.
      (x,y,z) köşesinden w×h genişliğinde, d dilim k yönünde yukarı. Tek commitMulti. */
  drawBox(x: number, y: number, z: number, w: number, h: number, d: number, color?: string | number): number {
    const col = this.resolveColor(color);
    const x0 = Math.round(x), y0 = Math.round(y), z0 = Math.round(z);
    const w0 = Math.max(1, Math.round(w)), h0 = Math.max(1, Math.round(h)), d0 = Math.max(1, Math.round(d));
    const ops: { key: number; old: number | null; next: number | null }[] = [];
    for (let dz = 0; dz < d0; dz++) {
      const k = z0 + dz;
      if (k < -512 || k > 1500) continue;
      for (let i = x0; i < x0 + w0; i++) {
        for (let j = y0; j < y0 + h0; j++) {
          if (!inRange(i, j)) continue;
          const key = keyOf(i, j, k);
          const old = this.data.has(key) ? (this.data.get(key) as number) : null;
          if (old === col) continue;
          ops.push({ key, old, next: col });
        }
      }
    }
    this.lastPaintCell = [x0, y0];
    return ops.length ? this.commitMulti(ops) : 0;
  }

  /** 3D katı prizma sil — drawBox'un tersi; aynı koordinat/bağlam kuralları. */
  eraseBox(x: number, y: number, z: number, w: number, h: number, d: number): number {
    const x0 = Math.round(x), y0 = Math.round(y), z0 = Math.round(z);
    const w0 = Math.max(1, Math.round(w)), h0 = Math.max(1, Math.round(h)), d0 = Math.max(1, Math.round(d));
    const ops: { key: number; old: number | null; next: number | null }[] = [];
    for (let dz = 0; dz < d0; dz++) {
      const k = z0 + dz;
      if (k < -512 || k > 1500) continue;
      for (let i = x0; i < x0 + w0; i++) {
        for (let j = y0; j < y0 + h0; j++) {
          if (!inRange(i, j)) continue;
          const key = keyOf(i, j, k);
          const old = this.data.has(key) ? (this.data.get(key) as number) : null;
          if (old === null) continue;
          ops.push({ key, old, next: null });
        }
      }
    }
    this.lastPaintCell = [x0, y0];
    return ops.length ? this.commitMulti(ops) : 0;
  }

  /** Çatı — gerçek üst katmanın hemen üstüne, sınırlardan hesaplanır (duvarla örtüşme garantili).
      style: flat (tek slab) | pyramid (sivri tepe) | ridge (beşik/üçgen, sırt X boyunca).
      overhang 0-3 hücre saçak. Renk opsiyonel. Tek commitMulti. */
  buildRoof(opts?: { style?: string; overhang?: number; color?: string | number }): number {
    const bb = computeBBox(this.data);
    if (!bb) return 0;
    const col = this.resolveColor(opts?.color);
    const o = Math.max(0, Math.min(3, Math.round(opts?.overhang ?? 1)));
    const top = bb.maxK + 1; // en üst katmanın hemen üstü → örtüşme garantili
    const xi0 = bb.minI - o, xi1 = bb.maxI + o;
    const yj0 = bb.minJ - o, yj1 = bb.maxJ + o;
    const style = String(opts?.style ?? "flat");
    const ops: { key: number; old: number | null; next: number | null }[] = [];
    const put = (i: number, j: number, k: number) => {
      if (k < -512 || k > 1500) return;
      if (!inRange(i, j)) return;
      const key = keyOf(i, j, k);
      const old = this.data.has(key) ? (this.data.get(key) as number) : null;
      if (old === col) return;
      ops.push({ key, old, next: col });
    };
    if (style === "pyramid") {
      // her katman l'de footprint iki yandan l küçülür; tepe tek voxel
      for (let l = 0, s0 = xi1 - xi0, s1 = yj1 - yj0; s0 >= 0 && s1 >= 0; l++, s0 -= 2, s1 -= 2) {
        const k = top + l;
        for (let i = xi0 + l; i <= xi1 - l; i++) {
          for (let j = yj0 + l; j <= yj1 - l; j++) put(i, j, k);
        }
      }
    } else if (style === "ridge") {
      // beşik çatı: sırt çizgisi X boyunca, Y'de üçgen kesit — ortada top+ridgeH, saçakta top.
      // Her sütun top'tan çatı yüksekliğine kadar doldurulur (katı, içi boş değil).
      const ridgeH = Math.max(2, Math.ceil((yj1 - yj0) / 2));
      const yc = (yj0 + yj1) / 2;
      const halfY = Math.max(1, (yj1 - yj0) / 2);
      for (let i = xi0; i <= xi1; i++) {
        for (let j = yj0; j <= yj1; j++) {
          const f = 1 - Math.abs(j - yc) / halfY; // 1 sırtta, 0 saçakta
          const h = Math.round(f * ridgeH);
          for (let k = top; k <= top + h; k++) put(i, j, k);
        }
      }
    } else {
      // flat — tek slab
      for (let i = xi0; i <= xi1; i++) {
        for (let j = yj0; j <= yj1; j++) put(i, j, top);
      }
    }
    this.lastPaintCell = [xi0, yj0];
    return ops.length ? this.commitMulti(ops) : 0;
  }

  /** Merkez (x,y), yarıçap r — dolu daire (Euclidean mesafe). */
  drawCircle(x: number, y: number, r: number, color?: string | number): number {
    const col = this.resolveColor(color);
    const cx = Math.round(x), cy = Math.round(y);
    const rad = Math.max(1, Math.round(r));
    const r2 = rad * rad;
    const ops: { key: number; old: number | null; next: number | null }[] = [];
    for (let u = cx - rad; u <= cx + rad; u++) {
      for (let v = cy - rad; v <= cy + rad; v++) {
        const dx = u - cx, dy = v - cy;
        if (dx * dx + dy * dy > r2) continue;
        for (const [cu, cv] of this.mirrorCells(u, v)) {
          const k = this.keyAt(cu, cv);
          if (k === null) continue;
          const old = this.data.has(k) ? (this.data.get(k) as number) : null;
          if (old === col) continue;
          ops.push({ key: k, old, next: col });
        }
      }
    }
    this.lastPaintCell = [cx, cy];
    return ops.length ? this.commitMulti(ops) : 0;
  }

  private shapeCellList(): [number, number][] {
    if (!this.shapeDrag) return [];
    const d = this.shapeDrag;
    const u0 = Math.min(d.i0, d.i1), u1 = Math.max(d.i0, d.i1);
    const v0 = Math.min(d.j0, d.j1), v1 = Math.max(d.j0, d.j1);
    const out: [number, number][] = [];
    if (this.tool === "rect") {
      for (let u = u0; u <= u1; u++) for (let v = v0; v <= v1; v++) out.push([u, v]);
    } else {
      const cu = (u0 + u1) / 2, cv = (v0 + v1) / 2;
      const ru = (u1 - u0) / 2 + 0.5, rv = (v1 - v0) / 2 + 0.5;
      for (let u = u0; u <= u1; u++)
        for (let v = v0; v <= v1; v++) {
          const dx = (u - cu) / ru, dy = (v - cv) / rv;
          if (dx * dx + dy * dy <= 1) out.push([u, v]);
        }
    }
    return out.slice(0, 20000);
  }

  private rebuildPreview() {
    const cells = this.shapeCellList();
    const inSet = new Set<number>();
    for (const [u, v] of cells) {
      const k = this.keyAt(u, v);
      if (k !== null) inSet.add(k);
    }
    const P = this.previewPos;
    let n = 0;
    const z = 0.03;
    const seg = (x1: number, y1: number, x2: number, y2: number) => {
      if (n > 15998) return;
      P[n * 3] = x1; P[n * 3 + 1] = y1; P[n * 3 + 2] = z; n++;
      P[n * 3] = x2; P[n * 3 + 1] = y2; P[n * 3 + 2] = z; n++;
    };
    const has = (u: number, v: number) => {
      const k = this.keyAt(u, v);
      return k !== null && inSet.has(k);
    };
    for (const [u, cv] of cells) {
      if (n > 15984) break;
      const x = u, y = cv;
      if (!has(u, cv - 1)) seg(x, y, x + 1, y);
      if (!has(u + 1, cv)) seg(x + 1, y, x + 1, y + 1);
      if (!has(u, cv + 1)) seg(x + 1, y + 1, x, y + 1);
      if (!has(u - 1, cv)) seg(x, y + 1, x, y);
    }
    (this.previewLines.geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    this.previewLines.geometry.setDrawRange(0, n);
    this.previewLines.visible = n > 0;
  }

  /* ---------------- seçim aracı ---------------- */

  private finishSelDrag(d: { i0: number; j0: number; i1: number; j1: number }) {
    const u0 = Math.min(d.i0, d.i1), u1 = Math.max(d.i0, d.i1);
    const v0 = Math.min(d.j0, d.j1), v1 = Math.max(d.j0, d.j1);
    const cells = new Map<number, number>();
    let anchor: [number, number] | null = null;
    for (let u = u0; u <= u1; u++)
      for (let v = v0; v <= v1; v++) {
        const k = this.keyAt(u, v);
        if (k === null) continue;
        const c = this.data.get(k);
        if (c === undefined) continue;
        if (!anchor) anchor = [u, v];
        cells.set(k, c);
      }
    if (cells.size === 0 || !anchor) {
      this.cb.onToast("Seçim boş — dolu bir bölge seç");
      return;
    }
    const copy = this.altHeld;
    const snap = new Map<number, number | null>();
    if (!copy) {
      for (const k of cells.keys()) {
        snap.set(k, this.data.get(k) ?? null);
        this.data.delete(k);
      }
      this.dataVersion++;
    }
    this.selCells = cells;
    this.selWasCut = !copy;
    this.selNeverPlaced = true;
    this.selAnchor = anchor;
    this.selCursor = this.hoverCell ?? anchor;
    if (!copy) {
      this.undoStack.push(snap);
      if (this.undoStack.length > 120) this.undoStack.shift();
      this.redoStack = [];
      this.cb.onStroke();
    }
    this.updateSelPreview();
    this.emitStats();
  }

  private updateSelPreview() {
    const visible = this.selCells && this.selCursor && this.selAnchor && this.mode === "2d";
    if (!visible || !this.selCells || !this.selCursor || !this.selAnchor) {
      if (this.selPreview) this.selPreview.visible = false;
      return;
    }
    const du = this.selCursor[0] - this.selAnchor[0];
    const dv = this.selCursor[1] - this.selAnchor[1];
    const n = this.selCells.size;
    this.ensureSelCapacity(n);
    const mesh = this.selPreview;
    if (!mesh) return;
    let i = 0;
    for (const [key, c] of this.selCells) {
      const [wi, wj, wk] = decodeKey(key);
      const [ou, ov] = this.toScreen(wi, wj, wk);
      const [tu, tv] = [ou + du, ov + dv];
      this.tmpMat.makeTranslation(tu + 0.5, tv + 0.5, 0.02);
      mesh.setMatrixAt(i, this.tmpMat);
      mesh.setColorAt(i, this.colOf(c));
      i++;
    }
    mesh.count = i;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.visible = true;
  }

  private ensureSelCapacity(n: number) {
    if (this.selPreview && this.selPreviewCap >= n) return;
    const cap = Math.max(n, this.selPreviewCap * 2, 512);
    const mesh = new THREE.InstancedMesh(this.boxGeo2d, this.selPreviewMat, cap);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.renderOrder = 5;
    if (this.selPreview) {
      this.scene.remove(this.selPreview);
      this.selPreview.dispose();
    }
    this.selPreview = mesh;
    this.selPreviewCap = cap;
    this.scene.add(mesh);
  }

  private placeSelection() {
    if (!this.selCells || !this.selCursor || !this.selAnchor) return;
    const du = this.selCursor[0] - this.selAnchor[0];
    const dv = this.selCursor[1] - this.selAnchor[1];
    const ops: { key: number; old: number | null; next: number | null }[] = [];
    for (const [key, c] of this.selCells) {
      const [wi, wj, wk] = decodeKey(key);
      const [ou, ov] = this.toScreen(wi, wj, wk);
      const k = this.keyAt(ou + du, ov + dv);
      if (k === null) continue;
      const old = this.data.has(k) ? (this.data.get(k) as number) : null;
      if (old === c) continue;
      ops.push({ key: k, old, next: c });
    }
    this.commitMulti(ops);
    this.selNeverPlaced = false;
    const anchorKey = [...this.selCells.keys()][0];
    const [gi, gj] = decodeKey(anchorKey);
    const [au, av] = this.toScreen(gi, gj, 0);
    this.lastPaintCell = [au + du, av + dv];
    this.clearSelection();
  }

  private cancelSelection() {
    if (this.selWasCut && this.selNeverPlaced && this.selCells) {
      const ops: { key: number; old: number | null; next: number | null }[] = [];
      for (const [key, c] of this.selCells) ops.push({ key, old: null, next: c });
      this.commitMulti(ops);
    }
    this.clearSelection();
  }

  private clearSelection() {
    this.selCells = null;
    this.selAnchor = null;
    this.selCursor = null;
    this.selWasCut = false;
    this.selNeverPlaced = true;
    if (this.selPreview) this.selPreview.visible = false;
    this.refreshCursor();
  }

  private hasSelection(): boolean {
    return this.selCells !== null && this.selCells.size > 0;
  }

  /* ---------------- çetvel (ölçüm) ---------------- */

  private rulerClick(cell: [number, number]) {
    const w = this.toWorld(cell[0], cell[1]);
    if (!this.rulerStart) {
      this.rulerStart = w;
      this.rulerEnd = null;
    } else if (!this.rulerEnd) {
      this.rulerEnd = w;
    } else {
      // üçüncü tıklama → yeni ölçüm başlat
      this.rulerStart = w;
      this.rulerEnd = null;
    }
    this.updateRuler();
  }

  clearRuler() {
    if (!this.rulerStart && !this.rulerEnd) return;
    this.rulerStart = null;
    this.rulerEnd = null;
    this.rulerActive = false;
    this.rulerMid = null;
    if (this.rulerSprite) this.rulerSprite.visible = false;
    this.cb.onMeasure(null);
    this.applyRulerModeVis();
  }

  /** Overlay'i (uç artıları + doğru) yeniden çizer, ölçümü yayınlar. */
  private updateRuler() {
    const Z = 0.08;
    const P = this.rulerPos;
    let n = 0;
    const put = (x: number, y: number) => {
      P[n * 3] = x;
      P[n * 3 + 1] = y;
      P[n * 3 + 2] = Z;
      n++;
    };
    const cv = (w: [number, number, number]): [number, number] => {
      const s = this.toScreen(w[0], w[1], w[2]);
      return [s[0] + 0.5, s[1] + 0.5];
    };
    const cross = (u: number, v: number) => {
      const c = 0.32;
      put(u - c, v);
      put(u + c, v);
      put(u, v - c);
      put(u, v + c);
    };
    const a = this.rulerStart ? cv(this.rulerStart) : null;
    const b = this.rulerEnd ? cv(this.rulerEnd) : null;
    if (a) cross(a[0], a[1]);
    if (a && b) {
      put(a[0], a[1]);
      put(b[0], b[1]);
    }
    if (b) cross(b[0], b[1]);
    (this.rulerSegs.geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    this.rulerSegs.geometry.setDrawRange(0, n);

    this.rulerActive = !!this.rulerStart;
    if (a && b && this.rulerStart && this.rulerEnd) {
      const [i0, j0, k0] = this.rulerStart;
      const [i1, j1, k1] = this.rulerEnd;
      const count = Math.max(Math.abs(i1 - i0), Math.abs(j1 - j0), Math.abs(k1 - k0)) + 1;
      const mm = count * this.kpSizeMm;
      const mmStr = mm.toLocaleString("tr-TR", { maximumFractionDigits: 2 });
      this.cb.onMeasure({ count, mm, kp: this.kpSizeMm, label: `${count} küp · ${mmStr} mm` });
      this.rulerMid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      this.buildRulerSprite(`${count} küp · ${mmStr} mm`);
    } else {
      this.rulerMid = null;
      this.cb.onMeasure(null);
      if (this.rulerSprite) this.rulerSprite.visible = false;
    }
    this.applyRulerModeVis();
  }

  /** Tuval üzerinde küçük etiket (sprite) oluştur / güncelle. */
  private buildRulerSprite(text: string) {
    const font = "600 14px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    const c = document.createElement("canvas");
    const g = c.getContext("2d");
    if (!g) return;
    g.font = font;
    const tw = g.measureText(text).width;
    const padX = 12;
    c.width = Math.ceil(tw + padX * 2);
    c.height = 34;
    const w = c.width;
    const h = c.height;
    const r = 8;
    g.textBaseline = "middle";
    g.font = font;
    g.beginPath();
    g.moveTo(r, 0);
    g.arcTo(w, 0, w, h, r);
    g.arcTo(w, h, 0, h, r);
    g.arcTo(0, h, 0, 0, r);
    g.arcTo(0, 0, w, 0, r);
    g.closePath();
    g.fillStyle = "rgba(13, 18, 28, 0.92)";
    g.fill();
    g.lineWidth = 1.5;
    g.strokeStyle = "#ffb454";
    g.stroke();
    g.fillStyle = "#ffcf7a";
    g.fillText(text, padX, h / 2 + 0.5);

    // Etiketi her seferinde yeniden üret: eski sprite/doku GPU'dan tamamen atılır,
    // böylece kısa ölçümlerde önceki (daha geniş) etiketin kırıntısı kalmaz.
    if (this.rulerSprite) {
      this.scene.remove(this.rulerSprite);
      const m = this.rulerSprite.material as THREE.SpriteMaterial;
      if (m.map) m.map.dispose();
      m.dispose();
      this.rulerSprite = null;
      this.rulerTex = null;
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.rulerTex = tex;
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false });
    this.rulerSprite = new THREE.Sprite(mat);
    this.rulerSprite.renderOrder = 40;
    this.rulerSprite.frustumCulled = false;
    this.rulerSprite.visible = false;
    this.scene.add(this.rulerSprite);
    this.rulerPx = [c.width, c.height];
  }

  /** Mod değişince overlay görünürlüğünü senkronla (yalnızca 2D; sprite çift uç varken). */
  private applyRulerModeVis() {
    const vis = this.mode === "2d" && this.rulerActive;
    this.rulerSegs.visible = vis;
    if (this.rulerSprite) this.rulerSprite.visible = vis && this.rulerMid !== null;
  }

  /* ---------------- geri al / yinele ---------------- */

  undo() {
    const snap = this.undoStack.pop();
    if (!snap) return;
    const rev = new Map<number, number | null>();
    for (const [k, old] of snap) {
      rev.set(k, this.data.has(k) ? (this.data.get(k) as number) : null);
      if (old === null) this.data.delete(k);
      else this.data.set(k, old);
    }
    this.redoStack.push(rev);
    this.dataVersion++;
    this.emitStats();
    this.cb.onStroke();
  }

  redo() {
    const snap = this.redoStack.pop();
    if (!snap) return;
    const rev = new Map<number, number | null>();
    for (const [k, old] of snap) {
      rev.set(k, this.data.has(k) ? (this.data.get(k) as number) : null);
      if (old === null) this.data.delete(k);
      else this.data.set(k, old);
    }
    this.undoStack.push(rev);
    this.dataVersion++;
    this.emitStats();
    this.cb.onStroke();
  }

  clearAll(): number {
    if (this.data.size === 0) return 0;
    const ops: { key: number; old: number | null; next: number | null }[] = [];
    for (const [k, c] of this.data) ops.push({ key: k, old: c, next: null });
    this.commitMulti(ops);
    return ops.length;
  }

  /* ---------------- katman pano ---------------- */

  copyLayerCells(k: number): [number, number, number][] {
    const out: [number, number, number][] = [];
    for (const [key, c] of this.data) {
      const [i, j, ck] = decodeKey(key);
      if (ck === k) out.push([i, j, c]);
    }
    return out;
  }

  pasteLayerTo(cells: [number, number, number][], targetK: number): number {
    if (targetK < 0 || targetK > 1023 || cells.length === 0) return 0;
    const ops: { key: number; old: number | null; next: number | null }[] = [];
    for (const [i, j, c] of cells) {
      if (!inRange(i, j)) continue;
      const key = keyOf(i, j, targetK);
      const old = this.data.has(key) ? (this.data.get(key) as number) : null;
      ops.push({ key, old, next: c });
    }
    return this.commitMulti(ops);
  }

  jumpToLastPaint(): boolean {
    if (!this.lastPaintCell) return false;
    this.tcx = this.lastPaintCell[0] + 0.5;
    this.tcy = this.lastPaintCell[1] + 0.5;
    return true;
  }

  setOverhangCells(cells: [number, number, number][]) {
    if (cells.length === 0) {
      if (this.overhangMesh) this.overhangMesh.count = 0;
      return;
    }
    if (!this.overhangMesh || this.overhangCap < cells.length) {
      const cap = Math.max(cells.length, this.overhangCap * 2, 1024);
      if (!this.overhangGeo) this.overhangGeo = new THREE.BoxGeometry(1, 1, 1);
      if (!this.overhangMat)
        this.overhangMat = new THREE.MeshBasicMaterial({ color: 0xff6b6b, transparent: true, opacity: 0.55, depthWrite: false });
      const mesh = new THREE.InstancedMesh(this.overhangGeo, this.overhangMat, cap);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.renderOrder = 4;
      if (this.overhangMesh) {
        this.scene.remove(this.overhangMesh);
        this.overhangMesh.dispose();
      }
      this.overhangMesh = mesh;
      this.overhangCap = cap;
      this.scene.add(mesh);
    }
    const mesh = this.overhangMesh;
    const red = new THREE.Color(0xff6b6b);
    const scl = new THREE.Vector3(1.06, 1.06, 1.06);
    let n = 0;
    for (const [i, j, k] of cells) {
      this.tmpMat.makeTranslation(i + 0.5, j + 0.5, k + 0.5);
      this.tmpMat.scale(scl);
      mesh.setMatrixAt(n, this.tmpMat);
      mesh.setColorAt(n, red);
      n++;
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  /** Otomatik üretilen destek sütunlarını çizer (null/boş liste = gizle). Modele dokunmaz. */
  setSupportCells(cells: [number, number, number][] | null) {
    if (!cells || cells.length === 0) {
      if (this.supportMesh) {
        this.supportMesh.count = 0;
        this.supportMesh.visible = false;
      }
      return;
    }
    if (!this.supportMesh || this.supportCap < cells.length) {
      const cap = Math.max(cells.length, this.supportCap * 2, 1024);
      if (!this.supportMat) {
        this.supportMat = new THREE.MeshStandardMaterial({
          color: 0x3fd6b6,
          transparent: true,
          opacity: 0.55,
          roughness: 0.5,
          metalness: 0.05,
          depthWrite: false,
        });
      }
      const mesh = new THREE.InstancedMesh(this.boxGeo3d, this.supportMat, cap);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.renderOrder = 6;
      if (this.supportMesh) {
        this.scene.remove(this.supportMesh);
        this.supportMesh.dispose();
      }
      this.supportMesh = mesh;
      this.supportCap = cap;
      this.scene.add(mesh);
    }
    const mesh = this.supportMesh;
    let n = 0;
    for (const [i, j, k] of cells) {
      this.tmpMat.makeTranslation(i + 0.5, j + 0.5, k + 0.5);
      mesh.setMatrixAt(n, this.tmpMat);
      n++;
    }
    mesh.count = n;
    mesh.visible = this.mode === "3d";
    mesh.instanceMatrix.needsUpdate = true;
  }

  /* ---------------- veri erişimi ---------------- */

  getData(): Map<number, number> {
    return this.data;
  }

  getKpSizeMm(): number {
    return this.kpSizeMm;
  }

  replaceData(cells: [number, number, number, number][], kpSizeMm: number): number {
    this.data.clear();
    this.undoStack = [];
    this.redoStack = [];
    let n = 0;
    for (const cell of cells) {
      const ci = cell[0], cj = cell[1];
      const ck = cell.length >= 4 ? (cell[2] ?? 0) : 0;
      const raw = cell.length >= 4 ? cell[3] : cell[2];
      if (!inRange(ci, cj) || !Number.isFinite(raw)) continue;
      this.data.set(keyOf(ci, cj, ck), Math.min(Math.max(0, Math.round(raw)), this.paletteColors.length - 1));
      n++;
    }
    this.kpSizeMm = kpSizeMm;
    this.dataVersion++;
    this.builtVersion = -1;
    this.miniBuiltVersion = -1;
    this.fitView();
    this.emitStats();
    this.cb.onStroke();
    return n;
  }

  /* ---------------- kamera ---------------- */

  fitView() {
    if (this.data.size === 0) {
      this.tcx = 0;
      this.tcy = 0;
      this.ts = BASE_S;
      this.cb.onZoom(this.zoomPct());
      return;
    }
    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
    for (const key of this.data.keys()) {
      const [i, j, k] = decodeKey(key);
      const [u, v] = this.toScreen(i, j, k);
      if (u < minU) minU = u;
      if (u > maxU) maxU = u;
      if (v < minV) minV = v;
      if (v > maxV) maxV = v;
    }
    const bw = maxU - minU + 1;
    const bh = maxV - minV + 1;
    this.ts = THREE.MathUtils.clamp(Math.min(this.w / (bw + 7), this.h / (bh + 7)), MIN_S, 130);
    this.tcx = (minU + maxU + 1) / 2;
    this.tcy = (minV + maxV + 1) / 2;
    this.cb.onZoom(this.zoomPct());
  }

  resetView() {
    this.tcx = 0;
    this.tcy = 0;
    this.ts = BASE_S;
    this.cb.onZoom(this.zoomPct());
  }

  private zoomPct(): number {
    return Math.round((this.s / BASE_S) * 100);
  }

  /* ---------------- mod ---------------- */

  setMode(m: ViewMode) {
    if (this.mode === m) return;
    this.finalizeStroke(false);
    this.mode = m;
    this.gridLines.visible = m === "2d";
    this.previewLines.visible = false;
    this.selRect.visible = false;
    this.selDrag = null;
    if (this.selPreview) this.selPreview.visible = false;
    this.axisLines.visible = false;
    this.axisSig = "";
    if (m === "3d") {
      this.updateSelPreview();
      const bb = computeBBox(this.data);
      const bx = bb ? (bb.minI + bb.maxI + 1) / 2 : 0;
      const by = bb ? (bb.minJ + bb.maxJ + 1) / 2 : 0;
      const bz = bb ? (bb.minK + bb.maxK) / 2 : 0;
      const ext = bb ? Math.max(bb.maxI - bb.minI, bb.maxJ - bb.minJ, bb.maxK - bb.minK) + 6 : 16;
      const dist = Math.max(ext * 1.35, 10);
      this.persp.position.set(bx + dist * 0.42, by - dist * 0.92, bz + dist * 0.7);
      this.controls.target.set(bx, by, bz);
      this.controls.enabled = true;
      const half = Math.max(ext, 24);
      const sc = this.key.shadow.camera as THREE.OrthographicCamera;
      sc.left = -half; sc.right = half; sc.top = half; sc.bottom = -half; sc.far = half * 6;
      sc.updateProjectionMatrix();
      this.key.intensity = 1.9;
      this.key.castShadow = true;
      this.front.intensity = 0.22;
    } else {
      this.controls.enabled = false;
      this.controls.autoRotate = false;
      this.key.intensity = 0.55;
      this.key.castShadow = false;
      this.front.intensity = 1.45;
      this.gridSig = "";
      this.builtWin = "";
      this.updateSelPreview();
    }
    if (this.fillMesh) this.fillMesh.geometry = m === "3d" ? this.boxGeo3d : this.boxGeo2d;
    if (m === "3d" && this.miniMesh) this.miniMesh.count = 0;
    // pürüzsüz yüzey: 3D'ye geçerken bayatsa yeniden üret, görünürlüğü moda göre ayarla
    if (m === "3d" && this.smoothOn && this.smoothBuiltVersion !== this.dataVersion) this.rebuildSmooth();
    this.applySmoothVisibility();
    this.builtVersion = -1;
    this.miniBuiltVersion = -1;
    this.applyRulerModeVis();
    this.refreshCursor();
    this.emitMiniLayout();
  }

  setAutoRotate(b: boolean) {
    this.controls.autoRotate = b && this.mode === "3d";
  }

  setGhostDepth(n: number) {
    this.ghostDepth = Math.max(0, Math.min(5, Math.round(n)));
  }

  setGhostOpacity(v: number) {
    this.ghostOpacity = THREE.MathUtils.clamp(v, 0.05, 0.85);
  }

  setMiniEnabled(b: boolean) {
    if (this.miniEnabled === b) return;
    this.miniEnabled = b;
    this.miniBuiltVersion = -1;
    if (!b && this.miniMesh) this.miniMesh.count = 0;
    this.emitMiniLayout();
  }

  setBedVisible(b: boolean) {
    this.bedVisible = b;
    this.bedSig = "";
  }

  /* ---------------- işaretçi ---------------- */

  private cellFromEvent(e: PointerEvent | MouseEvent): [number, number] | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const wx = this.cx + (px - this.w / 2) / this.s;
    const wy = this.cy - (py - this.h / 2) / this.s;
    return [Math.floor(wx), Math.floor(wy)];
  }

  private miniRect(): { x: number; y: number; w: number; h: number } | null {
    if (!this.miniEnabled || this.mode !== "2d" || this.w < 240) return null;
    const w = Math.max(150, Math.min(this.w * 0.28, 240));
    const h = w * 0.62;
    return { x: 16, y: this.h - h - 16, w, h };
  }

  private emitMiniLayout() {
    this.cb.onMiniLayout(this.miniRect());
  }

  private inMiniRect(px: number, py: number): boolean {
    const r = this.miniRect();
    if (!r) return false;
    return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
  }

  private onDown = (e: PointerEvent) => {
    this.renderer.domElement.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.pinch = { d0: Math.hypot(a.x - b.x, a.y - b.y), s0: this.ts };
      this.panning = null;
      this.suppressPaint = true;
      this.finalizeStroke(false);
      return;
    }

    if (this.mode === "3d") return;

    // mini pencere → döndür
    const rect0 = this.renderer.domElement.getBoundingClientRect();
    if (this.inMiniRect(e.clientX - rect0.left, e.clientY - rect0.top)) {
      this.miniRotating = true;
      this.miniLastX = e.clientX;
      this.miniLastY = e.clientY;
      this.renderer.domElement.style.cursor = "grabbing";
      return;
    }

    if (e.button === 1 || e.button === 2 || this.spaceHeld) {
      if (this.tool === "ruler" && e.button === 2 && !this.spaceHeld) {
        // çetvel: sağ tık → ölçümü temizle (silme değil)
        this.clearRuler();
        this.refreshCursor();
        return;
      }
      if (e.button === 2 && !this.spaceHeld && !this.hasSelection()) {
        const cell = this.cellFromEvent(e);
        if (cell) {
          const k = this.keyAt(cell[0], cell[1]);
          if (k !== null && this.data.has(k)) {
            this.stroke = new Map();
            this.strokeOp = "erase";
            this.lastCell = cell;
            this.applyCell(cell[0], cell[1]);
            this.refreshCursor();
            return;
          }
        }
      }
      this.panning = { x0: e.clientX, y0: e.clientY, cx0: this.tcx, cy0: this.tcy };
      this.ghost.visible = false;
      this.refreshCursor();
      return;
    }

    if (e.button !== 0) return;
    const cell = this.cellFromEvent(e);
    if (!cell) return;

    if (this.tool === "ruler") {
      this.rulerClick(cell);
      this.refreshCursor();
      return;
    }

    if (this.tool === "pick") {
      const pk = this.keyAt(cell[0], cell[1]);
      const c = pk !== null ? this.data.get(pk) : undefined;
      if (c !== undefined) {
        this.cb.onPickColor(c);
        this.cb.onToast(`Renk seçildi: ${PALETTE[c]?.name ?? "Özel"}`);
      } else {
        this.cb.onToast("Bu hücre boş — önce doldurulmalı");
      }
      return;
    }

    if (this.tool === "select") {
      if (this.hasSelection()) {
        this.selCursor = cell;
        this.placeSelection();
        this.updateSelPreview();
      } else {
        this.selDrag = { i0: cell[0], j0: cell[1], i1: cell[0], j1: cell[1] };
        this.updateSelRect();
      }
      return;
    }

    if (this.tool === "fill") {
      this.floodFill(cell[0], cell[1]);
      return;
    }

    if (this.tool === "stamp") {
      this.applyStampAt(cell[0], cell[1]);
      return;
    }

    if (this.tool === "rect" || this.tool === "circle") {
      this.shapeDrag = { i0: cell[0], j0: cell[1], i1: cell[0], j1: cell[1] };
      this.shapeSig = "";
      this.ghost.visible = false;
      this.rebuildPreview();
      return;
    }

    this.stroke = new Map();
    this.strokeOp = this.tool === "erase" ? "erase" : "paint";
    this.lastCell = cell;
    this.applyCell(cell[0], cell[1]);
  };

  private onMove = (e: PointerEvent) => {
    const p = this.pointers.get(e.pointerId);
    if (p) {
      p.x = e.clientX;
      p.y = e.clientY;
    }

    if (this.pinch && this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      this.ts = THREE.MathUtils.clamp(this.pinch.s0 * (d / this.pinch.d0), MIN_S, MAX_S);
      this.cb.onZoom(this.zoomPct());
      return;
    }

    if (this.miniRotating) {
      this.miniAz -= (e.clientX - this.miniLastX) * 0.011;
      this.miniPol = THREE.MathUtils.clamp(this.miniPol - (e.clientY - this.miniLastY) * 0.011, 0.05, Math.PI - 0.05);
      this.miniLastX = e.clientX;
      this.miniLastY = e.clientY;
      return;
    }

    if (this.panning) {
      this.tcx = this.panning.cx0 - (e.clientX - this.panning.x0) / this.s;
      this.tcy = this.panning.cy0 + (e.clientY - this.panning.y0) / this.s;
      return;
    }

    if (this.mode === "3d") return;

    if (this.selDrag) {
      const cell = this.cellFromEvent(e);
      if (cell && (cell[0] !== this.selDrag.i1 || cell[1] !== this.selDrag.j1)) {
        this.selDrag.i1 = cell[0];
        this.selDrag.j1 = cell[1];
        this.updateSelRect();
      }
      if (cell) this.cb.onCursor(cell, false);
      return;
    }

    if (this.tool === "select" && this.hasSelection()) {
      const cell = this.cellFromEvent(e);
      if (cell && (!this.selCursor || cell[0] !== this.selCursor[0] || cell[1] !== this.selCursor[1])) {
        this.selCursor = cell;
        this.updateSelPreview();
      }
      if (cell) this.cb.onCursor(cell, false);
      return;
    }

    if (this.shapeDrag) {
      const cell = this.cellFromEvent(e);
      if (cell) {
        const sig = `${cell[0]},${cell[1]}`;
        if (sig !== this.shapeSig) {
          this.shapeSig = sig;
          this.shapeDrag.i1 = cell[0];
          this.shapeDrag.j1 = cell[1];
          this.rebuildPreview();
        }
        this.cb.onCursor(cell, false);
      }
      return;
    }

    if (this.stroke && this.lastCell) {
      const cell = this.cellFromEvent(e);
      if (cell && (cell[0] !== this.lastCell[0] || cell[1] !== this.lastCell[1])) {
        for (const [i, j] of bresenham(this.lastCell[0], this.lastCell[1], cell[0], cell[1])) {
          this.applyCell(i, j);
        }
        this.lastCell = cell;
      }
      return;
    }

    if (e.pointerType === "mouse") {
      const rect0 = this.renderer.domElement.getBoundingClientRect();
      if (this.inMiniRect(e.clientX - rect0.left, e.clientY - rect0.top)) {
        this.hoverCell = null;
        this.ghost.visible = false;
        this.renderer.domElement.style.cursor = "grab";
        this.cb.onCursor(null, false);
        return;
      }
      const cell = this.cellFromEvent(e);
      this.hoverCell = cell;
      const showGhost =
        (this.tool === "paint" || this.tool === "erase" || this.tool === "fill" || this.tool === "stamp") && !this.spaceHeld;
      if (cell) {
        const hk = this.keyAt(cell[0], cell[1]);
        const filled = hk !== null && this.data.has(hk);
        this.ghost.visible = showGhost;
        this.ghost.position.set(cell[0] + 0.5, cell[1] + 0.5, 0);
        this.cb.onCursor(cell, filled);
      } else {
        this.ghost.visible = false;
        this.cb.onCursor(null, false);
      }
    }
  };

  private onUp = (e: PointerEvent) => {
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinch = null;
    if (this.pointers.size === 0) this.suppressPaint = false;
    if (this.miniRotating) {
      this.miniRotating = false;
      this.refreshCursor();
    }
    if (this.panning) {
      this.panning = null;
      this.refreshCursor();
    }
    if (this.selDrag) {
      const d = this.selDrag;
      this.selDrag = null;
      this.selRect.visible = false;
      this.finishSelDrag(d);
      return;
    }
    if (this.shapeDrag) {
      const cells = this.shapeCellList();
      this.shapeDrag = null;
      this.previewLines.visible = false;
      if (cells.length > 0) {
        const ops: { key: number; old: number | null; next: number | null }[] = [];
        const done = new Set<number>();
        for (const [cu, cv] of cells) {
          for (const [mu, mv] of this.mirrorCells(cu, cv)) {
            const k = this.keyAt(mu, mv);
            if (k === null || done.has(k)) continue;
            done.add(k);
            const old = this.data.has(k) ? (this.data.get(k) as number) : null;
            if (old === this.colorIndex) continue;
            ops.push({ key: k, old, next: this.colorIndex });
          }
        }
        if (ops.length > 0) {
          this.commitMulti(ops);
          this.lastPaintCell = [cells[0][0], cells[0][1]];
        }
      }
      return;
    }
    this.finalizeStroke(true);
  };

  private onLeave = () => {
    this.hoverCell = null;
    this.ghost.visible = false;
    this.cb.onCursor(null, false);
  };

  private onDbl = (e: MouseEvent) => {
    const rect0 = this.renderer.domElement.getBoundingClientRect();
    if (this.mode === "2d" && this.inMiniRect(e.clientX - rect0.left, e.clientY - rect0.top)) {
      this.cb.onMiniMaximize();
    }
  };

  private onWheel = (e: WheelEvent) => {
    if (this.mode === "3d") return;
    e.preventDefault();
    const rect = this.renderer.domElement.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    if (this.inMiniRect(px, py)) {
      const dy = e.deltaMode === 1 ? e.deltaY * 24 : e.deltaY;
      this.miniZoom = THREE.MathUtils.clamp(this.miniZoom * Math.exp(dy * 0.0011), 0.35, 5);
      return;
    }
    const dy = e.deltaMode === 1 ? e.deltaY * 24 : e.deltaY;
    const factor = Math.exp(-dy * 0.0012);
    const ns = THREE.MathUtils.clamp(this.ts * factor, MIN_S, MAX_S);
    const wx = this.cx + (px - this.w / 2) / this.s;
    const wy = this.cy - (py - this.h / 2) / this.s;
    this.tcx = wx - (px - this.w / 2) / ns;
    this.tcy = wy + (py - this.h / 2) / ns;
    this.ts = ns;
    this.cb.onZoom(this.zoomPct());
  };

  private onCtx = (e: Event) => e.preventDefault();

  private onKeyDown = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
    if (e.code === "Space") {
      this.spaceHeld = true;
      this.refreshCursor();
      e.preventDefault();
    }
    if (e.key === "Alt") this.altHeld = true;
    if (e.key === "Escape") {
      if (this.hasSelection()) this.cancelSelection();
      else this.clearRuler();
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    if (e.code === "Space") {
      this.spaceHeld = false;
      this.refreshCursor();
    }
    if (e.key === "Alt") this.altHeld = false;
  };

  private refreshCursor() {
    const el = this.renderer.domElement;
    if (this.mode === "3d") el.style.cursor = "grab";
    else if (this.panning) el.style.cursor = "grabbing";
    else if (this.spaceHeld) el.style.cursor = "grab";
    else if (this.tool === "pick") el.style.cursor = "copy";
    else if (this.tool === "select" && this.hasSelection()) el.style.cursor = "move";
    else el.style.cursor = "crosshair";
  }

  private finalizeStroke(commit: boolean) {
    if (!this.stroke) return;
    if (commit && this.stroke.size > 0) {
      this.undoStack.push(this.stroke);
      if (this.undoStack.length > 120) this.undoStack.shift();
      this.redoStack = [];
      this.emitStats();
      this.cb.onStroke();
    }
    this.stroke = null;
    this.lastCell = null;
  }

  private updateGhostColor() {
    const c =
      this.tool === "erase"
        ? new THREE.Color(0xff6b6b)
        : this.paletteColors[this.colorIndex] ?? new THREE.Color(0xffffff);
    this.ghostMat.color.copy(c);
    this.ghostEdgeMat.color.copy(c);
  }

  private colOf(c: number): THREE.Color {
    return this.paletteColors[c] ?? this.paletteColors[0];
  }

  private updateSelRect() {
    if (!this.selDrag) return;
    const d = this.selDrag;
    const u0 = Math.min(d.i0, d.i1), u1 = Math.max(d.i0, d.i1) + 1;
    const v0 = Math.min(d.j0, d.j1), v1 = Math.max(d.j0, d.j1) + 1;
    const z = 0.04;
    const P = this.selRectPos;
    let n = 0;
    const seg = (x1: number, y1: number, x2: number, y2: number) => {
      P[n * 3] = x1; P[n * 3 + 1] = y1; P[n * 3 + 2] = z; n++;
      P[n * 3] = x2; P[n * 3 + 1] = y2; P[n * 3 + 2] = z; n++;
    };
    seg(u0, v0, u1, v0);
    seg(u1, v0, u1, v1);
    seg(u1, v1, u0, v1);
    seg(u0, v1, u0, v0);
    (this.selRect.geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    this.selRect.geometry.setDrawRange(0, n);
    this.selRect.visible = true;
  }

  /* ---------------- boyama / senkron ---------------- */

  private ensureCapacity(n: number) {
    if (this.fillMesh && this.fillCap >= n) return;
    const cap = Math.max(n, this.fillCap * 2, 2048);
    const geo = this.mode === "3d" ? this.boxGeo3d : this.boxGeo2d;
    const mesh = new THREE.InstancedMesh(geo, this.fillMat, cap);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    if (this.fillMesh) {
      this.scene.remove(this.fillMesh);
      this.fillMesh.dispose();
    }
    this.fillMesh = mesh;
    this.fillCap = cap;
    this.scene.add(mesh);
  }

  private ensureGhostCapacity(g: number, n: number) {
    if (this.ghostMeshes[g] && this.ghostCaps[g] >= n) return;
    const cap = Math.max(n, (this.ghostCaps[g] ?? 0) * 2, 1024);
    let mat = this.ghostMats[g];
    if (!mat) {
      mat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.3, depthWrite: false });
      this.ghostMats[g] = mat;
    }
    const mesh = new THREE.InstancedMesh(this.boxGeo2d, mat, cap);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.renderOrder = -1;
    if (this.ghostMeshes[g]) {
      this.scene.remove(this.ghostMeshes[g]);
      this.ghostMeshes[g].dispose();
    }
    this.ghostMeshes[g] = mesh;
    this.ghostCaps[g] = cap;
    this.scene.add(mesh);
  }

  private syncInstances() {
    const is2d = this.mode === "2d";
    let wi0 = -Infinity, wi1 = Infinity, wj0 = -Infinity, wj1 = Infinity;
    let winKey = "all";
    if (is2d) {
      const halfW = this.w / 2 / this.s;
      const halfH = this.h / 2 / this.s;
      wi0 = Math.floor((this.cx - halfW) / 8) * 8 - CELL_RADIUS;
      wi1 = Math.ceil((this.cx + halfW) / 8) * 8 + CELL_RADIUS;
      wj0 = Math.floor((this.cy - halfH) / 8) * 8 - CELL_RADIUS;
      wj1 = Math.ceil((this.cy + halfH) / 8) * 8 + CELL_RADIUS;
      winKey = `${wi0},${wi1},${wj0},${wj1},${this.plane},S${this.slice},g${this.ghostDepth},o${this.ghostOpacity}`;
    } else {
      winKey = `all,SL${this.slicerActive ? this.slicerLayer : "off"}`;
    }
    if (this.builtVersion === this.dataVersion && winKey === this.builtWin && this.fillMesh) return;
    this.builtVersion = this.dataVersion;
    this.builtWin = winKey;

    const ghostCounts = new Array<number>(5).fill(0);
    let needed = 0;
    for (const key of this.data.keys()) {
      if (!is2d) {
        if (this.slicerActive && decodeKey(key)[2] > this.slicerLayer) continue;
        needed++;
        continue;
      }
      const [i, j, ck] = decodeKey(key);
      const [u, v, f] = this.toScreen(i, j, ck);
      if (f === this.slice) {
        if (u >= wi0 && u <= wi1 && v >= wj0 && v <= wj1) needed++;
      } else {
        const g = this.slice - 1 - f;
        if (g >= 0 && g < this.ghostDepth) ghostCounts[g]++;
      }
    }
    this.ensureCapacity(Math.max(needed, 1024));
    const mesh = this.fillMesh;
    if (!mesh) return;

    let n = 0;
    for (const [key, c] of this.data) {
      const [i, j, ck] = decodeKey(key);
      if (is2d) {
        const [u, v, f] = this.toScreen(i, j, ck);
        if (f !== this.slice) continue;
        if (u < wi0 || u > wi1 || v < wj0 || v > wj1) continue;
        this.tmpMat.makeTranslation(u + 0.5, v + 0.5, 0);
      } else {
        // dilimleyici: seçili katmanın üstünü gizle, seçiliyi parlak, altını hafif soluk yap
        if (this.slicerActive && ck > this.slicerLayer) continue;
        this.tmpMat.makeTranslation(i + 0.5, j + 0.5, ck + 0.5);
      }
      mesh.setMatrixAt(n, this.tmpMat);
      if (!is2d && this.slicerActive) {
        const base = this.colOf(c);
        if (ck === this.slicerLayer) {
          this.hlColor.copy(base).lerp(this.whiteCol, 0.5); // parlak vurgu
        } else {
          this.hlColor.copy(base).lerp(this.darkCol, 0.45); // soluk alt katmanlar
        }
        mesh.setColorAt(n, this.hlColor);
      } else {
        mesh.setColorAt(n, this.colOf(c));
      }
      n++;
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

    for (let g = 0; g < 5; g++) {
      const sliceF = this.slice - 1 - g;
      const want = is2d && g < this.ghostDepth ? ghostCounts[g] : 0;
      if (want > 0) this.ensureGhostCapacity(g, want);
      const gm = this.ghostMeshes[g];
      if (!gm) continue;
      this.ghostMats[g].opacity = this.ghostOpacity * Math.pow(0.62, g);
      let ng = 0;
      if (want > 0) {
        for (const [key, c] of this.data) {
          const [i, j, ck] = decodeKey(key);
          const [u, v, f] = this.toScreen(i, j, ck);
          if (f !== sliceF) continue;
          this.tmpMat.makeTranslation(u + 0.5, v + 0.5, -1);
          gm.setMatrixAt(ng, this.tmpMat);
          gm.setColorAt(ng, this.colOf(c));
          ng++;
        }
      }
      gm.count = ng;
      gm.instanceMatrix.needsUpdate = true;
      if (gm.instanceColor) gm.instanceColor.needsUpdate = true;
    }
  }

  /* ---------------- mini önizleme ---------------- */

  private ensureMiniCapacity(n: number) {
    if (this.miniMesh && this.miniCap >= n) return;
    const cap = Math.max(n, this.miniCap * 2, 2048);
    const mesh = new THREE.InstancedMesh(this.boxGeo3d, this.fillMat, cap);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.visible = false;
    if (this.miniMesh) {
      this.scene.remove(this.miniMesh);
      this.miniMesh.dispose();
    }
    this.miniMesh = mesh;
    this.miniCap = cap;
    this.scene.add(mesh);
  }

  private syncMini() {
    if (this.miniBuiltVersion === this.dataVersion && this.miniMesh) return;
    this.miniBuiltVersion = this.dataVersion;
    this.ensureMiniCapacity(Math.max(this.data.size, 512));
    const mm = this.miniMesh;
    if (!mm) return;
    let n = 0;
    for (const [key, c] of this.data) {
      const [i, j, ck] = decodeKey(key);
      this.tmpMat.makeTranslation(i + 0.5, j + 0.5, ck + 0.5);
      mm.setMatrixAt(n, this.tmpMat);
      mm.setColorAt(n, this.colOf(c));
      n++;
    }
    mm.count = n;
    mm.instanceMatrix.needsUpdate = true;
    if (mm.instanceColor) mm.instanceColor.needsUpdate = true;
  }

  private updateMiniCam(r: { w: number; h: number }) {
    this.miniCam.aspect = r.w / r.h;
    this.miniCam.updateProjectionMatrix();
    const bb = computeBBox(this.data);
    const tx = bb ? (bb.minI + bb.maxI + 1) / 2 : this.cx;
    const ty = bb ? (bb.minJ + bb.maxJ + 1) / 2 : this.cy;
    const tz = bb ? (bb.minK + bb.maxK + 1) / 2 : 0;
    const ext = bb ? Math.max(bb.maxI - bb.minI + 1, bb.maxJ - bb.minJ + 1, bb.maxK - bb.minK + 1) : 12;
    const targetR = Math.max(ext * 1.05, 6);
    const d = 0.12;
    this.miniTarget.x += (tx - this.miniTarget.x) * d;
    this.miniTarget.y += (ty - this.miniTarget.y) * d;
    this.miniTarget.z += (tz - this.miniTarget.z) * d;
    this.miniRadius += (targetR - this.miniRadius) * d;
    const dist = this.miniRadius * 2.35 * this.miniZoom;
    const sp = Math.sin(this.miniPol);
    this.miniCam.position.set(
      this.miniTarget.x + dist * sp * Math.cos(this.miniAz),
      this.miniTarget.y + dist * sp * Math.sin(this.miniAz),
      this.miniTarget.z + dist * Math.cos(this.miniPol),
    );
    this.miniCam.lookAt(this.miniTarget);
  }

  private renderMiniPass() {
    const r = this.miniRect();
    if (!r) return;
    this.syncMini();
    this.updateMiniCam(r);
    if (!this.miniMesh || this.miniMesh.count === 0) return;

    const saved = {
      grid: this.gridLines.visible,
      ghost: this.ghost.visible,
      fill: this.fillMesh?.visible ?? true,
      ghosts: this.ghostMeshes.map((g) => g.visible),
      preview: this.previewLines.visible,
      selRect: this.selRect.visible,
      selPrev: this.selPreview?.visible ?? false,
      axis: this.axisLines.visible,
      bed: this.bed.visible,
      rulerSeg: this.rulerSegs.visible,
      rulerSpr: this.rulerSprite?.visible ?? false,
    };
    this.gridLines.visible = false;
    this.ghost.visible = false;
    if (this.fillMesh) this.fillMesh.visible = false;
    for (const g of this.ghostMeshes) g.visible = false;
    this.previewLines.visible = false;
    this.selRect.visible = false;
    if (this.selPreview) this.selPreview.visible = false;
    this.axisLines.visible = false;
    this.rulerSegs.visible = false;
    if (this.rulerSprite) this.rulerSprite.visible = false;
    this.bed.visible = false;
    this.triad.visible = true;
    this.miniMesh.visible = true;

    const sy = this.h - r.y - r.h;
    this.renderer.setScissorTest(true);
    this.renderer.setViewport(r.x, sy, r.w, r.h);
    this.renderer.setScissor(r.x, sy, r.w, r.h);
    this.renderer.render(this.scene, this.miniCam);
    this.renderer.setScissorTest(false);
    this.renderer.setViewport(0, 0, this.w, this.h);

    this.gridLines.visible = saved.grid;
    this.ghost.visible = saved.ghost;
    if (this.fillMesh) this.fillMesh.visible = saved.fill;
    this.ghostMeshes.forEach((g, idx) => (g.visible = saved.ghosts[idx]));
    this.previewLines.visible = saved.preview;
    this.selRect.visible = saved.selRect;
    if (this.selPreview) this.selPreview.visible = saved.selPrev;
    this.axisLines.visible = saved.axis;
    this.bed.visible = saved.bed;
    this.rulerSegs.visible = saved.rulerSeg;
    if (this.rulerSprite) this.rulerSprite.visible = saved.rulerSpr;
    this.triad.visible = false;
    this.miniMesh.visible = false;
  }

  /* ---------------- ızgara / eksenler / tabla ---------------- */

  private rebuildGrid() {
    if (this.mode !== "2d") {
      this.gridLines.visible = false;
      return;
    }
    const halfW = this.w / 2 / this.s;
    const halfH = this.h / 2 / this.s;
    const i0 = Math.floor(this.cx - halfW) - 1;
    const i1 = Math.ceil(this.cx + halfW) + 1;
    const j0 = Math.floor(this.cy - halfH) - 1;
    const j1 = Math.ceil(this.cy + halfH) + 1;
    const sig = `${i0 >> 2},${i1 >> 2},${j0 >> 2},${j1 >> 2},${this.s.toFixed(2)}`;
    if (sig === this.gridSig) return;
    this.gridSig = sig;

    const ladder = [1, 2, 5, 10, 20, 50, 100, 200];
    let minor = ladder[ladder.length - 1];
    for (const l of ladder) if (l * this.s >= 16) { minor = l; break; }
    let major = ladder[ladder.length - 1];
    for (const l of ladder) if (l * this.s >= 140) { major = l; break; }

    const P = this.gridPos;
    let n = 0;
    const z = -0.02;
    const put = (x1: number, y1: number, x2: number, y2: number) => {
      if (n > 23998) return;
      P[n * 3] = x1; P[n * 3 + 1] = y1; P[n * 3 + 2] = z; n++;
      P[n * 3] = x2; P[n * 3 + 1] = y2; P[n * 3 + 2] = z; n++;
    };
    for (let i = Math.ceil(i0 / minor) * minor; i <= i1; i += minor) {
      if (i % major === 0) continue;
      put(i, j0, i, j1);
    }
    for (let j = Math.ceil(j0 / minor) * minor; j <= j1; j += minor) {
      if (j % major === 0) continue;
      put(i0, j, i1, j);
    }
    (this.gridLines.material as THREE.LineBasicMaterial).color.setHex(0x2a3a55);
    (this.gridLines.material as THREE.LineBasicMaterial).opacity = 0.42;
    (this.gridLines.geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    this.gridLines.geometry.setDrawRange(0, n);
    this.gridLines.visible = true;
  }

  private rebuildAxisLines() {
    const show = this.mode === "2d" && (this.symX || this.symY);
    if (!show) {
      this.axisLines.visible = false;
      return;
    }
    const halfW = this.w / 2 / this.s + 2;
    const halfH = this.h / 2 / this.s + 2;
    const sig = `${this.symX},${this.symY},${this.symCol},${this.symRow},${this.s.toFixed(2)}`;
    if (sig === this.axisSig) {
      this.axisLines.visible = true;
      return;
    }
    this.axisSig = sig;
    const P = this.axisLines.geometry.getAttribute("position") as THREE.BufferAttribute;
    const arr = P.array as Float32Array;
    let n = 0;
    const z = 0.02;
    const seg = (x1: number, y1: number, x2: number, y2: number) => {
      arr[n++] = x1; arr[n++] = y1; arr[n++] = z;
      arr[n++] = x2; arr[n++] = y2; arr[n++] = z;
    };
    if (this.symX) {
      const x = this.symCol + 0.5;
      seg(x, this.cy - halfH, x, this.cy + halfH);
    }
    if (this.symY) {
      const y = this.symRow + 0.5;
      seg(this.cx - halfW, y, this.cx + halfW, y);
    }
    P.needsUpdate = true;
    this.axisLines.geometry.setDrawRange(0, n / 3);
    this.axisLines.visible = true;
  }

  private rebuildBed() {
    if (this.mode !== "3d") {
      this.bed.visible = false;
      return;
    }
    const bb = computeBBox(this.data);
    const pad = 3;
    const x0 = (bb ? bb.minI : -5) - pad;
    const x1 = (bb ? bb.maxI + 1 : 5) + pad;
    const y0 = (bb ? bb.minJ : -5) - pad;
    const y1 = (bb ? bb.maxJ + 1 : 5) + pad;
    const topZ = bb ? bb.minK : 0;
    const w = x1 - x0;
    const d = y1 - y0;
    const sig = `${x0},${x1},${y0},${y1},${topZ},${this.bedVisible}`;
    if (sig === this.bedSig) {
      this.bed.visible = this.bedVisible;
      return;
    }
    this.bedSig = sig;
    this.bedSlab.geometry.dispose();
    this.bedSlab.geometry = new THREE.BoxGeometry(w, d, 0.12);
    this.bedSlab.position.set(x0 + w / 2, y0 + d / 2, topZ - 0.06);

    const lineZ = topZ + 0.004;
    let n = 0;
    const mp = this.bedMinorPos;
    for (let x = x0; x <= x1 && n + 6 < mp.length; x++) {
      mp[n++] = x; mp[n++] = y0; mp[n++] = lineZ;
      mp[n++] = x; mp[n++] = y1; mp[n++] = lineZ;
    }
    for (let y = y0; y <= y1 && n + 6 < mp.length; y++) {
      mp[n++] = x0; mp[n++] = y; mp[n++] = lineZ;
      mp[n++] = x1; mp[n++] = y; mp[n++] = lineZ;
    }
    (this.bedMinor.geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    this.bedMinor.geometry.setDrawRange(0, n / 3);

    let m = 0;
    const mp2 = this.bedMajorPos;
    for (let x = Math.ceil(x0 / 5) * 5; x <= x1 && m + 6 < mp2.length; x += 5) {
      mp2[m++] = x; mp2[m++] = y0; mp2[m++] = lineZ + 0.002;
      mp2[m++] = x; mp2[m++] = y1; mp2[m++] = lineZ + 0.002;
    }
    for (let y = Math.ceil(y0 / 5) * 5; y <= y1 && m + 6 < mp2.length; y += 5) {
      mp2[m++] = x0; mp2[m++] = y; mp2[m++] = lineZ + 0.002;
      mp2[m++] = x1; mp2[m++] = y; mp2[m++] = lineZ + 0.002;
    }
    (this.bedMajor.geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    this.bedMajor.geometry.setDrawRange(0, m / 3);

    const ox = bb ? bb.minI : x0 + 1;
    const oy = bb ? bb.minJ : y0 + 1;
    this.bedOrigin.position.set(ox, oy, topZ + 0.05);
    this.bed.visible = this.bedVisible;

    // üçlüyü model köşesine taşı
    const ext = bb ? Math.max(bb.maxI - bb.minI + 1, bb.maxJ - bb.minJ + 1, bb.maxK - bb.minK + 1) : 10;
    const sc = Math.max(ext * 0.22, 1.4);
    this.triad.scale.setScalar(sc);
    this.triad.position.set(x0, y0, topZ);
  }

  /* ---------------- istatistik / yakalama ---------------- */

  private emitStats() {
    const bb = computeBBox(this.data);
    const kp = this.kpSizeMm;
    const count = this.data.size;
    const volume = count * kp * kp * kp;
    const layerSet = new Set<number>();
    let sliceCount = 0;
    let baseContact = 0;
    for (const key of this.data.keys()) {
      const ck = decodeKey(key)[2];
      layerSet.add(ck);
      if (ck === this.slice) sliceCount++;
      if (bb && ck === bb.minK) baseContact++;
    }
    this.cb.onStats({
      count,
      layers: layerSet.size || 1,
      sliceCount,
      canUndo: this.undoStack.length > 0,
      canRedo: this.redoStack.length > 0,
      dimsMm: bb
        ? { w: (bb.maxI - bb.minI + 1) * kp, h: (bb.maxJ - bb.minJ + 1) * kp, d: (bb.maxK - bb.minK + 1) * kp }
        : null,
      volumeMm3: volume,
      weightG: (volume / 1000) * 1.24,
      floating: bb ? bb.minK > 0 : false,
      baseContact,
      minK: bb ? bb.minK : 0,
      maxK: bb ? bb.maxK : 0,
      plane: this.plane,
      slice: this.slice,
    });
  }

  capturePNG(scale = 2, transparent = false): string | null {
    const w = Math.max(2, Math.round(this.w * scale));
    const h = Math.max(2, Math.round(this.h * scale));
    const rt = new THREE.WebGLRenderTarget(w, h, { samples: 4 });
    let url: string | null = null;
    // şeffaf mod: yalnızca model kalsın — yardımcı sahne nesneleri gizlenir
    const aux: { obj: THREE.Object3D; was: boolean }[] = [];
    if (transparent) {
      const hide = (o: THREE.Object3D | null | undefined) => {
        if (!o) return;
        aux.push({ obj: o, was: o.visible });
        o.visible = false;
      };
      hide(this.gridLines);
      hide(this.ghost);
      hide(this.bed);
      hide(this.triad);
      hide(this.previewLines);
      hide(this.axisLines);
      hide(this.selRect);
      hide(this.selPreview);
      hide(this.overhangMesh);
      for (const g of this.ghostMeshes) hide(g);
    }
    try {
      this.renderer.setRenderTarget(rt);
      this.renderer.setClearColor(transparent ? 0x000000 : 0x0f1520, transparent ? 0 : 1);
      this.renderer.clear();
      if (this.mode === "2d") {
        const cam = this.ortho;
        const o = { l: cam.left, r: cam.right, t: cam.top, b: cam.bottom };
        cam.left = -w / 2; cam.right = w / 2; cam.top = h / 2; cam.bottom = -h / 2;
        cam.updateProjectionMatrix();
        this.renderer.render(this.scene, cam);
        cam.left = o.l; cam.right = o.r; cam.top = o.t; cam.bottom = o.b;
        cam.updateProjectionMatrix();
      } else {
        const cam = this.persp;
        const oa = cam.aspect;
        cam.aspect = w / h;
        cam.updateProjectionMatrix();
        this.renderer.render(this.scene, cam);
        cam.aspect = oa;
        cam.updateProjectionMatrix();
      }
      const buf = new Uint8Array(w * h * 4);
      this.renderer.readRenderTargetPixels(rt, 0, 0, w, h, buf);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        const img = ctx.createImageData(w, h);
        const row = w * 4;
        for (let y = 0; y < h; y++) img.data.set(buf.subarray((h - 1 - y) * row, (h - y) * row), y * row);
        if (!transparent) {
          ctx.fillStyle = "#0f1520";
          ctx.fillRect(0, 0, w, h);
        }
        const tmp = document.createElement("canvas");
        tmp.width = w;
        tmp.height = h;
        tmp.getContext("2d")?.putImageData(img, 0, 0);
        ctx.drawImage(tmp, 0, 0);
        url = canvas.toDataURL("image/png");
      }
    } finally {
      this.renderer.setRenderTarget(null);
      rt.dispose();
      for (const a of aux) a.obj.visible = a.was;
    }
    return url;
  }

  /* ---------------- döngü ---------------- */

  private tick() {
    const k = 0.18;
    this.cx += (this.tcx - this.cx) * k;
    this.cy += (this.tcy - this.cy) * k;
    this.s += (this.ts - this.s) * k;

    if (this.mode === "2d") {
      this.ortho.left = -this.w / 2;
      this.ortho.right = this.w / 2;
      this.ortho.top = this.h / 2;
      this.ortho.bottom = -this.h / 2;
      this.ortho.zoom = this.s;
      this.ortho.position.set(this.cx, this.cy, 20);
      this.ortho.updateProjectionMatrix();
      // çetvel etiketi: sabit piksel boyutu + orta noktanın üstünde kalsın
      if (this.rulerSprite && this.rulerSprite.visible && this.rulerMid) {
        const k = 1 / this.s;
        this.rulerSprite.scale.set(this.rulerPx[0] * k, this.rulerPx[1] * k, 1);
        this.rulerSprite.position.set(this.rulerMid[0], this.rulerMid[1] + 22 * k, 0.2);
      }
      this.rebuildGrid();
      this.rebuildAxisLines();
      this.syncInstances();
      this.renderer.render(this.scene, this.ortho);
      this.renderMiniPass();
      this.bed.visible = false;
      this.triad.visible = false;
    } else {
      this.syncInstances();
      this.rebuildBed();
      this.triad.visible = true;
      this.controls.update();
      this.renderer.render(this.scene, this.persp);
    }
  }

  private resize() {
    const r = this.mount.getBoundingClientRect();
    this.w = Math.max(2, Math.floor(r.width));
    this.h = Math.max(2, Math.floor(r.height));
    this.renderer.setSize(this.w, this.h, false);
    this.persp.aspect = this.w / this.h;
    this.persp.updateProjectionMatrix();
    this.gridSig = "";
    this.insetSigReset();
    this.emitMiniLayout();
  }

  private insetSigReset() {
    this.axisSig = "";
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    const canvas = this.renderer.domElement;
    canvas.removeEventListener("pointerdown", this.onDown);
    canvas.removeEventListener("pointermove", this.onMove);
    canvas.removeEventListener("pointerup", this.onUp);
    canvas.removeEventListener("pointercancel", this.onUp);
    canvas.removeEventListener("pointerleave", this.onLeave);
    canvas.removeEventListener("wheel", this.onWheel);
    canvas.removeEventListener("contextmenu", this.onCtx);
    canvas.removeEventListener("dblclick", this.onDbl);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    this.controls.dispose();
    this.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else if (mat) mat.dispose();
    });
    if (this.rulerTex) this.rulerTex.dispose();
    this.renderer.dispose();
    canvas.remove();
  }
}

export default EditorScene;
