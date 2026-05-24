export const CHART_ASIDE_STACK_HEIGHT_STORAGE_KEY = "workbench.chart.asideDiagnosticsHeightPx";

export const DEFAULT_CHART_ASIDE_STACK_DIAGNOSTICS_HEIGHT = 320;
export const MIN_CHART_ASIDE_STACK_DIAGNOSTICS_HEIGHT = 120;
export const MIN_CHART_ASIDE_STACK_INSPECTOR_HEIGHT = 160;
export const CHART_ASIDE_STACK_SPLIT_HANDLE_HEIGHT = 8;

export function readStoredDiagnosticsHeight(): number {
  try {
    const raw = localStorage.getItem(CHART_ASIDE_STACK_HEIGHT_STORAGE_KEY);
    if (!raw) return DEFAULT_CHART_ASIDE_STACK_DIAGNOSTICS_HEIGHT;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return DEFAULT_CHART_ASIDE_STACK_DIAGNOSTICS_HEIGHT;
    return parsed;
  } catch {
    return DEFAULT_CHART_ASIDE_STACK_DIAGNOSTICS_HEIGHT;
  }
}

export function clampDiagnosticsHeight(height: number, containerHeight: number): number {
  const maxDiagnostics = Math.max(
    MIN_CHART_ASIDE_STACK_DIAGNOSTICS_HEIGHT,
    containerHeight -
      MIN_CHART_ASIDE_STACK_INSPECTOR_HEIGHT -
      CHART_ASIDE_STACK_SPLIT_HANDLE_HEIGHT,
  );
  return Math.min(
    maxDiagnostics,
    Math.max(MIN_CHART_ASIDE_STACK_DIAGNOSTICS_HEIGHT, Math.round(height)),
  );
}

export function persistDiagnosticsHeight(height: number): void {
  try {
    localStorage.setItem(CHART_ASIDE_STACK_HEIGHT_STORAGE_KEY, String(height));
  } catch {
    /* ignore quota / private mode */
  }
}
