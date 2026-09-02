/**
 * Lazy CAD maskotu — tembel kedi, işini küplere yaptıran.
 * Animasyonlu SVG doğrudan JSX olarak gömülüdür: dosya/MIME/sunucu bağımlılığı yok,
 * her ortamda (dev, build, önizleme) garantili çalışır.
 * Orijinal çizim dosyası: src/assets/mascots/lazy-cat.svg
 */
export default function LazyCat({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 800 600"
      role="img"
      aria-label="Lazy CAD maskotu: uyuyan tembel bir kedi, patisiyle havada voxel küp şekillendiriyor"
      className={className}
    >
      <defs>
        <radialGradient id="lazycat-glow" cx="50%" cy="45%" r="60%">
          <stop offset="0%" stopColor="#1b2536" />
          <stop offset="100%" stopColor="#101724" />
        </radialGradient>
      </defs>

      {/* zemin halkaları */}
      <circle cx="400" cy="300" r="228" fill="url(#lazycat-glow)" stroke="#26334a" strokeWidth="2" />
      <circle cx="400" cy="300" r="228" fill="none" stroke="#ffb454" strokeOpacity="0.14" strokeWidth="1.5" strokeDasharray="3 9" />

      {/* XYZ ızgarası */}
      <path d="M 250 420 L 400 490 L 550 420" stroke="#2e3d58" strokeWidth="3" strokeDasharray="6,6" fill="none" />
      <path d="M 400 270 L 400 490" stroke="#2e3d58" strokeWidth="2" strokeDasharray="6,6" />
      <path d="M 250 420 L 400 350 L 550 420" stroke="#24304a" strokeWidth="2" strokeDasharray="6,6" fill="none" />

      {/* kedinin tembelce ürettiği küpler */}
      <path d="M 330 410 L 380 435 L 380 485 L 330 460 Z" fill="#4f46e5" />
      <path d="M 380 435 L 430 410 L 430 460 L 380 485 Z" fill="#4338ca" />
      <path d="M 330 410 L 380 385 L 430 410 L 380 435 Z" fill="#6366f1" />

      <path d="M 430 410 L 480 435 L 480 485 L 430 460 Z" fill="#0ea5e9" />
      <path d="M 480 435 L 530 410 L 530 460 L 480 485 Z" fill="#0284c7" />
      <path d="M 430 410 L 480 385 L 530 410 L 480 435 Z" fill="#38bdf8" />

      {/* kuyruk — yavaş sallanır (CSS, .mascot-tail) */}
      <g className="mascot-tail">
        <path
          d="M 196 352 Q 142 372 150 322 Q 158 282 180 300"
          stroke="#f97316"
          strokeWidth="24"
          strokeLinecap="round"
          fill="none"
        />
      </g>

      {/* gövde + kafa */}
      <ellipse cx="280" cy="340" rx="90" ry="60" fill="#f97316" transform="rotate(-10, 280, 340)" />
      <circle cx="340" cy="280" r="55" fill="#f97316" />

      {/* kulaklar */}
      <polygon points="295,250 310,210 335,235" fill="#ea580c" />
      <polygon points="385,250 370,210 345,235" fill="#ea580c" />

      {/* uykulu gözler ^_^ */}
      <path d="M 310 280 Q 320 290 330 280" stroke="#7c2d12" strokeWidth="4" strokeLinecap="round" fill="none" />
      <path d="M 350 280 Q 360 290 370 280" stroke="#7c2d12" strokeWidth="4" strokeLinecap="round" fill="none" />

      {/* burun + ağız + bıyıklar */}
      <polygon points="337,292 343,292 340,296" fill="#f43f5e" />
      <path d="M 340 296 Q 336 302 330 301 M 340 296 Q 344 302 350 301" stroke="#7c2d12" strokeWidth="2.5" strokeLinecap="round" fill="none" />
      <path d="M 300 292 L 272 288 M 300 298 L 274 300 M 380 292 L 408 288 M 380 298 L 406 300" stroke="#c2610c" strokeWidth="2" strokeLinecap="round" opacity="0.7" />

      {/* uzanan pati — hafif pat-pat (CSS, .mascot-paw) */}
      <g className="mascot-paw">
        <path d="M 340 330 Q 390 310 430 295" stroke="#f97316" strokeWidth="22" strokeLinecap="round" fill="none" />
        <circle cx="430" cy="295" r="11" fill="#f5f0e8" />
      </g>

      {/* havadaki sihirli küp — pati şekillendiriyor (CSS, .mascot-cube) */}
      <g className="mascot-cube">
        <path d="M 440 310 L 485 332 L 485 377 L 440 355 Z" fill="#10b981" opacity="0.92" />
        <path d="M 485 332 L 530 310 L 530 355 L 485 377 Z" fill="#059669" opacity="0.92" />
        <path d="M 440 310 L 485 288 L 530 310 L 485 332 Z" fill="#34d399" opacity="0.92" />
        <circle cx="485" cy="270" r="4" fill="#a7f3d0" />
        <circle cx="550" cy="310" r="3" fill="#a7f3d0" />
        <circle cx="420" cy="330" r="3" fill="#a7f3d0" />
      </g>

      {/* parıltılar — sırayla kırpışır (CSS, .mascot-spark) */}
      <circle className="mascot-spark" cx="485" cy="262" r="4" fill="#a7f3d0" />
      <circle className="mascot-spark-2" cx="556" cy="306" r="3" fill="#a7f3d0" />
      <circle className="mascot-spark-3" cx="414" cy="334" r="3" fill="#a7f3d0" />

      {/* Zzz — tembellik buharı (CSS, .mascot-zzz) */}
      <text className="mascot-zzz" x="240" y="240" fontFamily="'Space Grotesk', Arial, sans-serif" fontSize="28" fontWeight="bold" fill="#8da0ba" transform="rotate(-15, 240, 240)">
        Z
      </text>
      <text className="mascot-zzz-2" x="208" y="208" fontFamily="'Space Grotesk', Arial, sans-serif" fontSize="36" fontWeight="bold" fill="#8da0ba" transform="rotate(-15, 208, 208)">
        Z
      </text>
      <text className="mascot-zzz-3" x="166" y="166" fontFamily="'Space Grotesk', Arial, sans-serif" fontSize="48" fontWeight="bold" fill="#8da0ba" transform="rotate(-15, 166, 166)">
        Z
      </text>
    </svg>
  );
}
