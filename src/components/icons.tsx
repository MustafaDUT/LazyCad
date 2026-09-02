interface P {
  size?: number;
  className?: string;
}

const base = (size = 18) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
});

export const LogoMark = ({ size = 28 }: P) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
    {/* kedi kulakları */}
    <polygon points="7.2,8.6 8.2,2.6 13.2,5.8" fill="#e07f33" />
    <polygon points="24.8,8.6 23.8,2.6 18.8,5.8" fill="#e07f33" />
    <path d="M16 2 29 9.5v15L16 32 3 24.5v-15L16 2Z" fill="#18202e" stroke="#26334a" strokeWidth="1.2" />
    <path d="M16 2 29 9.5 16 17 3 9.5 16 2Z" fill="#ffb454" />
    <path d="M3 9.5 16 17v15L3 24.5v-15Z" fill="#e07f33" />
    <path d="M29 9.5 16 17v15l13-7.5v-15Z" fill="#9c5a22" />
    <path d="M9.5 5.75 22.5 13.25M16 2v15" stroke="#101826" strokeWidth="0.8" opacity="0.5" />
  </svg>
);

export const IconGrid = ({ size, className }: P) => (
  <svg {...base(size)} className={className}>
    <rect x="3.5" y="3.5" width="17" height="17" rx="1" />
    <path d="M9.2 3.5v17M14.8 3.5v17M3.5 9.2h17M3.5 14.8h17" />
  </svg>
);

