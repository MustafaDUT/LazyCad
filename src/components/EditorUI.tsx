import { useState, type MutableRefObject, type ReactNode } from "react";
import type { EngineStats, Tool, ViewMode, DrawPlane } from "../three/EditorScene";
import { PALETTE, STAMPS, type PrintAnalysis, type PrintEstimate, formatVolume, formatDuration } from "../lib/model";
import {
  LogoMark, IconGrid, IconCube, IconUndo, IconRedo, IconTrash, IconExport, IconImport,
  IconWarn, IconPrinter, IconX, IconCheck, IconPaint, IconEraser, IconPick, IconBucket,
  IconRect, IconCircle, IconStamp, IconSelect, IconRuler, IconFit, IconRotate, IconEye, IconCopy,
  IconPaste, IconTarget, IconMirror, IconKeyboard, IconCamera, IconFolder, IconLayers, IconSupport,
  IconSmooth, IconUser,
} from "./icons";

/* ================= TOASTS ================= */

export interface ToastItem {
  id: number;
  msg: string;
  tone: "amber" | "mint" | "coral";
}

export function Toasts({ items }: { items: ToastItem[] }) {
  return (
    <div className="pointer-events-none fixed bottom-12 right-4 z-50 flex flex-col-reverse gap-2">
      {items.map((t) => (
        <div
          key={t.id}
          className="anim-toast flex items-center gap-2.5 rounded-lg border border-line bg-ink-800/95 px-4 py-2.5 shadow-[0_16px_40px_rgba(0,0,0,0.5)] backdrop-blur"
        >
          <span className={`h-2 w-2 shrink-0 rounded-full ${t.tone === "mint" ? "bg-mint" : t.tone === "coral" ? "bg-coral" : "bg-amber"}`} />
          <span className="text-[13px] font-medium text-paper">{t.msg}</span>
        </div>
      ))}
    </div>
  );
}

/* ================= HUD ================= */

export interface HudBus {
  cursorEl: HTMLSpanElement | null;
  zoomEl: HTMLSpanElement | null;
  fillEl: HTMLSpanElement | null;
}

const HINTS: Record<string, string> = {
  "2d-paint": "Sol tık: boya · sağ tık dolu KP'yi siler · W/Q: dilim · X/Y: simetri · V: önizleme",
  "2d-erase": "Sol tık: sil · sürükle: toplu sil · sağ tık / boşluk: kaydır",
  "2d-pick": "Dolu bir KP'ye tıklayıp rengini ödünç al",
  "2d-fill": "Tıkla: kapalı bölgeyi seçili renkle doldur",
  "2d-rect": "Sürükle: dikdörtgen çiz, bırakınca dolar",
  "2d-circle": "Sürükle: merkezden daire çiz",
  "2d-stamp": "Izgaraya tıkla: seçili kalıbı bas",
  "2d-select": "Sürükle: bölge seç · tıkla: taşı · Alt+sürükle: kopyala · Esc: geri koy",
  "2d-ruler": "1. KP'ye tıkla → 2. KP'ye tıkla: mesafe · 3. tık yeni ölçüm · sağ tık/Esc: temizle",
  "3d-any": "Sürükle: döndür · sağ tık: kaydır · tekerlek: yakınlaş · boyama 2D modda",
};

