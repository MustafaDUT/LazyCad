import { useMemo, useState } from "react";
import { type ProjectMeta } from "../lib/store";
import { PALETTE } from "../lib/model";
import LazyCat from "./LazyCat";
import { APP_VERSION } from "../lib/version";
import { templatePreview, templateStats, type Template } from "../lib/templates";
import {
  LogoMark,
  IconPlus,
  IconCube,
  IconCopy,
  IconTrash,
  IconLayers,
  IconArrowRight,
  IconClock,
  IconWarn,
  IconUser,
  IconStamp,
} from "./icons";

interface Props {
  userName: string;
  projects: ProjectMeta[];
  templates: Template[];
  onTemplate: (t: Template) => void;
  onOpen: (id: string) => void;
  onNew: () => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("tr-TR", { day: "numeric", month: "short" }) +
    " · " +
    d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
}

/** Mini piksel önizleme: proje adından deterministik desen — her kartın kimliği olsun. */
function Thumb({ seed, count }: { seed: string; count: number }) {
  const cells = useMemo(() => {
    let h = 2166136261;
    for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619) >>> 0;
    const rnd = () => {
      h = (Math.imul(h, 1103515245) + 12345) >>> 0;
      return h / 4294967296;
    };
    const palette = ["#ff8a3d", "#ffb454", "#3fd6b6", "#5aa9ff", "#9d7bff", "#8ac926"];
    const out: (string | null)[] = [];
    const filled = Math.min(20, Math.max(4, Math.round(count / 3) + 4));
    for (let i = 0; i < 36; i++) out.push(null);
    // ortadan başlayan damla biçimli küme
    const cx = 2 + Math.floor(rnd() * 2);
    const cy = 2 + Math.floor(rnd() * 2);
    const stack: [number, number][] = [[cx, cy]];
    let placed = 0;
    while (stack.length && placed < filled) {
      const [x, y] = stack.pop()!;
      const id = y * 6 + x;
      if (x < 0 || x > 5 || y < 0 || y > 5 || out[id]) continue;
      out[id] = palette[Math.floor(rnd() * palette.length)];
      placed++;
      if (rnd() > 0.25) stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
    return out;
  }, [seed, count]);

  return (
    <div className="relative flex h-[104px] w-full items-center justify-center overflow-hidden rounded-lg border border-line-soft bg-ink-950/70">
      {/* ızgara dokusu — önizleme bandına derinlik */}
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          backgroundImage:
            "linear-gradient(rgba(96,126,170,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(96,126,170,0.07) 1px, transparent 1px)",
          backgroundSize: "14px 14px",
        }}
      />
      <div className="grid h-[82px] w-[82px] grid-cols-6 grid-rows-6 gap-[3px] transition-transform duration-300 group-hover:scale-[1.07] group-hover:rotate-[1.5deg]">
        {cells.map((c, i) => (
          <div
            key={i}
            className="rounded-[2px]"
            style={{
              background: c ?? "rgba(38,51,74,0.4)",
              boxShadow: c ? "0 2px 6px rgba(0,0,0,0.35)" : "none",
            }}
          />
        ))}
      </div>
      <span className="absolute bottom-1 right-1.5 font-mono text-[8px] tracking-[0.18em] text-faint">
        {count > 0 ? `${count} KP` : "BOŞ"}
      </span>
    </div>
  );
}