export const IconCube = ({ size, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M12 2.5 21 7.5v9L12 21.5 3 16.5v-9L12 2.5Z" />
    <path d="M3 7.5 12 12.5l9-5M12 12.5v9" />
  </svg>
);

export const IconUndo = ({ size, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M8 5 3.5 9.5 8 14" />
    <path d="M3.5 9.5H15a5.5 5.5 0 0 1 0 11H9" />
  </svg>
);

export const IconRedo = ({ size, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="m16 5 4.5 4.5L16 14" />
    <path d="M20.5 9.5H9a5.5 5.5 0 0 0 0 11h6" />
  </svg>
);

export const IconTrash = ({ size, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M4 6.5h16M9.5 6.5V4.8A1.3 1.3 0 0 1 10.8 3.5h2.4a1.3 1.3 0 0 1 1.3 1.3v1.7M6 6.5l1 13a1.5 1.5 0 0 0 1.5 1.4h7a1.5 1.5 0 0 0 1.5-1.4l1-13M10 10.5v6M14 10.5v6" />
  </svg>
);

export const IconExport = ({ size, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M12 15V3.5M7.5 8 12 3.5 16.5 8" />
    <path d="M4 15v4a1.5 1.5 0 0 0 1.5 1.5h13A1.5 1.5 0 0 0 20 19v-4" />
  </svg>
);

export const IconImport = ({ size, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M12 3.5V15M7.5 10.5 12 15l4.5-4.5" />
    <path d="M4 15v4a1.5 1.5 0 0 0 1.5 1.5h13A1.5 1.5 0 0 0 20 19v-4" />
  </svg>
);

export const IconFolder = ({ size, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M3.5 6.5A1.5 1.5 0 0 1 5 5h4.6l2 2.5H19a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 19 19.5H5A1.5 1.5 0 0 1 3.5 18Z" />
  </svg>
);

export const IconWarn = ({ size, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M12 3.5 22 20H2L12 3.5Z" />
    <path d="M12 9.5v5M12 17.2v.3" />
  </svg>
);

export const IconPrinter = ({ size, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M7 8V3.5h10V8M7 17H4.5A1.5 1.5 0 0 1 3 15.5v-6A1.5 1.5 0 0 1 4.5 8h15A1.5 1.5 0 0 1 21 9.5v6a1.5 1.5 0 0 1-1.5 1.5H17" />
    <rect x="7" y="14" width="10" height="6.5" rx="0.8" />
  </svg>
);

export const IconX = ({ size, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="m6 6 12 12M18 6 6 18" />
  </svg>
);

export const IconCheck = ({ size, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="m4.5 12.5 5 5L19.5 7" />
  </svg>
);

export const IconPaint = ({ size, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M19.5 4.5a2.1 2.1 0 0 0-3-3L6 12l4.9 4.9L21.5 6.4a2.1 2.1 0 0 0-2-1.9Z" transform="translate(0 1.5) scale(0.92)" />
    <path d="M9.5 16.5 7 19a2.5 2.5 0 0 1-3.5-3.5" />
  </svg>
);

export const IconEraser = ({ size, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="m9 20 -5.5-5.5a1.6 1.6 0 0 1 0-2.3L13 2.7a1.6 1.6 0 0 1 2.3 0l5 5a1.6 1.6 0 0 1 0 2.3L12 18.5" />
    <path d="M6.5 11.5 13 18M9 20h11" />
  </svg>
);

export const IconPick = ({ size, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="m13.5 10.5 7-7M18 3l3 3M2 22l4-1 12.5-12.5-3-3L3 18l-1 4Z" />
  </svg>
);

export const IconFit = ({ size, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M9 3.5H5A1.5 1.5 0 0 0 3.5 5v4M15 3.5h4A1.5 1.5 0 0 1 20.5 5v4M9 20.5H5A1.5 1.5 0 0 1 3.5 19v-4M15 20.5h4a1.5 1.5 0 0 0 1.5-1.5v-4" />
  </svg>
);

export const IconRotate = ({ size, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M20.5 12a8.5 8.5 0 1 1-2.5-6" />
    <path d="M20.5 2.5V6H17" />
  </svg>
);

export const IconEye = ({ size, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M2.5 12S6 5.8 12 5.8 21.5 12 21.5 12 18 18.2 12 18.2 2.5 12 2.5 12Z" />
    <circle cx="12" cy="12" r="2.6" />
  </svg>
);

export const IconCopy = ({ size, className }: P) => (
  <svg {...base(size)} className={className}>
    <rect x="8.5" y="8.5" width="12" height="12" rx="1.5" />
    <path d="M15.5 5.5v-.7A1.8 1.8 0 0 0 13.7 3H4.8A1.8 1.8 0 0 0 3 4.8v8.9a1.8 1.8 0 0 0 1.8 1.8h.7" />
  </svg>
);

export const IconPaste = ({ size, className }: P) => (
  <svg {...base(size)} className={className}>
    <rect x="5" y="5.5" width="14" height="15" rx="1.5" />
    <path d="M9 5.5V4.6A1.6 1.6 0 0 1 10.6 3h2.8A1.6 1.6 0 0 1 15 4.6v.9M9 12h6M9 15.5h4" />
  </svg>
);

export const IconTarget = ({ size, className }: P) => (
  <svg {...base(size)} className={className}>
    <circle cx="12" cy="12" r="7.5" />
    <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
    <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3" />
  </svg>
);

export const IconMirror = ({ size, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M12 3v18" strokeDasharray="2.6 2.2" />
    <path d="M8.5 7 4 12l4.5 5M15.5 7 20 12l-4.5 5" />
  </svg>
);

export const IconBucket = ({ size, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M4 11.5 12.2 3.3a1.4 1.4 0 0 1 2 0l4.5 4.5a1.4 1.4 0 0 1 0 2L12.5 16a2.2 2.2 0 0 1-3.1 0L4 10.6a.7.7 0 0 1 0-.9Z" />
    <path d="M19.8 16.2s1.9 2 1.9 3.4a1.9 1.9 0 1 1-3.8 0c0-1.4 1.9-3.4 1.9-3.4Z" fill="currentColor" stroke="none" opacity="0.85" />
    <path d="M3.5 20.5h10" />
  </svg>
);

export const IconRect = ({ size, className }: P) => (
  <svg {...base(size)} className={className}>
    <rect x="4" y="6" width="16" height="12" rx="0.5" />
  </svg>
);

export const IconCircle = ({ size, className }: P) => (
  <svg {...base(size)} className={className}>
    <circle cx="12" cy="12" r="8" strokeDasharray="3.4 2.6" />
    <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
  </svg>
);

export const IconStamp = ({ size, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M9.5 10.5c.9-1.2.4-2.6-.3-4a2.9 2.9 0 1 1 5.6 0c-.7 1.4-1.2 2.8-.3 4" />
    <path d="M6 14.5a1.6 1.6 0 0 1 1.6-1.6h8.8a1.6 1.6 0 0 1 1.6 1.6v2H6ZM4.5 20.5h15" />
  </svg>
);

export const IconSelect = ({ size, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M4 7V5.2A1.2 1.2 0 0 1 5.2 4H7M17 4h1.8A1.2 1.2 0 0 1 20 5.2V7M20 17v1.8a1.2 1.2 0 0 1-1.2 1.2H17M7 20H5.2A1.2 1.2 0 0 1 4 18.8V17" />
    <path d="M8 8h8v8H8Z" strokeDasharray="2.4 2" />
  </svg>
);

export const IconChevronLeft = ({ size, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M14.5 5.5 8 12l6.5 6.5" />
  </svg>
);

export const IconChevronRight = ({ size, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="m9.5 5.5 6.5 6.5-6.5 6.5" />
  </svg>
);

export const IconChevronUp = ({ size, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="m5.5 14.5 6.5-6.5 6.5 6.5" />
  </svg>
);

export const IconChevronDown = ({ size, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="m5.5 9.5 6.5 6.5 6.5-6.5" />
  </svg>
);

export const IconExpand = ({ size, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M9 3.5H3.5V9M15 3.5h5.5V9M9 20.5H3.5V15M15 20.5h5.5V15" />
  </svg>
);

export const IconKeyboard = ({ size, className }: P) => (
  <svg {...base(size)} className={className}>
    <rect x="2.5" y="6" width="19" height="12" rx="1.8" />
    <path d="M5.5 9.5h1M8.5 9.5h1M11.5 9.5h1M14.5 9.5h1M17.5 9.5h1M5.5 12.2h1M8.5 12.2h1M11.5 12.2h1M14.5 12.2h1M17.5 12.2h1M7.5 15h9" />
  </svg>
);

export const IconCamera = ({ size, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M3.5 8.5A1.5 1.5 0 0 1 5 7h2.4l1.4-2h6.4l1.4 2H19a1.5 1.5 0 0 1 1.5 1.5V18A1.5 1.5 0 0 1 19 19.5H5A1.5 1.5 0 0 1 3.5 18Z" />
    <circle cx="12" cy="13" r="3.4" />
  </svg>
);

export const IconUser = ({ size, className }: P) => (
  <svg {...base(size)} className={className}>
    <circle cx="12" cy="8" r="3.4" />
    <path d="M5 19.5c.8-3.4 3.6-5.3 7-5.3s6.2 1.9 7 5.3" />
  </svg>
);

export const IconLogout = ({ size, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M14 4.5H7A1.5 1.5 0 0 0 5.5 6v12A1.5 1.5 0 0 0 7 19.5h7" />
    <path d="M16 8.5 19.5 12 16 15.5M19 12h-9" />
  </svg>
);

export const IconArrowRight = ({ size, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M4.5 12h15M14 6.5l5.5 5.5-5.5 5.5" />
  </svg>
);

export const IconClock = ({ size, className }: P) => (
  <svg {...base(size)} className={className}>
    <circle cx="12" cy="12" r="8" />
    <path d="M12 7.5V12l3 2" />
  </svg>
);

export const IconSmooth = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M3.5 16.5c2.4-5 4.9-5 7.3 0s4.9 5 7.3 0" />
    <path d="M17 4l.85 1.9L19.8 6.8l-1.95.85L17 9.6l-.85-1.95L14.2 6.8l1.95-.9Z" fill="currentColor" stroke="none" />
  </svg>
);

export const IconSupport = ({ size, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M4 4h16" />
    <path d="M9.5 4v12.5M14.5 4v12.5" strokeDasharray="2.4 2.2" />
    <path d="M7 16.5h10V20H7Z" />
  </svg>
);

export const IconLayers = ({ size, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="m12 3 9 4.5-9 4.5-9-4.5L12 3Z" />
    <path d="m3 12.5 9 4.5 9-4.5M3 17l9 4.5 9-4.5" opacity="0.6" />
  </svg>
);

export const IconPlus = ({ size, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);
