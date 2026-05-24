export const CHART_ASIDE_WIDTH_STORAGE_KEY = "workbench.chart.asideWidthPx";

export const DEFAULT_CHART_ASIDE_WIDTH = 360;
export const MIN_CHART_ASIDE_WIDTH = 260;
export const MIN_CHART_MAIN_WIDTH = 320;
export const CHART_SPLIT_HANDLE_WIDTH = 8;

export function readStoredAsideWidth(): number {
  try {
    const raw = localStorage.getItem(CHART_ASIDE_WIDTH_STORAGE_KEY);
    if (!raw) return DEFAULT_CHART_ASIDE_WIDTH;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return DEFAULT_CHART_ASIDE_WIDTH;
    return parsed;
  } catch {
    return DEFAULT_CHART_ASIDE_WIDTH;
  }
}

export function clampAsideWidth(width: number, containerWidth: number): number {
  const maxAside = Math.max(
    MIN_CHART_ASIDE_WIDTH,
    containerWidth - MIN_CHART_MAIN_WIDTH - CHART_SPLIT_HANDLE_WIDTH,
  );
  return Math.min(maxAside, Math.max(MIN_CHART_ASIDE_WIDTH, Math.round(width)));
}

export function persistAsideWidth(width: number): void {
  try {
    localStorage.setItem(CHART_ASIDE_WIDTH_STORAGE_KEY, String(width));
  } catch {
    /* ignore quota / private mode */
  }
}