/** Şablon kartı önizlemesi — kuşbakışı projeksiyon, üst katman kazanır. */
function TemplateThumb({ t, cellPx = 10 }: { t: Template; cellPx?: number }) {
  const view = useMemo(() => templatePreview(t), [t]);
  const map = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of view.cells) m.set(`${c.i},${c.j}`, c.c);
    return m;
  }, [view]);
  return (
    <div className="blueprint-bg relative flex items-center justify-center overflow-hidden rounded-lg border border-line-soft bg-ink-950/80 py-4">
      <div
        className="grid transition-transform duration-300 group-hover:rotate-[1.5deg] group-hover:scale-[1.06]"
        style={{
          gridTemplateColumns: `repeat(${view.w}, ${cellPx}px)`,
          gridAutoRows: `${cellPx}px`,
          gap: 1,
        }}
      >
        {Array.from({ length: view.w * view.h }).map((_, idx) => {
          const i = (idx % view.w) + view.minI;
          const j = view.h - 1 - Math.floor(idx / view.w) + view.minJ;
          const c = map.get(`${i},${j}`);
          return (
            <div
              key={idx}
              className="rounded-[1.5px]"
              style={{
                background: c !== undefined ? PALETTE[c]?.hex ?? "#888" : "rgba(38,51,74,0.22)",
                boxShadow: c !== undefined ? "0 2px 5px rgba(0,0,0,0.45)" : "none",
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

export default function HomeScreen(p: Props) {
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const totals = useMemo(() => {
    let kp = 0;
    let layers = 0;
    for (const pr of p.projects) {
      kp += pr.count;
      layers = Math.max(layers, pr.layers);
    }
    return { kp, layers };
  }, [p.projects]);

  return (
    <div className="flex h-full flex-col bg-ink-950">
      {/* üst bar */}
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line-soft bg-ink-900/95 px-4 md:px-6">
        <LogoMark size={28} />
        <div className="leading-none">
          <div className="font-display text-[15px] font-bold tracking-[0.06em] text-paper">LAZY CAD</div>
          <div className="mt-0.5 font-mono text-[9px] tracking-[0.22em] text-faint">PROJELERİM</div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="hidden rounded-lg border border-line bg-ink-800 px-2 py-1.5 font-mono text-[10px] text-faint md:block" title="Sürüm">
            v{APP_VERSION}
          </span>
          <span className="hidden items-center gap-2 rounded-lg border border-line bg-ink-800 px-3 py-1.5 sm:flex">
            <span className="text-faint">
              <IconUser size={14} />
            </span>
            <span className="text-[13px] font-medium text-paper">{p.userName}</span>
          </span>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl px-4 py-8 md:px-6">
          {/* karşılama */}
          <div className="anim-rise flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="font-mono text-[11px] tracking-[0.22em] text-amber">VOXEL TASLAK STÜDYOSU</div>
              <h1 className="mt-2 font-display text-[32px] font-bold tracking-tight text-paper md:text-[38px]">
                Merhaba, <span className="text-amber">{p.userName}</span>
              </h1>
              <p className="mt-1.5 text-[14px] text-mist">
                {p.projects.length > 0
                  ? "Kaldığın yerden devam et ya da yepyeni bir model kur."
                  : "İlk modelini kur — boş ızgara seni bekliyor."}
              </p>
            </div>
            <button
              onClick={p.onNew}
              className="btn-press flex items-center gap-2 rounded-lg bg-amber px-5 py-3 font-display text-[14px] font-bold tracking-wide text-ink-950 shadow-[0_10px_28px_rgba(255,180,84,0.25)] hover:bg-[#ffc477]"
            >
              <IconPlus size={16} />
              YENİ PROJE
            </button>
          </div>

          {/* maskot bandı — tembel kedi iş başında */}
          <section
            className="anim-rise relative mt-6 overflow-hidden rounded-xl border border-line bg-ink-900/80"
            style={{ animationDelay: "0.05s" }}
          >
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "radial-gradient(55% 130% at 10% 50%, rgba(249,115,22,0.09), transparent 55%), radial-gradient(45% 130% at 92% 35%, rgba(63,214,182,0.07), transparent 60%)",
              }}
            />
            <div className="relative flex items-center gap-4 px-4 py-3 md:gap-6 md:px-6">
              <LazyCat className="h-24 w-auto shrink-0 select-none md:h-[124px]" />
              <div className="min-w-0 border-l border-line-soft pl-4 md:pl-6">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-display text-[21px] font-bold tracking-tight text-paper">Lazy CAD</span>
                  <span className="rounded-full border border-amber/40 bg-amber/10 px-2 py-0.5 font-mono text-[8.5px] tracking-[0.16em] text-amber">
                    TEMBEL KEDİ VOXEL STÜDYOSU
                  </span>
                </div>
                <p className="mt-1 text-[13px] leading-snug text-mist">
                  Boya, bas, tembellik et — <span className="text-amber">kare prizmalar</span> senin yerine çalışsın.
                </p>
                <p className="mt-1 hidden font-mono text-[10px] text-faint sm:block">
                  2D ızgara → 3B nesne → STL · CAD öğrenmek yok
                </p>
              </div>
              <div className="ml-auto hidden shrink-0 flex-col items-end gap-1.5 font-mono text-[10px] text-faint lg:flex">
                <span className="flex items-center gap-1.5">
                  <span className="anim-pulse-dot h-1.5 w-1.5 rounded-full bg-mint" />
                  KÜPLER: ÇALIŞIYOR
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber" />
                  KEDİ: UYUYOR
                </span>
              </div>
            </div>
          </section>

          {/* istatistik şeridi */}
          <div className="anim-rise mt-7 flex flex-wrap items-stretch gap-px overflow-hidden rounded-xl border border-line bg-line-soft" style={{ animationDelay: "0.08s" }}>
            {[
              { v: String(p.projects.length), l: "PROJE", tone: "text-paper" },
              { v: totals.kp.toLocaleString("tr-TR"), l: "TOPLAM KP", tone: "text-amber" },
              { v: String(totals.layers), l: "EN YÜKSEK KATMAN", tone: "text-mint" },
            ].map((s) => (
              <div key={s.l} className="flex min-w-[140px] flex-1 flex-col justify-center bg-ink-900 px-5 py-4">
                <span className={`font-display text-[26px] font-bold leading-none ${s.tone}`}>{s.v}</span>
                <span className="mt-1.5 font-mono text-[9.5px] tracking-[0.22em] text-faint">{s.l}</span>
              </div>
            ))}
            <div className="hidden flex-1 flex-col justify-center bg-ink-900 px-5 py-4 md:flex">
              <span className="font-display text-[26px] font-bold leading-none text-paper">
                0.1<span className="text-[15px] text-faint">–</span>100
              </span>
              <span className="mt-1.5 font-mono text-[9.5px] tracking-[0.22em] text-faint">KP BOYUTU · MM</span>
            </div>
          </div>

          {/* hazır şablonlar — tek tıkla projeye dönüşen vitrin */}
          <div className="mt-9">
            <div className="mb-3.5 flex items-end justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-amber">
                    <IconStamp size={17} />
                  </span>
                  <h2 className="font-display text-[17px] font-bold tracking-wide text-paper">HAZIR ŞABLONLAR</h2>
                </div>
                <p className="mt-0.5 text-[12px] text-mist">
                  Boş ekrandan korkma — birini kur, üzerine inşa et ya da olduğu gibi bas.
                </p>
              </div>
              <span className="shrink-0 font-mono text-[10px] tracking-[0.18em] text-faint">
                {p.templates.length} ŞABLON · TEK TIK
              </span>
            </div>

            <div className="-mx-4 flex snap-x snap-mandatory gap-3.5 overflow-x-auto px-4 pb-2 md:-mx-6 md:px-6">
              {p.templates.map((t, i) => {
                const st = templateStats(t);
                return (
                  <button
                    key={t.id}
                    onClick={() => p.onTemplate(t)}
                    className={`anim-rise group relative w-[196px] shrink-0 snap-start overflow-hidden rounded-xl border bg-ink-900 p-3 text-left transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_18px_44px_rgba(0,0,0,0.5)] ${
                      t.featured
                        ? "border-amber/55 shadow-[0_0_0_1px_rgba(255,180,84,0.15)] hover:border-amber"
                        : "border-line hover:border-mint/50"
                    }`}
                    style={{ animationDelay: `${0.04 * i}s` }}
                  >
                    {t.featured && (
                      <span className="absolute right-0 top-3 z-10 rounded-l-md bg-amber px-2 py-0.5 font-mono text-[8.5px] font-semibold tracking-[0.14em] text-ink-950">
                        ÖRNEK
                      </span>
                    )}
                    <TemplateThumb t={t} cellPx={t.id === "hollow-cube" ? 10 : 11} />
                    <div className="mt-2.5 flex items-center justify-between gap-2">
                      <span className="truncate font-display text-[14px] font-semibold text-paper">{t.name}</span>
                      <span className="shrink-0 rounded border border-line bg-ink-800 px-1.5 py-0.5 font-mono text-[9px] tracking-wider text-mist">
                        {t.tag}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 min-h-[30px] text-[11px] leading-snug text-mist">{t.desc}</p>
                    <div className="mt-2 flex items-center gap-3 font-mono text-[10px] text-faint">
                      <span className="text-amber/90">{t.kp} mm</span>
                      <span className="flex items-center gap-1">
                        <IconLayers size={11} /> {st.layers} kat
                      </span>
                      <span className="flex items-center gap-1">
                        <IconCube size={11} /> {st.count} KP
                      </span>
                    </div>
                    <div
                      className={`mt-2.5 flex items-center justify-center gap-1.5 rounded-lg py-1.5 font-display text-[11.5px] font-bold tracking-[0.08em] transition-colors ${
                        t.featured
                          ? "bg-amber/15 text-amber group-hover:bg-amber group-hover:text-ink-950"
                          : "bg-mint/10 text-mint group-hover:bg-mint group-hover:text-ink-950"
                      }`}
                    >
                      KUR
                      <IconArrowRight size={12} />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* proje listesi */}
          {p.projects.length === 0 ? (
            <div className="anim-rise mt-10 flex flex-col items-center rounded-xl border border-dashed border-line bg-ink-900/50 px-6 py-16 text-center">
              <svg width="120" height="132" viewBox="0 0 120 132" className="anim-float opacity-90">
                <path d="M60 4 116 36.5V101L60 130 4 101V36.5Z" fill="none" stroke="#26334a" strokeWidth="2" strokeDasharray="6 7" />
                <path d="M60 4 116 36.5 60 69 4 36.5Z" fill="none" stroke="#ffb454" strokeWidth="2" opacity="0.7" />
                <path d="M60 69v61M4 36.5V101M116 36.5V101" stroke="#26334a" strokeWidth="1.4" />
              </svg>
              <div className="mt-6 font-display text-[19px] font-bold text-paper">Henüz projen yok</div>
              <p className="mt-2 max-w-sm text-[13.5px] leading-relaxed text-mist">
                Bir proje adı ver, KP boyutunu seç ve çizmeye başla. Her şey otomatik kaydedilir,
                istediğin zaman buradan devam edersin.
              </p>
              <button
                onClick={p.onNew}
                className="btn-press mt-6 flex items-center gap-2 rounded-lg bg-amber px-5 py-2.5 font-display text-[13.5px] font-bold tracking-wide text-ink-950 hover:bg-[#ffc477]"
              >
                <IconPlus size={15} />
                İLK MODELİNİ KUR
              </button>
            </div>
          ) : (
            <div className="mt-7 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {p.projects.map((pr, i) => (
                <div
                  key={pr.id}
                  className="anim-rise group relative flex flex-col overflow-hidden rounded-xl border border-line bg-ink-900 p-4 transition-all duration-200 hover:-translate-y-1 hover:border-amber/45 hover:shadow-[0_18px_44px_rgba(0,0,0,0.45)]"
                  style={{ animationDelay: `${0.05 * i}s` }}
                >
                  <Thumb seed={pr.id + pr.name} count={pr.count} />

                  <div className="mt-3.5 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-display text-[16px] font-semibold text-paper">{pr.name}</div>
                      <div className="mt-1 flex items-center gap-1.5 font-mono text-[10.5px] text-faint">
                        <IconClock size={12} />
                        {fmtDate(pr.updatedAt)}
                      </div>
                    </div>
                    <span className="shrink-0 rounded-md border border-amber/40 bg-amber/10 px-2 py-0.5 font-mono text-[10.5px] font-medium text-amber">
                      {pr.kpSizeMm} mm
                    </span>
                  </div>

                  <div className="mt-2.5 flex items-center gap-4 font-mono text-[11px] text-mist">
                    <span className="flex items-center gap-1.5">
                      <IconCube size={13} className="text-amber/80" />
                      {pr.count.toLocaleString("tr-TR")} KP
                    </span>
                    <span className="flex items-center gap-1.5">
                      <IconLayers size={13} className="text-mint/80" />
                      {pr.layers} katman
                    </span>
                  </div>

                  <div className="mt-3.5 flex items-center gap-1.5 border-t border-line-soft pt-3.5">
                    <button
                      onClick={() => p.onOpen(pr.id)}
                      className="btn-press flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-amber/15 py-2 font-display text-[12.5px] font-bold tracking-wide text-amber transition-colors hover:bg-amber hover:text-ink-950"
                    >
                      AÇ
                      <IconArrowRight size={13} />
                    </button>
                    <button
                      onClick={() => p.onDuplicate(pr.id)}
                      title="Kopyala"
                      className="btn-press rounded-lg border border-line p-2 text-mist hover:border-mint/50 hover:text-mint"
                    >
                      <IconCopy size={14} />
                    </button>
                    {confirmId === pr.id ? (
                      <span className="anim-fade flex items-center gap-1">
                        <button
                          onClick={() => {
                            setConfirmId(null);
                            p.onDelete(pr.id);
                          }}
                          title="Evet, sil"
                          className="btn-press rounded-lg bg-coral p-2 text-ink-950 hover:brightness-110"
                        >
                          <IconTrash size={14} />
                        </button>
                        <button
                          onClick={() => setConfirmId(null)}
                          title="Vazgeç"
                          className="btn-press rounded-lg border border-line p-2 text-mist hover:text-paper"
                        >
                          <IconWarn size={14} />
                        </button>
                      </span>
                    ) : (
                      <button
                        onClick={() => setConfirmId(pr.id)}
                        title="Sil"
                        className="btn-press rounded-lg border border-line p-2 text-mist hover:border-coral/50 hover:text-coral"
                      >
                        <IconTrash size={14} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-10 flex items-center gap-3 pb-6 text-faint">
            <div className="h-px flex-1 bg-line-soft" />
            <span className="font-mono text-[10px] tracking-[0.22em]">
              VERİLER BU CİHAZDA · {p.projects.length} PROJE
            </span>
            <div className="h-px flex-1 bg-line-soft" />
          </div>
        </div>
      </main>
    </div>
  );
}
