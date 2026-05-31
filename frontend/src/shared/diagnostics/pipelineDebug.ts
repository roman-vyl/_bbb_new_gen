/** Opt-in Workbench pipeline timings. Enable with VITE_EMA_PIPELINE_DEBUG=true. */

type Row = { count: number; totalMs: number; maxMs: number };

type MetaFactory = () => Record<string, unknown>;

const stats = new Map<string, Row>();

let shiftFlushTimer: ReturnType<typeof setTimeout> | null = null;

/** Stable step ids (design D3). */
export const PIPELINE_DEBUG_STEPS = {
  load: {
    reportReady: "wb.load.report_ready",
    marketBundleReady: "wb.load.market_bundle_ready",
    renderWindowInit: "wb.render_window.init",
  },
  renderWindow: {
    tradeSelect: "wb.render_window.trade_select",
    shift: "wb.render_window.shift",
  },
  pan: {
    suppressedProgrammatic: "wb.pan.suppressed_programmatic",
    noShift: "wb.pan.no_shift",
    shiftRequested: "wb.pan.shift_requested",
  },
  chartWindow: {
    slice: "wb.chart_window_slice",
  },
  traceDisplay: {
    cacheHit: "wb.trace_display.cache_hit",
    cacheMiss: "wb.trace_display.cache_miss",
    mergeChunk: "wb.trace_display.merge_chunk",
    sliceEvents: "wb.trace_display.slice_events",
    sliceHtf: "wb.trace_display.slice_htf",
  },
  chart: {
    setDataCandles: "chart.setData.candles",
    setDataAnchorEma: "chart.setData.anchor_ema",
    setDataAuxHtf: "chart.setData.aux_htf",
    markersRebuild: "chart.markers.rebuild",
    viewportApply: "chart.viewport.apply",
    viewportRestoreAfterShift: "chart.viewport.restore_after_shift",
  },
} as const;

export type PipelineDebugExportRow = {
  step: string;
  count: number;
  total_ms: number;
  max_ms: number;
  avg_ms: number;
};

export function pipelineDebugEnabled(): boolean {
  return import.meta.env.VITE_EMA_PIPELINE_DEBUG === "true";
}

function resolveMeta(meta?: Record<string, unknown> | MetaFactory): Record<string, unknown> {
  if (meta === undefined) {
    return {};
  }
  return typeof meta === "function" ? meta() : meta;
}

function recordTimed(step: string, ms: number, meta: Record<string, unknown>): void {
  const row = stats.get(step) ?? { count: 0, totalMs: 0, maxMs: 0 };
  row.count += 1;
  row.totalMs += ms;
  row.maxMs = Math.max(row.maxMs, ms);
  stats.set(step, row);
  console.debug("[pipeline]", step, { count: row.count, ms: ms.toFixed(1), ...meta });
}

export function dbgMark(step: string, meta?: Record<string, unknown>): void {
  if (!pipelineDebugEnabled()) return;
  const row = stats.get(step) ?? { count: 0, totalMs: 0, maxMs: 0 };
  row.count += 1;
  stats.set(step, row);
  console.debug("[pipeline]", step, { count: row.count, ...meta });
}

export function dbgTimedSync<T>(
  step: string,
  fn: () => T,
  meta?: MetaFactory,
): T {
  if (!pipelineDebugEnabled()) {
    return fn();
  }
  const t0 = performance.now();
  try {
    return fn();
  } finally {
    const ms = performance.now() - t0;
    recordTimed(step, ms, meta !== undefined ? meta() : {});
  }
}

export async function dbgTimed<T>(
  step: string,
  fn: () => Promise<T>,
  meta?: Record<string, unknown> | MetaFactory,
): Promise<T> {
  if (!pipelineDebugEnabled()) {
    return fn();
  }
  const t0 = performance.now();
  try {
    return await fn();
  } finally {
    const ms = performance.now() - t0;
    recordTimed(step, ms, resolveMeta(meta));
  }
}

export function dbgExport(): PipelineDebugExportRow[] {
  return [...stats.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([step, row]) => ({
      step,
      count: row.count,
      total_ms: Number(row.totalMs.toFixed(1)),
      max_ms: Number(row.maxMs.toFixed(1)),
      avg_ms: row.count > 0 ? Number((row.totalMs / row.count).toFixed(1)) : 0,
    }));
}

export function dbgReset(): void {
  stats.clear();
}

export function dbgFlush(label = "workbench"): void {
  if (!pipelineDebugEnabled()) return;
  const rows = dbgExport();
  console.group(`=== PIPELINE_DEBUG [${label}] ===`);
  console.table(
    rows.map((row) => ({
      step: row.count > 1 ? `REPEAT ${row.step}` : row.step,
      count: row.count,
      total_ms: row.total_ms,
      avg_ms: row.avg_ms,
      max_ms: row.max_ms,
    })),
  );
  console.groupEnd();
}

/** Debounced flush after render-window shift (debug only). */
export function dbgScheduleShiftFlush(debounceMs = 1200): void {
  if (!pipelineDebugEnabled() || typeof window === "undefined") return;
  if (shiftFlushTimer !== null) {
    clearTimeout(shiftFlushTimer);
  }
  shiftFlushTimer = setTimeout(() => {
    shiftFlushTimer = null;
    dbgFlush("after-render-window-shift");
  }, debounceMs);
}

type PipelineDebugWindow = {
  __pipelineDebugFlush?: (label?: string) => void;
  __pipelineDebugExport?: () => PipelineDebugExportRow[];
  __pipelineDebugReset?: () => void;
};

if (pipelineDebugEnabled() && typeof window !== "undefined") {
  const w = window as unknown as PipelineDebugWindow;
  w.__pipelineDebugFlush = dbgFlush;
  w.__pipelineDebugExport = dbgExport;
  w.__pipelineDebugReset = dbgReset;
}
