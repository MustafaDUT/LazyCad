import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { EditorScene, type EngineStats, type Tool, type ViewMode, type DrawPlane } from "./three/EditorScene";
import {
  STAMPS, buildStl, serializeModel, parseModel, decodeKey, keyOf,
  downloadBlob, analyzePrint, estimatePrint, computeBBox, computeSupports, buildStlWithSupports,
  PALETTE,
  type KpModel, type PrintAnalysis, type PrintEstimate, type SupportMode,
} from "./lib/model";
import { buildSmoothMesh } from "./lib/smooth";
import {
  smoothToGeometry, buildVoxelGeometry, geometryToObj, exportGeometryAsGlb, type ColorOf,
} from "./lib/exporters";
import { TEMPLATES, buildTemplateCells, type Template } from "./lib/templates";
import {
  listProjects, saveProjectMeta, deleteProject,
  duplicateProject, loadProjectData, saveProjectData, migrateLegacy, uid,
  type ProjectMeta,
} from "./lib/store";
import HomeScreen from "./components/HomeScreen";
import SetupScreen from "./components/SetupScreen";
import { Toolbar, SidePanel, Hud, Toasts, ShortcutsModal, type HudBus, type ToastItem } from "./components/EditorUI";
import { IconChevronLeft, IconChevronRight, IconChevronUp, IconChevronDown, IconExpand, IconX, IconTarget, IconFit, IconLayers } from "./components/icons";

const PREFS_KEY = "kp-atolye:prefs";
const COLORS_KEY = "kp-atolye:colors";

const EMPTY_STATS: EngineStats = {
  count: 0, layers: 1, sliceCount: 0, canUndo: false, canRedo: false, dimsMm: null,
  volumeMm3: 0, weightG: 0, floating: false, baseContact: 0, minK: 0, maxK: 0, plane: "xy", slice: 0,
};

interface Prefs {
  ghostDepth: number;
  ghostOpacity: number;
  miniOn: boolean;
  panelOpen: boolean;
  bedOn: boolean;
}

const DEFAULT_PREFS: Prefs = {
  ghostDepth: 2,
  ghostOpacity: 0.34,
  miniOn: true,
  panelOpen: typeof window !== "undefined" ? window.innerWidth >= 768 : true,
  bedOn: true,
};

const PLANE_INFO: Record<DrawPlane, { h: string; v: string; depth: string; vLabel: string }> = {
  xy: { h: "X", v: "Y", depth: "K", vLabel: "Y" },
  xz: { h: "X", v: "Z", depth: "Y", vLabel: "Z · katman" },
  yz: { h: "Y", v: "Z", depth: "X", vLabel: "Z · katman" },
};

type View = "home" | "setup" | "editor";

/** Tek kullanıcı görünümü — arayüz "giriş yapmış" hissi veren sabit rozet adı. */
const USER_LABEL = "Tasarımcı";

