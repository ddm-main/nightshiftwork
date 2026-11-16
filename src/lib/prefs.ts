export type Prefs = {
  hour12: boolean;
  seconds: boolean;
  timerReminderMin: number; // 0 = off
  wrapLeadMin: number;
  singleTimer: boolean;
};

export const DEFAULT_PREFS: Prefs = { hour12: true, seconds: false, timerReminderMin: 90, wrapLeadMin: 15, singleTimer: true };

const KEY = "ns-prefs";

export function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<Prefs>) } : DEFAULT_PREFS;
  } catch {
    return DEFAULT_PREFS;
  }
}

export function savePrefs(prefs: Prefs): void {
  try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* storage unavailable */ }
}