export function Hud({ mode, tool, stats, measure, hud }: { mode: ViewMode; tool: Tool; stats: EngineStats; measure: string | null; hud: MutableRefObject<HudBus> }) {
  const hint = mode === "3d" ? HINTS["3d-any"] : HINTS[`2d-${tool}`];
  return (
    <footer className="flex h-9 shrink-0 items-center gap-4 overflow-hidden border-t border-line-soft bg-ink-900/95 px-4 font-mono text-[11px] text-mist">
      <span className="hidden items-center gap-2 truncate text-faint lg:flex">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${mode === "2d" ? "bg-amber" : "bg-mint"}`} />
        {hint}
      </span>
      {measure && (
        <span className="inline-flex min-w-0 items-center gap-1.5 rounded-md border border-amber/40 bg-amber/10 px-2 py-px font-medium text-amber">
          <span>📏</span>
          <span className="truncate">{measure}</span>
        </span>
      )}
      <span className="flex items-center gap-3 lg:ml-auto">
        <span ref={(el) => void (hud.current.cursorEl = el)} className="min-w-[100px] text-paper">— · —</span>
        <span ref={(el) => void (hud.current.fillEl = el)} className="w-12 text-faint">·</span>
        <span className="text-line">│</span>
        <span ref={(el) => void (hud.current.zoomEl = el)} className="min-w-[44px] text-right">%100</span>
        <span className="text-line">│</span>
        <span className="whitespace-nowrap">
          <span className="text-paper">{stats.count.toLocaleString("tr-TR")}</span> KP
        </span>
        {stats.dimsMm && (
          <>
            <span className="text-line">│</span>
            <span className="hidden whitespace-nowrap sm:inline">
              {stats.dimsMm.w.toLocaleString("tr-TR")}×{stats.dimsMm.h.toLocaleString("tr-TR")}×{stats.dimsMm.d.toLocaleString("tr-TR")} mm
            </span>
          </>
        )}
      </span>
    </footer>
  );
}

/* ================= TOOLBAR ================= */

interface ToolbarProps {
  name: string;
  kpSizeMm: number;
  mode: ViewMode;
  onMode: (m: ViewMode) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
  onExportStl: () => void;
  onExportStlWithSupports: () => void;
  supportCount: number;
  onExportObj: () => void;
  onExportGlbSmooth: () => void;
  onExportGlbVoxel: () => void;
  onExportJson: () => void;
  onExportPng: () => void;
  onExportPngTransparent: () => void;
  onImportFile: (f: File) => void;
  onNew: () => void;
  onShowShortcuts: () => void;
  userName: string;
}

export function Toolbar(p: ToolbarProps) {
  const [menu, setMenu] = useState<"none" | "export" | "clear">("none");
  const toggle = (m: "export" | "clear") => setMenu((cur) => (cur === m ? "none" : m));
  const iconBtn =
    "btn-press relative rounded-lg border border-transparent p-2 text-mist hover:border-line hover:bg-ink-800 hover:text-paper disabled:opacity-35 disabled:pointer-events-none";

  return (
    <header className="relative z-30 flex h-14 shrink-0 items-center gap-3 border-b border-line-soft bg-ink-900/95 px-3 md:px-4">
      <button onClick={p.onNew} className="btn-press flex items-center gap-2.5" title="Başlangıç ekranı">
        <LogoMark size={28} />
        <div className="hidden leading-none sm:block">
          <div className="font-display text-[15px] font-bold tracking-[0.06em] text-paper">LAZY CAD</div>
          <div className="mt-0.5 font-mono text-[9px] tracking-[0.22em] text-faint">TEMBEL KEDİ</div>
        </div>
      </button>

      <div className="hidden h-7 w-px bg-line-soft md:block" />

      <div className="hidden min-w-0 items-center gap-2 md:flex">
        <span className="max-w-[150px] truncate text-[13.5px] font-medium text-paper">{p.name}</span>
        <span className="rounded-md border border-amber/40 bg-amber/10 px-2 py-0.5 font-mono text-[11px] font-medium text-amber">
          KP {p.kpSizeMm} mm
        </span>
      </div>

      <div className="absolute left-1/2 flex -translate-x-1/2 rounded-xl border border-line bg-ink-950/80 p-1">
        {([
          { m: "2d" as ViewMode, label: "2D Izgara", icon: <IconGrid size={15} /> },
          { m: "3d" as ViewMode, label: "3D Nesne", icon: <IconCube size={15} /> },
        ]).map(({ m, label, icon }) => (
          <button
            key={m}
            onClick={() => p.onMode(m)}
            className={`btn-press flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-display text-[13px] font-semibold tracking-wide md:px-4 ${
              p.mode === m
                ? m === "2d"
                  ? "bg-amber text-ink-950 shadow-[0_4px_16px_rgba(255,180,84,0.3)]"
                  : "bg-mint text-ink-950 shadow-[0_4px_16px_rgba(63,214,182,0.3)]"
                : "text-mist hover:text-paper"
            }`}
          >
            {icon}
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>

      <div className="ml-auto flex items-center gap-1">
        <button className={iconBtn} disabled={!p.canUndo} onClick={p.onUndo} title="Geri Al (Ctrl+Z)">
          <IconUndo size={17} />
        </button>
        <button className={iconBtn} disabled={!p.canRedo} onClick={p.onRedo} title="Yinele (Ctrl+Y)">
          <IconRedo size={17} />
        </button>
        <button className={iconBtn} onClick={p.onShowShortcuts} title="Klavye kısayolları (?)">
          <IconKeyboard size={17} />
        </button>

        <div className="relative">
          <button className={`${iconBtn} ${menu === "clear" ? "border-coral/50 text-coral" : ""}`} onClick={() => toggle("clear")} title="Tuvali temizle">
            <IconTrash size={17} />
          </button>
          {menu === "clear" && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMenu("none")} />
              <div className="anim-rise absolute right-0 top-full z-50 mt-2 w-60 rounded-xl border border-line bg-ink-800 p-3.5 shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
                <div className="flex items-center gap-2 text-coral">
                  <IconWarn size={16} />
                  <span className="font-display text-[13.5px] font-semibold">Tüm KP&rsquo;ler silinsin mi?</span>
                </div>
                <p className="mt-1.5 text-[12px] leading-snug text-mist">Boyanmış her hücre temizlenir. Tek adımda geri alabilirsin.</p>
                <div className="mt-3 flex gap-2">
                  <button className="btn-press flex-1 rounded-lg border border-line py-1.5 text-[12.5px] font-medium text-mist hover:text-paper" onClick={() => setMenu("none")}>
                    Vazgeç
                  </button>
                  <button
                    className="btn-press flex-1 rounded-lg bg-coral py-1.5 text-[12.5px] font-semibold text-ink-950 hover:brightness-110"
                    onClick={() => { setMenu("none"); p.onClear(); }}
                  >
                    Temizle
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="mx-1 h-7 w-px bg-line-soft" />

        <button className={`${iconBtn} hidden sm:block`} onClick={() => document.getElementById("kp-import-input")?.click()} title="JSON model içe aktar">
          <IconImport size={17} />
        </button>
        <input
          id="kp-import-input"
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) p.onImportFile(f);
            e.target.value = "";
          }}
        />

        <div className="mx-1 hidden h-7 w-px bg-line-soft sm:block" />

        <button
          onClick={p.onNew}
          title="Projelerim — ana ekrana dön"
          className="btn-press flex items-center gap-1.5 rounded-lg border border-line bg-ink-800 px-3 py-2 text-[13px] font-semibold text-paper transition-colors hover:border-mint/50 hover:bg-mint/10 hover:text-mint"
        >
          <IconFolder size={15} />
          <span className="hidden md:inline">Projelerim</span>
        </button>

        <div className="relative">
          <button
            className={`btn-press flex items-center gap-1.5 rounded-lg border px-3 py-2 text-[13px] font-semibold ${
              menu === "export" ? "border-amber/60 bg-amber/15 text-amber" : "border-line bg-ink-800 text-paper hover:border-amber/50"
            }`}
            onClick={() => toggle("export")}
          >
            <IconExport size={15} />
            <span className="hidden md:inline">Dışa Aktar</span>
          </button>
          {menu === "export" && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMenu("none")} />
              <div className="anim-rise absolute right-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-xl border border-line bg-ink-800 shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
                <div className="bg-ink-950/40 px-4 py-1.5 font-mono text-[9px] tracking-[0.24em] text-amber">3D BASKI</div>
                <button className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-ink-700/60" onClick={() => { setMenu("none"); p.onExportStl(); }}>
                  <span className="mt-0.5 text-mint"><IconPrinter size={17} /></span>
                  <span>
                    <span className="block text-[13.5px] font-semibold text-paper">STL — 3D baskı</span>
                    <span className="mt-0.5 block text-[11.5px] leading-snug text-mist">Binary STL, mm biriminde. Dilimleyiciye yüklenir.</span>
                  </span>
                </button>
                {p.supportCount > 0 && (
                  <button className="flex w-full items-start gap-3 border-t border-line-soft px-4 py-3 text-left transition-colors hover:bg-ink-700/60" onClick={() => { setMenu("none"); p.onExportStlWithSupports(); }}>
                    <span className="mt-0.5 text-amber"><IconSupport size={17} /></span>
                    <span>
                      <span className="block text-[13.5px] font-semibold text-paper">
                        STL + destekler <span className="font-mono text-[11px] text-mint">({p.supportCount})</span>
                      </span>
                      <span className="mt-0.5 block text-[11.5px] leading-snug text-mist">
                        Model ve üretilen destek sütunları tek sızdırmaz dosyada.
                      </span>
                    </span>
                  </button>
                )}
                <div className="border-t border-line-soft bg-ink-950/40 px-4 py-1.5 font-mono text-[9px] tracking-[0.24em] text-mint">OYUN & CAD</div>
                <button className="flex w-full items-start gap-3 border-t border-line-soft px-4 py-3 text-left transition-colors hover:bg-ink-700/60" onClick={() => { setMenu("none"); p.onExportObj(); }}>
                  <span className="mt-0.5 text-paper"><IconCube size={17} /></span>
                  <span>
                    <span className="block text-[13.5px] font-semibold text-paper">OBJ — Blender</span>
                    <span className="mt-0.5 block text-[11.5px] leading-snug text-mist">Pürüzsüz mesh, köşe renkleriyle. Blender'a doğrudan açılır.</span>
                  </span>
                </button>
                <button className="flex w-full items-start gap-3 border-t border-line-soft px-4 py-3 text-left transition-colors hover:bg-ink-700/60" onClick={() => { setMenu("none"); p.onExportGlbSmooth(); }}>
                  <span className="mt-0.5 text-amber"><IconSmooth size={17} /></span>
                  <span>
                    <span className="block text-[13.5px] font-semibold text-paper">GLB — oyun asseti (pürüzsüz)</span>
                    <span className="mt-0.5 block text-[11.5px] leading-snug text-mist">glTF binary · Unity / Unreal / Godot / web.</span>
                  </span>
                </button>
                <button className="flex w-full items-start gap-3 border-t border-line-soft px-4 py-3 text-left transition-colors hover:bg-ink-700/60" onClick={() => { setMenu("none"); p.onExportGlbVoxel(); }}>
                  <span className="mt-0.5 text-mist"><IconGrid size={17} /></span>
                  <span>
                    <span className="block text-[13.5px] font-semibold text-paper">GLB — voxel (retro)</span>
                    <span className="mt-0.5 block text-[11.5px] leading-snug text-mist">Köşeli blok görünümü · Minecraft / voxel tarzı.</span>
                  </span>
                </button>
                <div className="border-t border-line-soft bg-ink-950/40 px-4 py-1.5 font-mono text-[9px] tracking-[0.24em] text-mist">MODEL & GÖRSEL</div>
                <button className="flex w-full items-start gap-3 border-t border-line-soft px-4 py-3 text-left transition-colors hover:bg-ink-700/60" onClick={() => { setMenu("none"); p.onExportJson(); }}>
                  <span className="mt-0.5 text-amber"><IconCube size={17} /></span>
                  <span>
                    <span className="block text-[13.5px] font-semibold text-paper">JSON — KP modeli</span>
                    <span className="mt-0.5 block text-[11.5px] leading-snug text-mist">Kaynak format — her KP [i, j, k, renk]; içe/dışa aktarılabilir.</span>
                  </span>
                </button>
                <button className="flex w-full items-start gap-3 border-t border-line-soft px-4 py-3 text-left transition-colors hover:bg-ink-700/60" onClick={() => { setMenu("none"); p.onExportPng(); }}>
                  <span className="mt-0.5 text-mist"><IconCamera size={17} /></span>
                  <span>
                    <span className="block text-[13.5px] font-semibold text-paper">PNG — ekran görüntüsü</span>
                    <span className="mt-0.5 block text-[11.5px] leading-snug text-mist">O anki görünümü 2× çözünürlükte indirir.</span>
                  </span>
                </button>
                <button className="flex w-full items-start gap-3 border-t border-line-soft px-4 py-3 text-left transition-colors hover:bg-ink-700/60" onClick={() => { setMenu("none"); p.onExportPngTransparent(); }}>
                  <span className="mt-0.5 text-mint"><IconLayers size={17} /></span>
                  <span>
                    <span className="block text-[13.5px] font-semibold text-paper">PNG — şeffaf zemin</span>
                    <span className="mt-0.5 block text-[11.5px] leading-snug text-mist">Sadece model, alfa kanallı. Paylaşım için.</span>
                  </span>
                </button>
              </div>
            </>
          )}
        </div>

        <div className="mx-1 h-7 w-px bg-line-soft" />
        <span
          className="flex max-w-[120px] items-center gap-1.5 rounded-lg border border-line bg-ink-800 px-2.5 py-2 text-[12px] font-medium text-paper"
          title={p.userName}
        >
          <span className="shrink-0 text-faint">
            <IconUser size={13} />
          </span>
          <span className="truncate">{p.userName}</span>
        </span>
      </div>
    </header>
  );
}

/* ================= SIDE PANEL ================= */

const TOOLS: { t: Tool; label: string; k: string; icon: ReactNode }[] = [
  { t: "paint", label: "Boya", k: "B", icon: <IconPaint size={15} /> },
  { t: "erase", label: "Sil", k: "E", icon: <IconEraser size={15} /> },
  { t: "fill", label: "Kova", k: "F", icon: <IconBucket size={15} /> },
  { t: "pick", label: "Pipet", k: "P", icon: <IconPick size={15} /> },
  { t: "rect", label: "Kare", k: "R", icon: <IconRect size={15} /> },
  { t: "circle", label: "Daire", k: "C", icon: <IconCircle size={15} /> },
  { t: "stamp", label: "Damga", k: "S", icon: <IconStamp size={15} /> },
  { t: "select", label: "Seç", k: "A", icon: <IconSelect size={15} /> },
  { t: "ruler", label: "Çetvel", k: "L", icon: <IconRuler size={15} /> },
];

function StampPreview({ art, active }: { art: string[]; active: boolean }) {
  return (
    <span className="flex flex-col items-center gap-[1.5px]">
      {art.map((row, r) => (
        <span key={r} className="flex gap-[1.5px]">
          {row.split("").map((ch, c) => (
            <span key={c} className="h-[3px] w-[3px] rounded-[0.5px]" style={{ background: ch === "X" ? (active ? "#0f141d" : "#8da0ba") : "transparent" }} />
          ))}
        </span>
      ))}
    </span>
  );
}

function CheckRow({ ok, warn, text }: { ok: boolean; warn?: boolean; text: string }) {
  return (
    <div className="flex items-center gap-2">
      {ok ? (
        <span className="text-mint"><IconCheck size={13} /></span>
      ) : (
        <span className={warn ? "text-amber" : "text-coral"}><IconWarn size={13} /></span>
      )}
      <span className={ok ? "text-mist" : warn ? "text-amber" : "text-coral"}>{text}</span>
    </div>
  );
}

interface SidePanelProps {
  tool: Tool;
  onTool: (t: Tool) => void;
  colorIdx: number;
  onColor: (i: number) => void;
  customColors: string[];
  onAddCustom: (hex: string) => void;
  mode: ViewMode;
  stats: EngineStats;
  kpSizeMm: number;
  symX: boolean;
  onSymX: () => void;
  symY: boolean;
  onSymY: () => void;
  symCol: number;
  onSymCol: (v: number) => void;
  symRow: number;
  onSymRow: (v: number) => void;
  stampId: string;
  onStampId: (id: string) => void;
  clipCount: number;
  onCopyLayer: () => void;
  onPasteUp: () => void;
  onPasteDown: () => void;
  ghostDepth: number;
  onGhostDepth: (n: number) => void;
  ghostOpacity: number;
  onGhostOpacity: (v: number) => void;
  miniOn: boolean;
  onMiniToggle: () => void;
  autoRotate: boolean;
  onAutoRotate: (b: boolean) => void;
  bedOn: boolean;
  onBedToggle: () => void;
  showSupports: boolean;
  onToggleSupports: () => void;
  analysis: PrintAnalysis | null;
  estimate: PrintEstimate | null;
  smoothOn: boolean;
  onSmoothMode: (b: boolean) => void;
  smoothIters: number;
  onSmoothIters: (n: number) => void;
  smoothStats: { tris: number; verts: number } | null;
  onFit: () => void;
  onReset: () => void;
  onExportStl: () => void;
  supportActive: boolean;
  supportCount: number;
  supportMode: "full" | "sparse";
  onSupportMode: (m: "full" | "sparse") => void;
  onGenerateSupports: () => void;
  onClearSupports: () => void;
}

export function SidePanel(p: SidePanelProps) {
  const s = p.stats;
  const planeLabel = s.plane === "xy" ? "KATMAN" : s.plane === "xz" ? "Y DÜZLEMİ" : "X DÜZLEMİ";
  const [pendingHex, setPendingHex] = useState("#e2554f");
  const sliceLetter = s.plane === "xy" ? "K" : s.plane === "xz" ? "J" : "I";

  return (
    <aside className="flex h-full w-[212px] flex-col overflow-y-auto border-l border-line-soft bg-ink-900/90 md:w-[248px]">
      {/* araçlar */}
      <div className="border-b border-line-soft p-3.5">
        <div className="mb-2.5 font-mono text-[10px] tracking-[0.24em] text-faint">ARAÇLAR</div>
        <div className="grid grid-cols-4 gap-1.5">
          {TOOLS.map(({ t, label, k, icon }) => (
            <button
              key={t}
              onClick={() => p.onTool(t)}
              title={`${label} (${k})`}
              className={`btn-press group flex flex-col items-center gap-0.5 rounded-lg border py-2 ${
                p.tool === t ? "border-amber/60 bg-amber/12 text-amber" : "border-line bg-ink-800 text-mist hover:border-amber/35 hover:text-paper"
              }`}
            >
              {icon}
              <span className="text-[10px] font-medium leading-tight">{label}</span>
              <kbd className={`rounded border px-1 text-[8px] leading-[12px] ${p.tool === t ? "border-amber/40 text-amber/80" : "border-line text-faint"}`}>{k}</kbd>
            </button>
          ))}
        </div>

        {/* damga seçici */}
        {p.tool === "stamp" && (
          <div className="anim-fade mt-2.5 rounded-lg border border-line-soft bg-ink-950/60 p-2">
            <div className="mb-1.5 font-mono text-[9px] tracking-[0.2em] text-faint">KALIP</div>
            <div className="grid grid-cols-6 gap-1">
              {STAMPS.map((st) => (
                <button
                  key={st.id}
                  onClick={() => p.onStampId(st.id)}
                  title={st.name}
                  className={`btn-press flex items-center justify-center rounded-md border py-1.5 ${
                    p.stampId === st.id ? "border-amber bg-amber" : "border-line bg-ink-800 hover:border-amber/40"
                  }`}
                >
                  <StampPreview art={st.art} active={p.stampId === st.id} />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* simetri */}
        <div className="mt-2.5 grid grid-cols-2 gap-1.5">
          <button
            onClick={p.onSymX}
            className={`btn-press flex flex-col items-center gap-0.5 rounded-lg border py-2 ${
              p.symX ? "border-mint/60 bg-mint/12 text-mint" : "border-line bg-ink-800 text-mist hover:border-mint/35 hover:text-paper"
            }`}
            title="Dikey simetri ekseni (X)"
          >
            <IconMirror size={15} />
            <span className="text-[10px] font-medium">Dikey</span>
          </button>
          <button
            onClick={p.onSymY}
            className={`btn-press flex flex-col items-center gap-0.5 rounded-lg border py-2 ${
              p.symY ? "border-mint/60 bg-mint/12 text-mint" : "border-line bg-ink-800 text-mist hover:border-mint/35 hover:text-paper"
            }`}
            title="Yatay simetri ekseni (Y)"
          >
            <span className="rotate-90"><IconMirror size={15} /></span>
            <span className="text-[10px] font-medium">Yatay</span>
          </button>
        </div>
        {(p.symX || p.symY) && (
          <div className="anim-fade mt-2 space-y-1.5 rounded-lg border border-mint/30 bg-mint/[0.05] p-2.5">
            {p.symX && (
              <div className="flex items-center gap-2 font-mono text-[10.5px] text-mist">
                <span className="w-14 text-mint">Sütun</span>
                <input type="range" min={-100} max={100} value={p.symCol} onChange={(e) => p.onSymCol(Number(e.target.value))} className="flex-1 accent-[#3fd6b6]" />
                <span className="w-8 text-right text-paper">{p.symCol}</span>
              </div>
            )}
            {p.symY && (
              <div className="flex items-center gap-2 font-mono text-[10.5px] text-mist">
                <span className="w-14 text-mint">Satır</span>
                <input type="range" min={-100} max={100} value={p.symRow} onChange={(e) => p.onSymRow(Number(e.target.value))} className="flex-1 accent-[#3fd6b6]" />
                <span className="w-8 text-right text-paper">{p.symRow}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* palet */}
      <div className="border-b border-line-soft p-3.5">
        <div className="mb-2.5 flex items-baseline justify-between">
          <span className="font-mono text-[10px] tracking-[0.24em] text-faint">PALET</span>
          <span className="font-mono text-[10px] text-mist">{PALETTE[p.colorIdx]?.name ?? "Özel"}</span>
        </div>
        <div className="grid grid-cols-5 gap-1.5">
          {PALETTE.map((c, i) => (
            <button
              key={c.hex}
              onClick={() => p.onColor(i)}
              title={`${c.name} (${(i + 1) % 10})`}
              className={`btn-press relative aspect-square rounded-md border border-ink-950/70 transition-transform hover:z-10 hover:scale-110 ${
                p.colorIdx === i ? "z-10 ring-2 ring-paper ring-offset-2 ring-offset-ink-900" : ""
              }`}
              style={{ background: c.hex, boxShadow: p.colorIdx === i ? `0 4px 14px ${c.hex}55` : undefined }}
            >
              {p.colorIdx === i && (
                <span className="absolute inset-0 flex items-center justify-center text-ink-950/80"><IconCheck size={13} /></span>
              )}
              <kbd className="absolute bottom-0 right-0.5 font-mono text-[8px] leading-3 text-ink-950/55">{(i + 1) % 10}</kbd>
            </button>
          ))}
        </div>

        {/* özel renkler */}
        <div className="mt-3">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="font-mono text-[9px] tracking-[0.2em] text-faint">ÖZEL RENKLER</span>
            <span className="font-mono text-[9px] text-faint">{p.customColors.length}/14</span>
          </div>
          <div className="grid grid-cols-5 gap-1.5">
            {p.customColors.map((hex, i) => {
              const idx = PALETTE.length + i;
              return (
                <button
                  key={`${hex}-${i}`}
                  onClick={() => p.onColor(idx)}
                  title={hex}
                  className={`btn-press relative aspect-square rounded-md border border-ink-950/70 transition-transform hover:z-10 hover:scale-110 ${
                    p.colorIdx === idx ? "z-10 ring-2 ring-paper ring-offset-2 ring-offset-ink-900" : ""
                  }`}
                  style={{ background: hex }}
                >
                  {p.colorIdx === idx && (
                    <span className="absolute inset-0 flex items-center justify-center text-ink-950/80"><IconCheck size={13} /></span>
                  )}
                </button>
              );
            })}
            {p.customColors.length < 14 && (
              <label
                className="btn-press relative flex aspect-square cursor-pointer items-center justify-center overflow-hidden rounded-md border border-dashed border-line bg-ink-800 text-faint transition-colors hover:border-amber/50 hover:text-amber"
                title="Önizleme rengini seç"
              >
                <input
                  type="color"
                  value={pendingHex}
                  onChange={(e) => setPendingHex(e.target.value)}
                  className="absolute inset-0 cursor-pointer opacity-0"
                />
                <span className="text-[15px] leading-none">+</span>
              </label>
            )}
          </div>

          {p.customColors.length < 14 && (
            <div className="anim-fade mt-2 rounded-lg border border-line-soft bg-ink-950/60 p-2">
              <div className="flex items-center gap-2">
                <label
                  className="relative block h-9 w-9 shrink-0 cursor-pointer overflow-hidden rounded-md border border-line transition-shadow hover:shadow-[0_0_0_3px_rgba(255,180,84,0.22)]"
                  title="Rengi paletten seç"
                >
                  <span className="absolute inset-0 transition-colors duration-150" style={{ background: pendingHex }} />
                  <input
                    type="color"
                    value={pendingHex}
                    onChange={(e) => setPendingHex(e.target.value)}
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                  />
                </label>
                <button
                  onClick={() => p.onAddCustom(pendingHex)}
                  className="btn-press flex-1 rounded-md bg-amber/15 py-2 font-display text-[11.5px] font-bold tracking-[0.06em] text-amber transition-colors hover:bg-amber hover:text-ink-950"
                >
                  RENGİ EKLE
                </button>
              </div>
              <div className="mt-1.5 flex items-center justify-between font-mono text-[9px] text-faint">
                <span>önce seç · sonra ekle</span>
                <span className="text-mist">{pendingHex.toUpperCase()}</span>
              </div>
            </div>
          )}
          {p.customColors.length >= 14 && (
            <div className="mt-2 rounded-lg border border-line-soft bg-ink-950/60 px-2.5 py-1.5 text-center font-mono text-[9.5px] text-faint">
              14/14 — palet dolu
            </div>
          )}
        </div>
      </div>

      {/* moda göre bilgi kartı */}
      <div className="border-b border-line-soft p-3.5">
        {p.mode === "2d" ? (
          <>
            <div className="mb-2.5 flex items-center justify-between">
              <span className="font-mono text-[10px] tracking-[0.24em] text-faint">
                {planeLabel} · {sliceLetter}{s.slice}
              </span>
              <span className="rounded-full border border-amber/40 bg-amber/10 px-2 py-0.5 font-mono text-[9px] tracking-wider text-amber">
                {s.plane === "xy" ? "KAT KAT" : "DİKİNE"}
              </span>
            </div>
            <dl className="space-y-1.5 font-mono text-[11.5px]">
              <div className="flex justify-between"><dt className="text-faint">Toplam KP</dt><dd className="font-semibold text-paper">{s.count.toLocaleString("tr-TR")}</dd></div>
              <div className="flex justify-between"><dt className="text-faint">Bu dilimde</dt><dd className="text-mist">{s.sliceCount.toLocaleString("tr-TR")}</dd></div>
              <div className="flex justify-between"><dt className="text-faint">Katman</dt><dd className="text-mist">{s.layers}</dd></div>
              <div className="flex justify-between"><dt className="text-faint">KP boyutu</dt><dd className="text-mist">{p.kpSizeMm} mm</dd></div>
            </dl>

            {/* hayalet + önizleme kontrolleri */}
            <div className="mt-3 space-y-2 overflow-hidden rounded-lg border border-line-soft bg-ink-950/60 p-2.5">
              <div className="flex items-center justify-between font-mono text-[10px] text-mist">
                <span className="tracking-[0.15em] text-faint">ALT DİLİM HAYALETLERİ</span>
                <span className="text-paper">{p.ghostDepth}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <button onClick={() => p.onGhostDepth(p.ghostDepth - 1)} className="btn-press rounded border border-line px-2 py-0.5 text-faint hover:text-paper">−</button>
                <div className="h-1 flex-1 overflow-hidden rounded bg-ink-800">
                  <div className="h-full rounded bg-amber/70 transition-all" style={{ width: `${(p.ghostDepth / 5) * 100}%` }} />
                </div>
                <button onClick={() => p.onGhostDepth(p.ghostDepth + 1)} className="btn-press rounded border border-line px-2 py-0.5 text-faint hover:text-paper">+</button>
              </div>
              <div className="flex min-w-0 items-center gap-2 font-mono text-[10px] text-mist">
                <span className="shrink-0 tracking-[0.15em] text-faint">SAYDAMLIK</span>
                <input
                  type="range" min={5} max={85} value={Math.round(p.ghostOpacity * 100)}
                  onChange={(e) => p.onGhostOpacity(Number(e.target.value) / 100)}
                  disabled={p.ghostDepth === 0}
                  aria-label="Hayalet saydamlığı"
                  className="min-w-0 flex-1 basis-0 accent-[#ffb454] disabled:opacity-30"
                />
                <span className="shrink-0 text-paper">%{Math.round(p.ghostOpacity * 100)}</span>
              </div>
              <button
                onClick={p.onMiniToggle}
                className={`btn-press flex w-full items-center justify-center gap-2 rounded-md border py-1.5 text-[11px] font-medium ${
                  p.miniOn ? "border-mint/50 bg-mint/10 text-mint" : "border-line bg-ink-800 text-mist hover:text-paper"
                }`}
              >
                <IconEye size={13} /> 3D önizleme {p.miniOn ? "açık" : "kapalı"} (V)
              </button>
            </div>

            {/* katman panosu */}
            <div className="mt-2.5 grid grid-cols-3 gap-1.5">
              <button onClick={p.onCopyLayer} className="btn-press flex flex-col items-center gap-1 rounded-lg border border-line bg-ink-800 py-2 text-[10.5px] font-medium text-mist hover:border-amber/40 hover:text-paper" title="Bu dilimi kopyala">
                <IconCopy size={14} /> Kopyala
              </button>
              <button onClick={p.onPasteUp} disabled={p.clipCount === 0} className="btn-press flex flex-col items-center gap-1 rounded-lg border border-line bg-ink-800 py-2 text-[10.5px] font-medium text-mist hover:border-amber/40 hover:text-paper disabled:opacity-35" title="Üst dilime yapıştır">
                <IconPaste size={14} /> Üste
              </button>
              <button onClick={p.onPasteDown} disabled={p.clipCount === 0} className="btn-press flex flex-col items-center gap-1 rounded-lg border border-line bg-ink-800 py-2 text-[10.5px] font-medium text-mist hover:border-amber/40 hover:text-paper disabled:opacity-35" title="Alt dilime yapıştır">
                <IconPaste size={14} className="rotate-180" /> Alta
              </button>
            </div>

            <div className="mt-2 grid grid-cols-2 gap-1.5">
              <button onClick={p.onFit} className="btn-press flex items-center justify-center gap-1.5 rounded-lg border border-line bg-ink-800 py-2 text-[12px] font-medium text-mist hover:border-amber/40 hover:text-paper">
                <IconFit size={14} /> Sığdır
              </button>
              <button onClick={p.onReset} className="btn-press flex items-center justify-center gap-1.5 rounded-lg border border-line bg-ink-800 py-2 text-[12px] font-medium text-mist hover:border-amber/40 hover:text-paper">
                <IconTarget size={14} /> Merkez
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="mb-2.5 flex items-center justify-between">
              <span className="font-mono text-[10px] tracking-[0.24em] text-faint">BASKI ÖZETİ</span>
              <span className="rounded-full border border-mint/40 bg-mint/10 px-2 py-0.5 font-mono text-[9px] tracking-wider text-mint">3D</span>
            </div>
            <dl className="space-y-1.5 font-mono text-[11.5px]">
              <div className="flex justify-between">
                <dt className="text-faint">Boyut</dt>
                <dd className="text-right text-mist">
                  {s.dimsMm ? `${s.dimsMm.w.toLocaleString("tr-TR")}×${s.dimsMm.h.toLocaleString("tr-TR")}×${s.dimsMm.d.toLocaleString("tr-TR")} mm` : "—"}
                </dd>
              </div>
              <div className="flex justify-between"><dt className="text-faint">Hacim</dt><dd className="font-semibold text-paper">{formatVolume(s.volumeMm3)}</dd></div>
              <div className="flex justify-between"><dt className="text-faint">PLA ağırlık</dt><dd className="text-mist">{s.weightG > 0 ? `≈ ${s.weightG.toLocaleString("tr-TR", { maximumFractionDigits: 1 })} g` : "—"}</dd></div>
              <div className="flex justify-between"><dt className="text-faint">Taban</dt><dd className={s.floating ? "text-amber" : "text-mint"}>{s.floating ? `K${s.minK} · havada` : `K${s.minK} · zeminde`}</dd></div>
              <div className="flex justify-between"><dt className="text-faint">Taban teması</dt><dd className="text-mist">{s.baseContact} KP</dd></div>
            </dl>

            {p.estimate && s.count > 0 && (
              <div className="mt-2.5 rounded-lg border border-line-soft bg-ink-950/60 p-2.5 font-mono text-[11px]">
                <div className="mb-1 text-[9px] tracking-[0.2em] text-faint">TAHMİNİ BASKI</div>
                <div className="flex justify-between text-mist"><span>Süre</span><span className="text-paper">{formatDuration(p.estimate.minutes)}</span></div>
                <div className="flex justify-between text-mist"><span>PLA maliyet</span><span className="text-amber">≈ {p.estimate.costTL.toLocaleString("tr-TR", { maximumFractionDigits: 1 })} ₺</span></div>
              </div>
            )}

            {p.analysis && (
              <div className="mt-2.5 space-y-1.5 rounded-lg border border-line-soft bg-ink-950/60 p-2.5 text-[11px]">
                <div className="mb-1 font-mono text-[9px] tracking-[0.2em] text-faint">BASKI KONTROLÜ</div>
                <CheckRow ok={!p.analysis.floating} warn text={p.analysis.floating ? "Model tabandan havada başlıyor" : "Model tabana oturuyor"} />
                <CheckRow
                  ok={p.analysis.pocketCells <= 0}
                  warn
                  text={
                    p.analysis.pocketCells > 0
                      ? `İçeride kapalı hava: ${p.analysis.pocketCells} hücre (${p.analysis.pocketRegions} bölge)`
                      : p.analysis.pocketCells === 0
                        ? "İçeride kapalı hava yok"
                        : "Analiz için model çok büyük"
                  }
                />
                <CheckRow
                  ok={p.analysis.overhangs.length === 0}
                  warn
                  text={p.analysis.overhangs.length > 0 ? `${p.analysis.overhangs.length} hücre destek ister` : "Destek gerekmiyor"}
                />
                {p.analysis.overhangs.length > 0 && (
                  <button
                    onClick={p.onToggleSupports}
                    className={`btn-press mt-1 w-full rounded-md border py-1.5 text-[11px] font-medium ${
                      p.showSupports ? "border-coral/60 bg-coral/15 text-coral" : "border-line bg-ink-800 text-mist hover:text-paper"
                    }`}
                  >
                    {p.showSupports ? "İşaretleri gizle" : "Sahnede işaretle"}
                  </button>
                )}
              </div>
            )}

            {/* otomatik destek üretici */}
            <div className="mt-3 rounded-lg border border-line-soft bg-ink-950/50 p-2.5">
              <div className="mb-2 flex items-center justify-between">
                <span className="flex items-center gap-1.5 font-mono text-[9.5px] tracking-[0.2em] text-faint">
                  <IconSupport size={13} className={p.supportActive ? "text-mint" : ""} />
                  DESTEK ÜRETİCİ
                </span>
                <div className="flex overflow-hidden rounded-md border border-line">
                  {(
                    [
                      { m: "full" as const, label: "Tam" },
                      { m: "sparse" as const, label: "Seyrek" },
                    ]
                  ).map(({ m, label }) => (
                    <button
                      key={m}
                      onClick={() => p.onSupportMode(m)}
                      title={m === "full" ? "Her overhang altına sütun" : "Dama deseni — malzeme tasarrufu"}
                      className={`btn-press px-2 py-1 font-mono text-[9.5px] tracking-wider ${
                        p.supportMode === m ? "bg-mint/20 text-mint" : "bg-ink-800 text-faint hover:text-mist"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {p.supportActive ? (
                <>
                  <div className="grid grid-cols-2 gap-1.5 font-mono text-[11px]">
                    <div className="rounded-md border border-line-soft bg-ink-900 px-2 py-1.5">
                      <div className="text-[8.5px] tracking-[0.18em] text-faint">SÜTUN HÜCRESİ</div>
                      <div className="mt-0.5 font-semibold text-mint">{p.supportCount.toLocaleString("tr-TR")}</div>
                    </div>
                    <div className="rounded-md border border-line-soft bg-ink-900 px-2 py-1.5">
                      <div className="text-[8.5px] tracking-[0.18em] text-faint">DESTEK HACMİ</div>
                      <div className="mt-0.5 font-semibold text-mint">
                        {formatVolume(p.supportCount * Math.pow(p.kpSizeMm, 3))}
                      </div>
                    </div>
                  </div>
                  <div className="mt-1.5 flex gap-1.5">
                    <button
                      onClick={p.onGenerateSupports}
                      className="btn-press flex-1 rounded-md border border-mint/40 bg-mint/10 py-1.5 text-[11px] font-semibold text-mint hover:bg-mint/20"
                    >
                      Yeniden üret
                    </button>
                    <button
                      onClick={p.onClearSupports}
                      className="btn-press rounded-md border border-line bg-ink-800 px-2.5 py-1.5 text-[11px] font-medium text-mist hover:border-coral/50 hover:text-coral"
                      title="Destekleri kaldır"
                    >
                      Kaldır
                    </button>
                  </div>
                  <p className="mt-1.5 font-mono text-[8.5px] leading-relaxed text-faint">
                    Model değişince otomatik güncellenir · Dışa Aktar → "STL + destekler"
                  </p>
                </>
              ) : (
                <button
                  onClick={p.onGenerateSupports}
                  disabled={s.count === 0}
                  className="btn-press flex w-full items-center justify-center gap-1.5 rounded-md border border-mint/40 bg-mint/10 py-2 text-[11.5px] font-semibold text-mint hover:bg-mint/20 disabled:opacity-35"
                >
                  <IconSupport size={14} />
                  Destek sütunlarını üret
                </button>
              )}
            </div>

            {/* YÜZEY: voxel ↔ pürüzsüz */}
            <div className="mt-3 rounded-lg border border-line-soft bg-ink-950/60 p-2.5">
              <div className="flex items-center justify-between font-mono text-[10px] text-mist">
                <span className="tracking-[0.15em] text-faint">YÜZEY</span>
                {p.smoothOn && p.smoothStats && (
                  <span className="text-mint">{p.smoothStats.tris.toLocaleString("tr-TR")} üçgen</span>
                )}
              </div>
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                <button
                  onClick={() => p.onSmoothMode(false)}
                  className={`btn-press flex items-center justify-center gap-1.5 rounded-md border py-1.5 text-[11.5px] font-semibold ${
                    !p.smoothOn ? "border-amber/60 bg-amber/15 text-amber" : "border-line bg-ink-800 text-mist hover:text-paper"
                  }`}
                >
                  <IconCube size={13} /> Voxel
                </button>
                <button
                  onClick={() => p.onSmoothMode(true)}
                  className={`btn-press flex items-center justify-center gap-1.5 rounded-md border py-1.5 text-[11.5px] font-semibold ${
                    p.smoothOn ? "border-mint/60 bg-mint/15 text-mint" : "border-line bg-ink-800 text-mist hover:text-paper"
                  }`}
                >
                  <IconSmooth size={13} /> Pürüzsüz
                </button>
              </div>
              <div className="mt-2 flex items-center gap-1.5">
                <span className="font-mono text-[9.5px] tracking-[0.12em] text-faint">YUMUŞATMA</span>
                <button
                  onClick={() => p.onSmoothIters(p.smoothIters - 1)}
                  disabled={p.smoothIters <= 0}
                  className="btn-press rounded border border-line px-2 py-0.5 text-faint hover:text-paper disabled:opacity-30"
                >
                  −
                </button>
                <span className="w-4 text-center font-mono text-[11px] text-paper">{p.smoothIters}</span>
                <button
                  onClick={() => p.onSmoothIters(p.smoothIters + 1)}
                  disabled={p.smoothIters >= 10}
                  className="btn-press rounded border border-line px-2 py-0.5 text-faint hover:text-paper disabled:opacity-30"
                >
                  +
                </button>
                <span className="ml-auto font-mono text-[8.5px] text-faint">M</span>
              </div>
              <p className="mt-1.5 text-[10px] leading-snug text-faint">
                0 = elmas zarf (ham) · artırdıkça organikleşir: tek küp → küre, bitişik küpler → tek parça.
                Baskı her zaman hassas voxel STL&rsquo;den çıkar.
              </p>
            </div>

            <button
              onClick={p.onExportStl}
              disabled={s.count === 0}
              className="btn-press mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-mint py-2.5 font-display text-[13px] font-bold tracking-wide text-ink-950 shadow-[0_8px_24px_rgba(63,214,182,0.25)] hover:brightness-110 disabled:opacity-35 disabled:shadow-none"
            >
              <IconPrinter size={15} /> STL İNDİR
            </button>
            <div className="mt-1.5 grid grid-cols-2 gap-1.5">
              <button
                onClick={() => p.onAutoRotate(!p.autoRotate)}
                className={`btn-press flex items-center justify-center gap-1.5 rounded-lg border py-2 text-[11.5px] font-medium ${
                  p.autoRotate ? "border-mint/50 bg-mint/10 text-mint" : "border-line bg-ink-800 text-mist hover:text-paper"
                }`}
              >
                <IconRotate size={13} className={p.autoRotate ? "anim-spin-slow" : ""} /> Döner
              </button>
              <button
                onClick={p.onBedToggle}
                className={`btn-press flex items-center justify-center gap-1.5 rounded-lg border py-2 text-[11.5px] font-medium ${
                  p.bedOn ? "border-amber/50 bg-amber/10 text-amber" : "border-line bg-ink-800 text-mist hover:text-paper"
                }`}
              >
                <IconGrid size={13} /> Tabla
              </button>
            </div>
          </>
        )}
      </div>

    </aside>
  );
}