export default function App() {
  /* ---------------- görünüm + projeler ---------------- */

  const [view, setView] = useState<View>("home");
  const [projects, setProjects] = useState<ProjectMeta[]>(() => listProjects());
  const [activeProject, setActiveProject] = useState<ProjectMeta | null>(null);

  /* ---------------- editör durumu ---------------- */

  const [mode, setMode] = useState<ViewMode>("2d");
  const [tool, setTool] = useState<Tool>("paint");
  const [colorIdx, setColorIdx] = useState(0);
  const [autoRotate, setAutoRotate] = useState(false);
  const [stats, setStats] = useState<EngineStats>(EMPTY_STATS);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [plane, setPlane] = useState<DrawPlane>("xy");
  const [miniRect, setMiniRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);

  const prefsInit = useRef<Prefs>({ ...DEFAULT_PREFS, ...(JSON.parse(localStorage.getItem(PREFS_KEY) ?? "null") ?? {}) });
  const [panelOpen, setPanelOpen] = useState(prefsInit.current.panelOpen);
  const [ghostDepth, setGhostDepth] = useState(prefsInit.current.ghostDepth);
  const [ghostOpacity, setGhostOpacity] = useState(prefsInit.current.ghostOpacity);
  const [miniOn, setMiniOn] = useState(prefsInit.current.miniOn);
  const [bedOn, setBedOn] = useState(prefsInit.current.bedOn);
  const [customColors, setCustomColors] = useState<string[]>(() => JSON.parse(localStorage.getItem(COLORS_KEY) ?? "[]"));

  const [symX, setSymX] = useState(false);
  const [symY, setSymY] = useState(false);
  const [symCol, setSymCol] = useState(0);
  const [symRow, setSymRow] = useState(0);
  const [stampId, setStampId] = useState(STAMPS[0].id);
  const [clip, setClip] = useState<[number, number, number][] | null>(null);
  const [showSupports, setShowSupports] = useState(false);
  const [analysis, setAnalysis] = useState<PrintAnalysis | null>(null);
  const [estimate, setEstimate] = useState<PrintEstimate | null>(null);
  const [slicerOn, setSlicerOn] = useState(false);
  const [slicerK, setSlicerK] = useState(0);
  const [smoothOn, setSmoothOn] = useState(false);
  const [smoothIters, setSmoothIters] = useState(4);
  const [smoothInfo, setSmoothInfo] = useState<{ tris: number; verts: number } | null>(null);
  const [supportsActive, setSupportsActive] = useState(false);
  const [supportCells, setSupportCells] = useState<[number, number, number][]>([]);
  const [supportMode, setSupportMode] = useState<SupportMode>("full");

  const mountRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<EditorScene | null>(null);
  const hudRef = useRef<HudBus>({ cursorEl: null, zoomEl: null, fillEl: null });
  const planeRef = useRef<DrawPlane>("xy");
  const autoRotateRef = useRef(false);
  const customColorsRef = useRef(customColors);
  const activeProjectRef = useRef<ProjectMeta | null>(null);
  const saveTimer = useRef(0);
  const toastId = useRef(0);

  useEffect(() => {
    activeProjectRef.current = activeProject;
  }, [activeProject]);

  const toast = useCallback((msg: string, tone: ToastItem["tone"] = "amber") => {
    const id = ++toastId.current;
    setToasts((t) => [...t.slice(-2), { id, msg, tone }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);

  /* ---------------- kalıcılık ---------------- */

  // Açılış: eski tek-projeli çizimi projelere taşı (varsa) + listeyi depodan tazele.
  // Çizimler localStorage'da kalıcı — sayfa yenilense de projeler geri gelir (Adım 7).
  useEffect(() => {
    const migrated = migrateLegacy();
    setProjects(listProjects());
    if (migrated) toast(`Eski çizimin "${migrated}" adıyla projelerine taşındı`, "mint");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const flushSave = useCallback(() => {
    const eng = engineRef.current;
    const proj = activeProjectRef.current;
    if (!eng || !proj) return;
    const data = eng.getData();
    saveProjectData(proj.id, serializeModel(proj.name, eng.getKpSizeMm(), data));
    const layerSet = new Set<number>();
    for (const key of data.keys()) layerSet.add(decodeKey(key)[2]);
    const meta: ProjectMeta = {
      ...proj,
      count: data.size,
      layers: Math.max(1, layerSet.size),
      updatedAt: new Date().toISOString(),
    };
    saveProjectMeta(meta);
    activeProjectRef.current = meta;
    setProjects((ps) => ps.map((p) => (p.id === meta.id ? meta : p)));
  }, []);

  const scheduleSave = useCallback(() => {
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(flushSave, 600);
  }, [flushSave]);

  /* ---------------- motor ---------------- */

  useEffect(() => {
    if (view !== "editor" || !activeProject || !mountRef.current) return;
    const eng = new EditorScene(mountRef.current, activeProject.kpSizeMm, {
      onStats: (s) => {
        setStats(s);
        setAnalysis(s.count > 0 ? analyzePrint(eng.getData()) : null);
        setEstimate(s.count > 0 ? estimatePrint(s.volumeMm3) : null);
      },
      onCursor: (cell, filled) => {
        const el = hudRef.current.cursorEl;
        if (el) {
          if (!cell) el.textContent = "— · —";
          else {
            const pl = planeRef.current;
            const ax = pl === "yz" ? "Y" : "X";
            const ay = pl === "xy" ? "Y" : "Z";
            el.textContent = `${ax} ${cell[0]} · ${ay} ${cell[1]}`;
          }
        }
        const f = hudRef.current.fillEl;
        if (f) {
          if (!cell) { f.textContent = "·"; f.style.color = ""; }
          else if (filled) { f.textContent = "■ dolu"; f.style.color = "#3fd6b6"; }
          else { f.textContent = "□ boş"; f.style.color = "#5c6f8a"; }
        }
      },
      onZoom: (pct) => {
        const el = hudRef.current.zoomEl;
        if (el) el.textContent = `%${pct}`;
      },
      onStroke: () => scheduleSave(),
      onPickColor: (i) => setColorIdx(i),
      onToast: (m) => toast(m),
      onMiniLayout: (r) => setMiniRect(r),
      onMiniMaximize: () => {
        setMode("3d");
        eng.setMode("3d");
        eng.setAutoRotate(autoRotateRef.current);
      },
    });
    engineRef.current = eng;
    eng.setGhostDepth(prefsInit.current.ghostDepth);
    eng.setGhostOpacity(prefsInit.current.ghostOpacity);
    eng.setMiniEnabled(prefsInit.current.miniOn);
    eng.setBedVisible(prefsInit.current.bedOn);
    eng.setCustomPalette(customColorsRef.current);
    eng.setStamp(STAMPS[0].id);

    // proje verisini yükle
    const raw = loadProjectData(activeProject.id);
    if (raw) {
      try {
        const m = JSON.parse(raw) as KpModel;
        if (m.cells && m.cells.length > 0) eng.replaceData(m.cells, m.kpSizeMm);
      } catch {
        /* bozuk kayıt — boş başla */
      }
    }

    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      const k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && k === "z") {
        e.preventDefault();
        if (e.shiftKey) eng.redo(); else eng.undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && k === "y") { e.preventDefault(); eng.redo(); return; }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "?") setShowShortcuts((v) => !v);
      else if (k === "b") setToolBoth("paint");
      else if (k === "e") setToolBoth("erase");
      else if (k === "p") setToolBoth("pick");
      else if (k === "f") setToolBoth("fill");
      else if (k === "r") setToolBoth("rect");
      else if (k === "c") setToolBoth("circle");
      else if (k === "s") setToolBoth("stamp");
      else if (k === "a") setToolBoth("select");
      else if (k === "m" && eng.getMode() === "3d") setSmoothOn((v) => !v);
      else if (k === "v") setMiniOn((v) => !v);
      else if (k === "x") toggleSymX();
      else if (k === "y") toggleSymY();
      else if (k === "w" || e.code === "PageUp") gotoSlice(eng.getSlice() + 1);
      else if (k === "q" || e.code === "PageDown") gotoSlice(eng.getSlice() - 1);
      else if (/^[0-9]$/.test(k)) changeColor((Number(k) + 9) % 10);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.clearTimeout(saveTimer.current);
      flushSave();
      eng.dispose();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, activeProject?.id]);

  /* ---------------- yardımcılar ---------------- */

  const setToolBoth = (t: Tool) => {
    setTool(t);
    engineRef.current?.setTool(t);
  };

  const gotoSlice = (v: number) => {
    const eng = engineRef.current;
    if (!eng) return;
    eng.setSlice(v);
    setStats((s) => ({ ...s, slice: eng.getSlice() }));
  };

  const changePlane = (pl: DrawPlane) => {
    setPlane(pl);
    planeRef.current = pl;
    const eng = engineRef.current;
    if (eng) eng.setPlane(pl);
  };

  const changeColor = (i: number) => {
    setColorIdx(i);
    engineRef.current?.setColorIndex(i);
  };

  const changeMode = (m: ViewMode) => {
    setMode(m);
    engineRef.current?.setMode(m);
    setSmoothInfo(engineRef.current?.getSmoothStats() ?? null);
    if (m === "3d") {
      engineRef.current?.setAutoRotate(autoRotateRef.current);
      engineRef.current?.setSlicerLayer(slicerOn ? slicerK : null);
    } else {
      // 2D'ye dönünce dilimleyiciyi kapat
      setSlicerOn(false);
      engineRef.current?.setSlicerLayer(null);
    }
  };

  const toggleSlicer = () => {
    const next = !slicerOn;
    setSlicerOn(next);
    if (next) {
      setSlicerK(stats.maxK);
      engineRef.current?.setSlicerLayer(stats.maxK);
    } else {
      engineRef.current?.setSlicerLayer(null);
    }
  };

  const setSlicer = (k: number) => {
    setSlicerK(k);
    engineRef.current?.setSlicerLayer(k);
  };

  // model değişince dilimleyici sınırını güncel tut
  useEffect(() => {
    if (slicerOn && slicerK > stats.maxK) {
      setSlicerK(stats.maxK);
      engineRef.current?.setSlicerLayer(stats.maxK);
    }
  }, [stats.maxK, slicerOn, slicerK]);

  const symXRef = useRef(symX);
  const symYRef = useRef(symY);
  const symColRef = useRef(symCol);
  const symRowRef = useRef(symRow);
  useEffect(() => { symXRef.current = symX; symYRef.current = symY; symColRef.current = symCol; symRowRef.current = symRow; }, [symX, symY, symCol, symRow]);

  const toggleSymX = () => {
    setSymX((v) => {
      const nv = !v;
      const eng = engineRef.current;
      const c = eng?.getModelCenter();
      if (eng) eng.setSymmetry(nv, symYRef.current, c ? c[0] : symColRef.current, symRowRef.current);
      return nv;
    });
  };

  const toggleSymY = () => {
    setSymY((v) => {
      const nv = !v;
      const eng = engineRef.current;
      const c = eng?.getModelCenter();
      if (eng) eng.setSymmetry(symXRef.current, nv, symColRef.current, c ? c[1] : symRowRef.current);
      return nv;
    });
  };

  useEffect(() => {
    engineRef.current?.setSymmetry(symX, symY, symCol, symRow);
  }, [symX, symY, symCol, symRow]);

  useEffect(() => {
    engineRef.current?.setStamp(stampId);
  }, [stampId]);

  // görünüm tercihleri → motor + kalıcılık
  useEffect(() => {
    const eng = engineRef.current;
    if (eng) {
      eng.setGhostDepth(ghostDepth);
      eng.setGhostOpacity(ghostOpacity);
      eng.setMiniEnabled(miniOn);
      eng.setBedVisible(bedOn);
    }
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({ ghostDepth, ghostOpacity, miniOn, panelOpen, bedOn } satisfies Prefs));
    } catch { /* yoksay */ }
  }, [ghostDepth, ghostOpacity, miniOn, panelOpen, bedOn]);

  // özel renkler → motor + kalıcılık
  useEffect(() => {
    customColorsRef.current = customColors;
    engineRef.current?.setCustomPalette(customColors);
    try { localStorage.setItem(COLORS_KEY, JSON.stringify(customColors)); } catch { /* yoksay */ }
  }, [customColors]);

  // destek işaretleri
  useEffect(() => {
    const eng = engineRef.current;
    if (!eng) return;
    eng.setOverhangCells(showSupports && analysis ? analysis.overhangs : []);
  }, [showSupports, analysis, mode, stats.count]);

  // pürüzsüz yüzey → motor
  useEffect(() => {
    const eng = engineRef.current;
    if (!eng) return;
    eng.setSmoothIterations(smoothIters);
    eng.setSmoothMode(smoothOn);
    setSmoothInfo(eng.getSmoothStats());
  }, [smoothOn, smoothIters]);

  // otomatik destekler: model değişince sessizce yeniden hesapla
  useEffect(() => {
    const eng = engineRef.current;
    if (!eng) return;
    if (!supportsActive || mode !== "3d") {
      eng.setSupportCells(null);
      return;
    }
    const cells = computeSupports(eng.getData(), supportMode);
    setSupportCells(cells);
    eng.setSupportCells(cells);
  }, [supportsActive, supportMode, analysis, mode, stats.count]);

  /* ---------------- proje eylemleri ---------------- */

  const resetEditorState = () => {
    setMode("2d");
    setTool("paint");
    setColorIdx(0);
    setStats(EMPTY_STATS);
    setPlane("xy");
    planeRef.current = "xy";
    setMiniRect(null);
    setAnalysis(null);
    setEstimate(null);
    setSymX(false);
    setSymY(false);
    setClip(null);
    setShowSupports(false);
    setSupportsActive(false);
    setSupportCells([]);
    setSmoothOn(false);
    setSmoothInfo(null);
  };

  const createProject = (name: string, kpSizeMm: number) => {
    const meta: ProjectMeta = {
      id: uid(),
      name,
      kpSizeMm,
      count: 0,
      layers: 1,
      updatedAt: new Date().toISOString(),
    };
    saveProjectMeta(meta);
    saveProjectData(meta.id, serializeModel(name, kpSizeMm, new Map()));
    setProjects((ps) => [meta, ...ps]);
    resetEditorState();
    setActiveProject(meta);
    activeProjectRef.current = meta;
    setView("editor");
  };

  const startFromTemplate = (t: Template) => {
    const data = new Map<number, number>();
    for (const [i, j, k, c] of buildTemplateCells(t)) data.set(keyOf(i, j, k), c);
    const meta: ProjectMeta = {
      id: uid(),
      name: t.name,
      kpSizeMm: t.kp,
      count: data.size,
      layers: t.layers.length,
      updatedAt: new Date().toISOString(),
    };
    saveProjectMeta(meta);
    saveProjectData(meta.id, serializeModel(t.name, t.kp, data));
    setProjects((ps) => [meta, ...ps]);
    resetEditorState();
    setActiveProject(meta);
    activeProjectRef.current = meta;
    setView("editor");
    toast(`"${t.name}" şablonu kuruldu — ${data.size.toLocaleString("tr-TR")} KP`, "mint");
  };

  const openProject = (id: string) => {
    const meta = projects.find((p) => p.id === id);
    if (!meta) return;
    resetEditorState();
    setActiveProject(meta);
    activeProjectRef.current = meta;
    setView("editor");
  };

  const dupProject = (id: string) => {
    const copy = duplicateProject(id);
    if (!copy) return;
    setProjects(listProjects());
    toast(`"${copy.name}" oluşturuldu`, "mint");
  };

  const delProject = (id: string) => {
    const meta = projects.find((p) => p.id === id);
    deleteProject(id);
    setProjects(listProjects());
    toast(meta ? `"${meta.name}" silindi` : "Proje silindi", "coral");
  };

  const goHome = () => {
    flushSave();
    window.clearTimeout(saveTimer.current);
    setProjects(listProjects());
    setActiveProject(null);
    activeProjectRef.current = null;
    setStats(EMPTY_STATS);
    setMiniRect(null);
    setAnalysis(null);
    setEstimate(null);
    setView("home");
  };

  /* ---------------- editör eylemleri ---------------- */

  const exportStl = () => {
    const eng = engineRef.current;
    const proj = activeProjectRef.current;
    if (!eng || !proj) return;
    const data = eng.getData();
    if (data.size === 0) { toast("Önce en az bir KP boya", "coral"); return; }
    const blob = buildStl(data, eng.getKpSizeMm(), proj.name);
    downloadBlob(blob, `${proj.name.replace(/\s+/g, "_")}.stl`);
    toast(`STL indirildi · ${(blob.size / 1024).toFixed(0)} KB`, "mint");
  };

  const generateSupports = () => {
    const eng = engineRef.current;
    if (!eng) return;
    const cells = computeSupports(eng.getData(), supportMode);
    setSupportsActive(true);
    setSupportCells(cells);
    eng.setSupportCells(cells);
    if (cells.length === 0) {
      toast("Destek gerekmiyor — model kendi kendini taşıyor", "amber");
    } else {
      toast(`${cells.length.toLocaleString("tr-TR")} destek hücresi üretildi`, "mint");
    }
  };

  const clearSupports = () => {
    setSupportsActive(false);
    setSupportCells([]);
    engineRef.current?.setSupportCells(null);
    toast("Destekler kaldırıldı");
  };

  /* ---------------- CAD / oyun dışa aktarımı ---------------- */

  const colorOf: ColorOf = (idx: number) => {
    const hex = idx < PALETTE.length ? PALETTE[idx].hex : customColors[idx - PALETTE.length];
    const c = new THREE.Color(hex ?? "#d9ccc0");
    return [c.r, c.g, c.b];
  };

  const exportObj = () => {
    const eng = engineRef.current;
    const proj = activeProjectRef.current;
    if (!eng || !proj) return;
    const sm = buildSmoothMesh(eng.getData(), colorOf, smoothIters);
    if (!sm) { toast("Önce en az bir KP boya", "coral"); return; }
    const obj = geometryToObj(smoothToGeometry(sm), proj.name);
    downloadBlob(new Blob([obj], { type: "model/obj" }), `${proj.name.replace(/\s+/g, "_")}.obj`);
    toast(`OBJ indirildi · ${(sm.triangleCount).toLocaleString("tr-TR")} üçgen (Blender)`, "mint");
  };

  const exportGlb = async (voxel: boolean) => {
    const eng = engineRef.current;
    const proj = activeProjectRef.current;
    if (!eng || !proj) return;
    const data = eng.getData();
    if (data.size === 0) { toast("Önce en az bir KP boya", "coral"); return; }
    const geo = voxel ? buildVoxelGeometry(data, colorOf) : (() => {
      const sm = buildSmoothMesh(data, colorOf, smoothIters);
      return sm ? smoothToGeometry(sm) : null;
    })();
    if (!geo) { toast("Mesh üretilemedi", "coral"); return; }
    try {
      await exportGeometryAsGlb(geo, `${proj.name.replace(/\s+/g, "_")}_${voxel ? "voxel" : "smooth"}.glb`);
      toast(`GLB indirildi · ${voxel ? "voxel (retro)" : "pürüzsüz"} — oyun motoruna hazır`, "mint");
    } catch {
      toast("GLB dışa aktarılamadı", "coral");
    }
  };

  const exportStlWithSupports = () => {
    const eng = engineRef.current;
    const proj = activeProjectRef.current;
    if (!eng || !proj) return;
    const data = eng.getData();
    if (data.size === 0) { toast("Önce en az bir KP boya", "coral"); return; }
    const cells = supportCells.length > 0 ? supportCells : computeSupports(data, supportMode);
    if (cells.length === 0) {
      toast("Üretilmiş destek yok — önce destek üret", "coral");
      return;
    }
    const blob = buildStlWithSupports(data, cells, eng.getKpSizeMm(), proj.name);
    downloadBlob(blob, `${proj.name.replace(/\s+/g, "_")}_destekli.stl`);
    toast(`STL + destekler indirildi · ${(blob.size / 1024).toFixed(0)} KB`, "mint");
  };

  const exportJson = () => {
    const eng = engineRef.current;
    const proj = activeProjectRef.current;
    if (!eng || !proj) return;
    const text = serializeModel(proj.name, eng.getKpSizeMm(), eng.getData());
    downloadBlob(new Blob([text], { type: "application/json" }), `${proj.name.replace(/\s+/g, "_")}.kp.json`);
    toast("JSON model indirildi", "mint");
  };

  const exportPng = (transparent = false) => {
    const eng = engineRef.current;
    if (!eng) return;
    const url = eng.capturePNG(2, transparent);
    if (!url) { toast("Ekran görüntüsü alınamadı", "coral"); return; }
    const a = document.createElement("a");
    a.href = url;
    const base = (activeProjectRef.current?.name ?? "kp-model").replace(/\s+/g, "_");
    a.download = transparent
      ? `${base}_${mode === "3d" ? "3d" : "2d"}_seffaf.png`
      : `${base}_${mode === "3d" ? "3d" : "2d"}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    toast(transparent ? "PNG indirildi — şeffaf zemin, alfa kanallı" : "PNG indirildi (2× çözünürlük)", "mint");
  };

  const importFile = (f: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const m = parseModel(String(reader.result));
        const eng = engineRef.current;
        const proj = activeProjectRef.current;
        if (!eng || !proj) return;
        const n = eng.replaceData(m.cells, m.kpSizeMm);
        const meta: ProjectMeta = { ...proj, name: m.name, kpSizeMm: m.kpSizeMm, updatedAt: new Date().toISOString() };
        saveProjectMeta(meta);
        activeProjectRef.current = meta;
        setActiveProject(meta);
        setProjects((ps) => ps.map((p) => (p.id === meta.id ? meta : p)));
        scheduleSave();
        toast(`${n.toLocaleString("tr-TR")} KP içe aktarıldı`, "mint");
      } catch {
        toast("Dosya okunamadı — geçerli bir .kp.json değil", "coral");
      }
    };
    reader.readAsText(f);
  };

  const clearAll = () => {
    const eng = engineRef.current;
    if (!eng) return;
    const n = eng.clearAll();
    toast(n > 0 ? `${n.toLocaleString("tr-TR")} KP temizlendi — Ctrl+Z ile geri al` : "Tuval zaten boş");
  };

  const copyLayer = () => {
    const eng = engineRef.current;
    if (!eng) return;
    const cells = eng.copyLayerCells(eng.getSlice());
    setClip(cells);
    toast(cells.length > 0 ? `${cells.length} KP panoya kopyalandı` : "Bu dilim boş", cells.length > 0 ? "mint" : "amber");
  };

  const pasteLayer = (dir: 1 | -1) => {
    const eng = engineRef.current;
    if (!eng || !clip) return;
    const target = eng.getSlice() + dir;
    const n = eng.pasteLayerTo(clip, target);
    if (n > 0) {
      eng.setSlice(target);
      setStats((s) => ({ ...s, slice: target }));
      toast(`${n} KP yapıştırıldı`, "mint");
    }
  };

  const addCustomColor = (hex: string) => {
    setCustomColors((prev) => {
      const hx = hex.toLowerCase();
      if (prev.length >= 14) { toast("En fazla 14 özel renk eklenebilir", "coral"); return prev; }
      if (prev.includes(hx)) { toast("Bu renk zaten paletinde var"); return prev; }
      toast("Özel renk eklendi", "mint");
      return [...prev, hx];
    });
  };

  /* ---------------- görünümler ---------------- */

  if (view === "setup") {
    return (
      <div className="h-full bg-ink-950">
        <SetupScreen user={USER_LABEL} onStart={createProject} onBack={() => setView("home")} />
        <Toasts items={toasts} />
      </div>
    );
  }

  if (view !== "editor" || !activeProject) {
    return (
      <div className="h-full bg-ink-950">
        <HomeScreen
          userName={USER_LABEL}
          projects={projects}
          templates={TEMPLATES}
          onTemplate={startFromTemplate}
          onOpen={openProject}
          onNew={() => setView("setup")}
          onDuplicate={dupProject}
          onDelete={delProject}
        />
        <Toasts items={toasts} />
      </div>
    );
  }

  /* ---------------- editör ---------------- */

  return (
    <div className="flex h-full flex-col overflow-hidden bg-ink-950">
      <Toolbar
        name={activeProject.name}
        kpSizeMm={activeProject.kpSizeMm}
        mode={mode}
        onMode={changeMode}
        canUndo={stats.canUndo}
        canRedo={stats.canRedo}
        onUndo={() => engineRef.current?.undo()}
        onRedo={() => engineRef.current?.redo()}
        onClear={clearAll}
        onExportStl={exportStl}
        onExportStlWithSupports={exportStlWithSupports}
        supportCount={supportsActive ? supportCells.length : 0}
        onExportObj={exportObj}
        onExportGlbSmooth={() => exportGlb(false)}
        onExportGlbVoxel={() => exportGlb(true)}
        onExportJson={exportJson}
        onExportPng={() => exportPng(false)}
        onExportPngTransparent={() => exportPng(true)}
        onImportFile={importFile}
        onNew={goHome}
        onShowShortcuts={() => setShowShortcuts(true)}
        userName={USER_LABEL}
      />

      <div className="relative flex min-h-0 flex-1">
        <main className="canvas-bg relative min-w-0 flex-1 overflow-hidden">
          <div ref={mountRef} className="absolute inset-0" />

          {/* düzlem değiştirici */}
          {mode === "2d" && (
            <div className="anim-rise absolute left-4 top-4 z-20 flex items-center gap-1 rounded-xl border border-line bg-ink-900/90 p-1 shadow-[0_12px_32px_rgba(0,0,0,0.4)] backdrop-blur">
              <span className="px-1.5 font-mono text-[9px] tracking-[0.18em] text-faint">DÜZLEM</span>
              {([
                { pl: "xy" as DrawPlane, label: "XY", hint: "Yatay zemin · katman katman çizim" },
                { pl: "xz" as DrawPlane, label: "XZ", hint: "Ön yüz · dikey çizim. İmlecinin Y'sinden geçer." },
                { pl: "yz" as DrawPlane, label: "YZ", hint: "Yan yüz · dikey çizim. İmlecinin X'inden geçer." },
              ]).map(({ pl, label, hint }) => (
                <button
                  key={pl}
                  onClick={() => changePlane(pl)}
                  title={hint}
                  className={`btn-press rounded-lg px-2.5 py-1.5 font-display text-[12.5px] font-bold tracking-wide ${
                    plane === pl ? "bg-amber text-ink-950 shadow-[0_4px_14px_rgba(255,180,84,0.3)]" : "text-mist hover:bg-ink-800 hover:text-paper"
                  }`}
                >
                  {label}
                </button>
              ))}
              <span className="hidden pl-1.5 pr-1 font-mono text-[8.5px] leading-[1.2] text-faint sm:block">
                düzlem, imlecinin<br />olduğu yerden geçer
              </span>
            </div>
          )}

          {/* düzlem durum çubuğu */}
          {mode === "2d" && (
            <div
              key={plane}
              className="anim-fade pointer-events-none absolute right-4 top-4 z-20 flex items-center gap-2 rounded-lg border border-line bg-ink-900/90 px-3 py-1.5 font-mono text-[10.5px] text-mist shadow-[0_10px_28px_rgba(0,0,0,0.35)] backdrop-blur"
            >
              <span className="font-bold text-amber">{plane.toUpperCase()}</span>
              <span className="text-line">│</span>
              <span>→ {PLANE_INFO[plane].h}</span>
              <span>↑ {PLANE_INFO[plane].vLabel}</span>
              {plane !== "xy" && (
                <>
                  <span className="text-line">│</span>
                  <span className="text-mint">derinlik {PLANE_INFO[plane].depth}={stats.slice}</span>
                </>
              )}
            </div>
          )}

          {/* mini 3D önizleme çerçevesi */}
          {mode === "2d" && miniOn && miniRect && (
            <div
              className="pointer-events-none absolute z-20"
              style={{ left: miniRect.x, top: miniRect.y, width: miniRect.w, height: miniRect.h }}
            >
              <div className="absolute inset-0 rounded-lg border border-line/80 shadow-[0_16px_40px_rgba(0,0,0,0.5)]" />
              <div className="pointer-events-none absolute inset-0 rounded-lg bg-[radial-gradient(120%_120%_at_50%_120%,rgba(10,14,21,0.55),transparent_55%)]" />
              {(["-top-px -left-px border-t-2 border-l-2 rounded-tl-lg", "-top-px -right-px border-t-2 border-r-2 rounded-tr-lg", "-bottom-px -left-px border-b-2 border-l-2 rounded-bl-lg", "-bottom-px -right-px border-b-2 border-r-2 rounded-br-lg"]).map((c) => (
                <span key={c} className={`absolute h-3 w-3 border-amber ${c}`} />
              ))}
              <div className="absolute left-2 top-1.5 flex items-center gap-1.5">
                <span className="anim-pulse-dot h-1.5 w-1.5 rounded-full bg-mint" />
                <span className="font-mono text-[8.5px] tracking-[0.2em] text-mist">3D ÖNİZLEME</span>
              </div>
              <div className="absolute right-1.5 top-1.5 flex gap-1">
                <button
                  onClick={() => changeMode("3d")}
                  title="Tam 3D moda geç"
                  className="btn-press pointer-events-auto rounded border border-line bg-ink-900/90 p-1 text-faint hover:border-mint/50 hover:text-mint"
                >
                  <IconExpand size={11} />
                </button>
                <button
                  onClick={() => setMiniOn(false)}
                  title="Önizlemeyi kapat (V)"
                  className="btn-press pointer-events-auto rounded border border-line bg-ink-900/90 p-1 text-faint hover:border-coral/50 hover:text-coral"
                >
                  <IconX size={11} />
                </button>
              </div>
              <div className="pointer-events-none absolute bottom-1.5 left-2 font-mono text-[8px] text-faint">
                sürükle: döndür · tekerlek: yakınlaş · çift tık: 3D
              </div>
            </div>
          )}

          {/* 3D boş durum */}
          {mode === "3d" && stats.count === 0 && (
            <div className="anim-fade pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="rounded-xl border border-line bg-ink-900/85 px-6 py-5 text-center shadow-[0_20px_50px_rgba(0,0,0,0.4)]">
                <div className="font-display text-[15px] font-semibold text-paper">Sahne boş</div>
                <p className="mt-1.5 max-w-[240px] text-[12.5px] leading-relaxed text-mist">
                  2D Izgara moduna dön, KP boyayarak katman katman inşa et — nesnen burada hacim kazansın.
                </p>
              </div>
            </div>
          )}

          {/* dilimleyici (slicer) kontrol çubuğu — Cura hissi */}
          {mode === "3d" && stats.count > 0 && (
            <div className="anim-rise absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-3 rounded-xl border border-line bg-ink-900/92 px-4 py-3 shadow-[0_16px_44px_rgba(0,0,0,0.5)] backdrop-blur">
              <button
                onClick={toggleSlicer}
                title={slicerOn ? "Dilimleyiciyi kapat" : "Dilimleyiciyi aç (katman katman gezin)"}
                className={`btn-press flex items-center gap-1.5 rounded-lg px-3 py-2 font-display text-[12.5px] font-bold tracking-wide ${
                  slicerOn
                    ? "bg-mint text-ink-950 shadow-[0_4px_14px_rgba(63,214,182,0.35)]"
                    : "border border-line bg-ink-800 text-mist hover:border-mint/40 hover:text-mint"
                }`}
              >
                <IconLayers size={15} />
                Dilimle
              </button>

              <div className="h-7 w-px bg-line-soft" />

              <div className="flex flex-col items-center leading-none">
                <span className={`font-mono text-[9px] tracking-[0.2em] ${slicerOn ? "text-mint" : "text-faint"}`}>KATMAN</span>
                <span className={`mt-1 font-display text-[17px] font-bold ${slicerOn ? "text-paper" : "text-faint"}`}>
                  K{slicerOn ? slicerK : "–"}
                </span>
              </div>

              <button
                onClick={() => slicerOn && setSlicer(Math.max(stats.minK, slicerK - 1))}
                disabled={!slicerOn || slicerK <= stats.minK}
                title="Önceki katman"
                className="btn-press rounded-lg border border-line bg-ink-800 p-2 text-mist hover:border-mint/40 hover:text-mint disabled:pointer-events-none disabled:opacity-30"
              >
                <IconChevronLeft size={14} />
              </button>

              <input
                type="range"
                min={stats.minK}
                max={stats.maxK}
                step={1}
                value={slicerOn ? slicerK : stats.maxK}
                disabled={!slicerOn}
                onChange={(e) => setSlicer(Number(e.target.value))}
                className={`h-1.5 w-44 cursor-pointer accent-[#3fd6b6] transition-opacity sm:w-64 ${slicerOn ? "opacity-100" : "cursor-not-allowed opacity-25"}`}
                title={slicerOn ? "Dilim kaydırıcısı" : "Önce Dilimle'yi aç"}
              />

              <button
                onClick={() => slicerOn && setSlicer(Math.min(stats.maxK, slicerK + 1))}
                disabled={!slicerOn || slicerK >= stats.maxK}
                title="Sonraki katman"
                className="btn-press rounded-lg border border-line bg-ink-800 p-2 text-mist hover:border-mint/40 hover:text-mint disabled:pointer-events-none disabled:opacity-30"
              >
                <IconChevronRight size={14} />
              </button>

              <div className="hidden flex-col items-end leading-none sm:flex">
                <span className="font-mono text-[9px] tracking-[0.2em] text-faint">YÜKSEKLİK</span>
                <span className="mt-1 font-mono text-[13px] font-semibold text-mist">
                  {slicerOn ? `${(((slicerK + 1) * activeProject.kpSizeMm)).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} mm` : "–"}
                </span>
              </div>

              <div className="hidden h-7 w-px bg-line-soft md:block" />
              <span className="hidden font-mono text-[10px] text-faint md:block">{stats.layers} kat</span>
            </div>
          )}

          {/* şuraya dön butonları */}
          {mode === "2d" && (
            <div className="anim-rise absolute bottom-[11.5rem] right-4 z-20 flex flex-col gap-1.5">
              <button
                onClick={() => engineRef.current?.fitView()}
                title="Modele sığdır"
                className="btn-press rounded-lg border border-line bg-ink-900/90 p-2.5 text-mist shadow-[0_10px_28px_rgba(0,0,0,0.35)] hover:border-amber/50 hover:text-amber"
              >
                <IconFit size={16} />
              </button>
              <button
                onClick={() => {
                  if (!engineRef.current?.jumpToLastPaint()) toast("Henüz boyanmış KP yok");
                }}
                title="Son boyanan KP'ye zıpla"
                className="btn-press rounded-lg border border-line bg-ink-900/90 p-2.5 text-mist shadow-[0_10px_28px_rgba(0,0,0,0.35)] hover:border-mint/50 hover:text-mint"
              >
                <IconTarget size={16} />
              </button>
            </div>
          )}

          {/* dilim kademelendiricisi */}
          {mode === "2d" && (
            <div className="anim-rise absolute bottom-4 right-4 z-20 flex flex-col items-center overflow-hidden rounded-xl border border-line bg-ink-900/90 shadow-[0_12px_32px_rgba(0,0,0,0.4)] backdrop-blur">
              <button
                onClick={() => gotoSlice(stats.slice + 1)}
                title={plane === "xy" ? "Üst katman (W)" : "İleri dilim (W)"}
                className="btn-press flex h-10 w-16 items-center justify-center text-mist hover:bg-ink-800 hover:text-amber"
              >
                <IconChevronUp size={17} />
              </button>
              <div className="flex w-full flex-col items-center border-y border-line-soft bg-ink-950/60 py-1.5">
                <span className="font-mono text-[9px] tracking-[0.2em] text-faint">
                  {plane === "xy" ? "KATMAN" : plane === "xz" ? "Y DERİNLİK" : "X DERİNLİK"}
                </span>
                <span className="font-display text-[17px] font-bold leading-tight text-amber">
                  {plane === "xy" ? "K" : plane === "xz" ? "J" : "I"}{stats.slice}
                </span>
                <span className="font-mono text-[9px] text-faint">{stats.sliceCount} KP · {stats.layers} kat</span>
              </div>
              <button
                onClick={() => gotoSlice(stats.slice - 1)}
                disabled={plane === "xy" && stats.slice === 0}
                title={plane === "xy" ? "Alt katman (Q)" : "Geri dilim (Q)"}
                className="btn-press flex h-10 w-16 items-center justify-center text-mist hover:bg-ink-800 hover:text-amber disabled:pointer-events-none disabled:opacity-30"
              >
                <IconChevronDown size={17} />
              </button>
            </div>
          )}

          {/* sidebar sekmesi */}
          <button
            onClick={() => setPanelOpen((v) => !v)}
            title={panelOpen ? "Paneli gizle" : "Paneli aç"}
            className="btn-press absolute right-0 top-1/2 z-30 flex h-16 w-6 -translate-y-1/2 items-center justify-center rounded-l-lg border border-r-0 border-line bg-ink-800/95 text-mist shadow-[-6px_0_18px_rgba(0,0,0,0.25)] hover:text-amber"
          >
            {panelOpen ? <IconChevronRight size={14} /> : <IconChevronLeft size={14} />}
          </button>
        </main>

        <div className={`shrink-0 overflow-hidden transition-[width] duration-300 ease-out ${panelOpen ? "w-[212px] md:w-[248px]" : "w-0"}`}>
          <SidePanel
            tool={tool}
            onTool={setToolBoth}
            colorIdx={colorIdx}
            onColor={changeColor}
            customColors={customColors}
            onAddCustom={addCustomColor}
            mode={mode}
            stats={stats}
            kpSizeMm={activeProject.kpSizeMm}
            symX={symX}
            onSymX={toggleSymX}
            symY={symY}
            onSymY={toggleSymY}
            symCol={symCol}
            onSymCol={setSymCol}
            symRow={symRow}
            onSymRow={setSymRow}
            stampId={stampId}
            onStampId={setStampId}
            clipCount={clip?.length ?? 0}
            onCopyLayer={copyLayer}
            onPasteUp={() => pasteLayer(1)}
            onPasteDown={() => pasteLayer(-1)}
            ghostDepth={ghostDepth}
            onGhostDepth={(n) => setGhostDepth(Math.max(0, Math.min(5, n)))}
            ghostOpacity={ghostOpacity}
            onGhostOpacity={setGhostOpacity}
            miniOn={miniOn}
            onMiniToggle={() => setMiniOn((v) => !v)}
            autoRotate={autoRotate}
            onAutoRotate={(b) => { setAutoRotate(b); autoRotateRef.current = b; engineRef.current?.setAutoRotate(b); }}
            bedOn={bedOn}
            onBedToggle={() => setBedOn((v) => !v)}
            showSupports={showSupports}
            onToggleSupports={() => setShowSupports((v) => !v)}
            analysis={analysis}
            estimate={estimate}
            smoothOn={smoothOn}
            onSmoothMode={setSmoothOn}
            smoothIters={smoothIters}
            onSmoothIters={setSmoothIters}
            smoothStats={smoothInfo}
            onFit={() => engineRef.current?.fitView()}
            onReset={() => engineRef.current?.resetView()}
            onExportStl={exportStl}
            supportActive={supportsActive}
            supportCount={supportCells.length}
            supportMode={supportMode}
            onSupportMode={setSupportMode}
            onGenerateSupports={generateSupports}
            onClearSupports={clearSupports}
          />
        </div>
      </div>

      <Hud mode={mode} tool={tool} stats={stats} hud={hudRef} />
      <Toasts items={toasts} />
      {showShortcuts && <ShortcutsModal onClose={() => setShowShortcuts(false)} />}
    </div>
  );
}
