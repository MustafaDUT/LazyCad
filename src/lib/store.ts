/* Tek kullanıcılı kalıcılık katmanı (localStorage).
   Tek tarayıcı modeli: hesap yok; projeler + çizimler bu tarayıcıda kalıcıdır. */

const K = {
  projects: "kp-atolye:projects",
  data: (id: string) => `kp-atolye:data:${id}`,
  legacyModel: "kp-atolye-v2:model",
  legacySession: "kp-atolye-v2:session",
};

export interface ProjectMeta {
  id: string;
  name: string;
  kpSizeMm: number;
  count: number;
  layers: number;
  updatedAt: string;
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* depolama dolu — sessiz geç */
  }
}

export function uid(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

/* ---------------- projeler ---------------- */

/** Depodaki tüm projeler (tek kullanıcı) — en yeni üstte. */
export function listProjects(): ProjectMeta[] {
  return read<ProjectMeta[]>(K.projects, []).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function saveProjectMeta(meta: ProjectMeta) {
  const all = read<ProjectMeta[]>(K.projects, []);
  const i = all.findIndex((p) => p.id === meta.id);
  if (i >= 0) all[i] = meta;
  else all.push(meta);
  write(K.projects, all);
}

export function deleteProject(id: string) {
  write(K.projects, read<ProjectMeta[]>(K.projects, []).filter((p) => p.id !== id));
  localStorage.removeItem(K.data(id));
}

export function duplicateProject(id: string): ProjectMeta | null {
  const src = read<ProjectMeta[]>(K.projects, []).find((p) => p.id === id);
  if (!src) return null;
  const copy: ProjectMeta = {
    id: uid(),
    name: `${src.name} (kopya)`,
    kpSizeMm: src.kpSizeMm,
    count: src.count,
    layers: src.layers,
    updatedAt: new Date().toISOString(),
  };
  const data = localStorage.getItem(K.data(id));
  if (data) localStorage.setItem(K.data(copy.id), data);
  write(K.projects, [...read<ProjectMeta[]>(K.projects, []), copy]);
  return copy;
}

/* ---------------- proje verisi ---------------- */

export function loadProjectData(id: string): string | null {
  try {
    return localStorage.getItem(K.data(id));
  } catch {
    return null;
  }
}

export function saveProjectData(id: string, json: string) {
  try {
    localStorage.setItem(K.data(id), json);
  } catch {
    /* dolu */
  }
}

/* ---------------- eski sürüm göçü ---------------- */

/** Tek-projeli eski sürümden kalan çizimi proje olarak taşır (varsa). */
export function migrateLegacy(): string | null {
  const raw = localStorage.getItem(K.legacyModel);
  if (!raw) return null;
  const id = uid();
  const now = new Date().toISOString();
  let name = "Eski Çizimim";
  let kp = 10;
  let count = 0;
  try {
    const m = JSON.parse(raw) as { name?: string; kpSizeMm?: number; cells?: unknown[] };
    if (m.name) name = m.name;
    if (typeof m.kpSizeMm === "number") kp = m.kpSizeMm;
    if (Array.isArray(m.cells)) count = m.cells.length;
  } catch {
    /* bozuksa da taşı */
  }
  saveProjectData(id, raw);
  saveProjectMeta({ id, name, kpSizeMm: kp, count, layers: 1, updatedAt: now });
  localStorage.removeItem(K.legacyModel);
  localStorage.removeItem(K.legacySession);
  return name;
}