/* ================= SHORTCUTS ================= */

const GROUPS: { title: string; rows: [string, string][] }[] = [
  {
    title: "ARAÇLAR",
    rows: [
      ["B", "Boya"], ["E", "Sil"], ["F", "Kova (bölge doldur)"], ["P", "Pipet"],
      ["R", "Dikdörtgen"], ["C", "Daire"], ["S", "Damga"], ["A", "Seçim (taşı / kopyala)"],
      ["L", "Çetvel (mesafe ölç)"], ["1–9, 0", "Palet rengi seç"],
    ],
  },
  {
    title: "DÜZLEM & KATMAN",
    rows: [
      ["W / PageUp", "Üst dilim"], ["Q / PageDown", "Alt dilim"],
      ["X", "Dikey simetri"], ["Y", "Yatay simetri"],
      ["Esc", "Seçimi / çetvel ölçümünü temizle"], ["Alt + sürükle", "Seçimi kopyala"],
    ],
  },
  {
    title: "GÖRÜNÜM",
    rows: [
      ["V", "3D önizleme aç/kapa"], ["Çift tık (önizleme)", "Tam 3D moda geç"],
      ["M", "Pürüzsüz yüzey (3D)"], ["Sağ tık / Boşluk", "Kaydır"], ["Tekerlek", "Yakınlaş"],
    ],
  },
  {
    title: "GENEL",
    rows: [
      ["Ctrl + Z", "Geri al"], ["Ctrl + Y", "Yinele"], ["?", "Bu kart"],
    ],
  },
];

