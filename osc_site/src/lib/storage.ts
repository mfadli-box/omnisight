export const storage = {
  get<T>(key: string, fallback: T): T {
    if (typeof window === "undefined") return fallback;
    try {
      const item = localStorage.getItem(key);
      return item ? (JSON.parse(item) as T) : fallback;
    } catch {
      return fallback;
    }
  },

  set<T>(key: string, value: T): void {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // quota exceeded
    }
  },

  remove(key: string): void {
    if (typeof window === "undefined") return;
    localStorage.removeItem(key);
  },

  has(key: string): boolean {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(key) !== null;
  },

  clear(): void {
    if (typeof window === "undefined") return;
    localStorage.clear();
  },
};

export async function getPreference<T extends string>(
  key: string,
  validValues: readonly T[],
  defaultValue: T,
): Promise<T> {
  if (typeof window === "undefined") return defaultValue;
  try {
    const item = localStorage.getItem(key);
    if (item && validValues.includes(item as T)) {
      return item as T;
    }
  } catch {
    // ignore
  }
  return defaultValue;
}
