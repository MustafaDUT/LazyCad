import { useState } from "react";
import { PALETTE } from "../lib/model";
import { LogoMark, IconCheck, IconChevronLeft } from "./icons";

interface Props {
  user: string;
  onStart: (name: string, kpSizeMm: number) => void;
  onBack: () => void;
}

const KP_PRESETS = [1, 2.5, 5, 10, 20, 50];

function CubeArt() {
  return (
    <div className="relative">
      <svg width="190" height="210" viewBox="0 0 120 132" className="anim-float drop-shadow-[0_24px_40px_rgba(0,0,0,0.45)]">
        <path d="M60 4 116 36.5V101L60 130 4 101V36.5Z" fill="#0d1420" />
        <path d="M60 4 116 36.5 60 69 4 36.5Z" fill="#ffb454" />
        <path d="M4 36.5 60 69v61L4 101Z" fill="#e07f33" />
        <path d="M116 36.5 60 69v61l56-29Z" fill="#9c5a22" />
        <g stroke="#101826" strokeWidth="0.9" opacity="0.38">
          <path d="M22.7 25.7 78.7 58.2" />
          <path d="M41.3 14.9 97.3 47.4" />
          <path d="M97.3 25.7 41.3 58.2" />
          <path d="M78.7 14.9 22.7 47.4" />
          <path d="M60 69v61" />
          <path d="M4 58.2l56 32.4 56-32.4" opacity="0.6" />
          <path d="M4 79.4l56 32.4 56-32.4" opacity="0.6" />
        </g>
      </svg>

      <div className="absolute -left-28 top-10 hidden sm:block">
        <div className="relative">
          <svg width="128" height="128" viewBox="0 0 128 128" className="absolute -inset-3">
            <rect
              x="2" y="2" width="124" height="124" rx="4"
              fill="none" stroke="#3fd6b6" strokeWidth="1.6" strokeDasharray="7 9"
              className="anim-ants"
            />
          </svg>
          <div className="grid grid-cols-4 gap-[5px] p-1">
            {[5, 1, 0, 3, 0, 4, 2, 0, 1, 0, 5, 4, 0, 3, 0, 1].map((c, idx) => (
              <div
                key={idx}
                className="h-6 w-6 rounded-[3px] border border-ink-950/60"
                style={{
                  background: c === 0 ? "rgba(38,51,74,0.5)" : PALETTE[c].hex,
                  boxShadow: c === 0 ? "none" : "0 4px 12px rgba(0,0,0,0.35)",
                  animation: `float-cube ${5 + (idx % 4)}s ease-in-out ${idx * 0.22}s infinite`,
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SetupScreen({ user, onStart, onBack }: Props) {
  const [name, setName] = useState("İlk Modelim");
  const [preset, setPreset] = useState<number | "custom">(10);
  const [custom, setCustom] = useState(12);
  const kp = preset === "custom" ? custom : preset;
  const volCm3 = kp ** 3 / 1000;

  return (
    <div className="flex h-full">
      <div className="blueprint-bg relative hidden flex-1 flex-col justify-between overflow-hidden p-10 md:flex">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(85% 70% at 30% 20%, rgba(52,74,110,0.35), transparent 60%), radial-gradient(60% 60% at 85% 85%, rgba(255,138,61,0.09), transparent 55%)",
          }}
        />
        <div
          className="pointer-events-none absolute left-0 right-0 h-24 opacity-[0.07]"
          style={{ background: "linear-gradient(180deg, transparent, #9dc0ff, transparent)", animation: "scan 9s linear infinite" }}
        />

        <div className="anim-rise relative">
          <div className="inline-flex items-center gap-2.5 rounded-full border border-line bg-ink-900/80 px-3.5 py-1.5">
            <span className="anim-pulse-dot h-2 w-2 rounded-full bg-mint" />
            <span className="font-mono text-[11px] tracking-[0.18em] text-mist">LAZY CAD · 2D/3D IZGARA MOTORU</span>
          </div>
          <h1 className="mt-7 max-w-xl font-display text-[44px] font-bold leading-[1.04] tracking-tight text-paper lg:text-[54px]">
            Kare prizmalarla çiz,
            <br />
            <span className="text-amber">hacim olarak bas.</span>
          </h1>
          <p className="mt-5 max-w-md text-[15px] leading-relaxed text-mist">
            Izgara sonsuz — motor yalnızca ekranındaki KP&rsquo;leri işler. XY&rsquo;de tabanını çiz, XZ/YZ
            düzlemlerinde dikine çık, 3B&rsquo;ye geçip STL olarak indir. CAD öğrenmek yok;
            kareleri renklendirmek var.
          </p>
        </div>

        <div className="anim-rise relative flex justify-center py-4" style={{ animationDelay: "0.15s" }}>
          <CubeArt />
        </div>

      </div>

      <div className="relative flex w-full items-center justify-center overflow-y-auto border-l border-line-soft bg-ink-950 p-6 md:w-[460px] md:shrink-0">
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{ background: "radial-gradient(70% 45% at 50% 0%, rgba(255,180,84,0.08), transparent 60%)" }}
        />
        <div className="anim-rise relative w-full max-w-sm py-8">
          <div className="mb-7 flex items-center gap-3">
            <LogoMark size={34} />
            <div>
              <div className="font-display text-lg font-bold tracking-wide text-paper">LAZY CAD</div>
              <div className="font-mono text-[10.5px] tracking-[0.2em] text-faint">TEMBEL KEDİ VOXEL STÜDYOSU</div>
            </div>
          </div>

          <button
            onClick={onBack}
            className="btn-press mb-5 flex items-center gap-1.5 rounded-lg border border-line bg-ink-900/70 px-3 py-1.5 font-mono text-[11px] tracking-wider text-mist hover:border-amber/40 hover:text-amber"
          >
            <IconChevronLeft size={13} />
            PROJELERİME DÖN
          </button>

          <div className="rounded-xl border border-line bg-ink-900/90 p-5 shadow-[0_20px_50px_rgba(0,0,0,0.35)]">
            <div className="mb-4 flex items-center justify-between">
              <span className="font-mono text-[10.5px] tracking-[0.24em] text-faint">YENİ MODEL</span>
              <span className="rounded-md border border-mint/35 bg-mint/[0.07] px-2 py-0.5 font-mono text-[10px] text-mint">
                {user}
              </span>
            </div>

            <label className="mb-1.5 block text-[13px] font-medium text-mist" htmlFor="pname">
              Proje adı
            </label>
            <input
              id="pname"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={48}
              className="w-full rounded-lg border border-line bg-ink-800 px-3.5 py-2.5 text-[15px] text-paper outline-none transition-colors placeholder:text-faint focus:border-amber/70"
              placeholder="örn. Roket Rozeti"
            />

            <div className="mt-5 mb-1.5 flex items-baseline justify-between">
              <span className="text-[13px] font-medium text-mist">KP boyutu</span>
              <span className="font-mono text-[11px] text-amber">
                {kp} × {kp} × {kp} mm
              </span>
            </div>
            <div className="grid grid-cols-6 gap-1.5">
              {KP_PRESETS.map((v) => (
                <button
                  key={v}
                  onClick={() => setPreset(v)}
                  className={`btn-press rounded-lg border py-2 font-mono text-[12.5px] ${
                    preset === v
                      ? "border-amber bg-amber/15 text-amber"
                      : "border-line bg-ink-800 text-mist hover:border-amber/40 hover:text-paper"
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
            <button
              onClick={() => setPreset("custom")}
              className={`btn-press mt-1.5 w-full rounded-lg border py-1.5 font-mono text-[11px] tracking-wider ${
                preset === "custom"
                  ? "border-amber bg-amber/15 text-amber"
                  : "border-line bg-ink-800 text-faint hover:text-mist"
              }`}
            >
              ÖZEL DEĞER (0.1 – 100 mm)
            </button>
            {preset === "custom" && (
              <div className="anim-fade mt-3">
                <input
                  type="range"
                  min={0.1}
                  max={100}
                  step={0.1}
                  value={custom}
                  onChange={(e) => setCustom(Number(e.target.value))}
                  className="w-full accent-[#ffb454]"
                />
                <div className="mt-1 flex justify-between font-mono text-[10.5px] text-faint">
                  <span>0.1 mm</span>
                  <span className="text-amber">{custom} mm</span>
                  <span>100 mm</span>
                </div>
              </div>
            )}

            <div className="mt-4 rounded-lg border border-line-soft bg-ink-950/70 px-3.5 py-2.5 font-mono text-[11.5px] leading-relaxed text-mist">
              <span className="text-paper">1 KP</span> = {kp} × {kp} × {kp} mm
              <span className="mx-2 text-faint">·</span>
              hacim <span className="text-amber">{volCm3.toLocaleString("tr-TR", { maximumFractionDigits: 3 })} cm³</span>
            </div>

            <button
              onClick={() => onStart(name.trim() || "İsimsiz Model", kp)}
              className="btn-press mt-5 w-full rounded-lg bg-amber py-3 font-display text-[15px] font-bold tracking-[0.08em] text-ink-950 shadow-[0_10px_30px_rgba(255,180,84,0.25)] hover:bg-[#ffc477]"
            >
              ATÖLYEYE GİR
            </button>
            <p className="mt-3 flex items-center justify-center gap-1.5 text-center font-mono text-[10.5px] text-faint">
              <IconCheck size={12} />
              sonsuz ızgara · yalnızca görünür KP&rsquo;ler render edilir
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