export function ShortcutsModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="anim-fade fixed inset-0 z-[60] flex items-center justify-center bg-ink-950/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="anim-rise w-full max-w-2xl rounded-2xl border border-line bg-ink-900 shadow-[0_30px_80px_rgba(0,0,0,0.6)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line-soft px-6 py-4">
          <div className="flex items-center gap-2.5">
            <IconKeyboard size={18} className="text-amber" />
            <span className="font-display text-[16px] font-bold text-paper">Klavye Kısayolları</span>
          </div>
          <button onClick={onClose} className="btn-press rounded-lg border border-line p-1.5 text-faint hover:text-paper">
            <IconX size={15} />
          </button>
        </div>
        <div className="grid grid-cols-1 gap-6 p-6 sm:grid-cols-2">
          {GROUPS.map((g) => (
            <div key={g.title}>
              <div className="mb-2.5 font-mono text-[10px] tracking-[0.24em] text-amber">{g.title}</div>
              <ul className="space-y-1.5">
                {g.rows.map(([k, desc]) => (
                  <li key={k} className="flex items-center justify-between gap-3 text-[12.5px]">
                    <span className="text-mist">{desc}</span>
                    <kbd className="rounded-md border border-line bg-ink-800 px-2 py-0.5 text-[11px] text-paper">{k}</kbd>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
