/**
 * Opt-in Workbench pipeline timings. Enable with VITE_EMA_PIPELINE_DEBUG=true.
 *
 * Layers:
 * 1. This module (dbgMark / dbgTimed / dbgTimedSync / dbgFlush / dbgExport / dbgReset) — no-op when flag off.
 * 2. Browser console — operator runs UI scenario, then __pipelineDebugFlush(label).
 * 3. Manual save — copy(__pipelineDebugExport()) into debug/reports/ (no auto file I/O).
 */

import { getCutoverDebugExportFields } from "@/features/workbenchChartRuntime/chartRuntimeCutoverTelemetry";
import type {
  ChartRuntimeCutoverPhase,
  ChartRuntimeDomainOwners,
} from "@/features/workbenchChartRuntime/runtimeTypes";

type Row = {
  count: number;
  totalMs: number;
  maxMs: number;
  lastMeta?: Record<string, unknown>;
};

type MetaFactory = () => Record<string, unknown>;

const stats = new Map<string, Row>();

let shiftFlushTimer: ReturnType<typeof setTimeout> | null = null;

/** Stable step ids (design D3). */
export const PIPELINE_DEBUG_STEPS = {
  load: {
    reportReady: "wb.load.report_ready",
    marketBundleReady: "wb.load.market_bundle_ready",
    marketFetchStart: "wb.market_fetch.start",
    marketFetchEnd: "wb.market_fetch.end",
    marketFetchCacheHit: "wb.market_fetch.cache_hit",
    marketFetchSkipInFlight: "wb.market_fetch.skip_in_flight",
    marketFetchAbort: "wb.market_fetch.abort_frontend",
    marketFetchStaleResponse: "wb.market_fetch.stale_response",
    chartHeavyIoBlocked: "wb.chart_heavy_io.blocked_until_activation",
    renderWindowInit: "wb.render_window.init",
  },
  renderWindow: {
    tradeSelect: "wb.render_window.trade_select",
    shiftApplied: "wb.render_window.shift_applied",
    shiftSettled: "wb.render_window.shift_settled",
    shiftAborted: "wb.render_window.shift_aborted",
    shiftRestoreCancelled: "wb.render_window.shift_restore_cancelled",
    shiftNoop: "wb.render_window.shift_noop",
  },
  pan: {
    suppressedProgrammatic: "wb.pan.suppressed_programmatic",
    noShift: "wb.pan.no_shift",
    shiftRequested: "wb.pan.shift_requested",
  },
  chartWindow: {
    slice: "wb.chart_window_slice",
    inputOverlayCount: "wb.render_window.input_overlay_count",
  },
  signalTrace: {
    bootstrapReady: "wb.signal_trace.bootstrap_ready",
    bootstrapBlocked: "wb.signal_trace.bootstrap_blocked",
    fetchStart: "wb.signal_trace.fetch_start",
    fetchEnd: "wb.signal_trace.fetch_end",
    fetchAbort: "wb.signal_trace.fetch_abort_frontend",
    fetchStaleResponse: "wb.signal_trace.fetch_stale_response",
    decision: "wb.signal_trace_decision",
  },
  traceDisplay: {
    cacheHit: "wb.trace_display.cache_hit",
    cacheMiss: "wb.trace_display.cache_miss",
    sessionHit: "wb.signal_trace.session_hit",
    applyCurrentWindow: "wb.trace_display.apply_current_window",
    mergeChunk: "wb.trace_display.merge_chunk",
    sliceEvents: "wb.trace_display.slice_events",
    sliceHtf: "wb.trace_display.slice_htf",
    fetchSuperseded: "wb.trace_display.fetch_superseded",
    coverage: "wb.trace_display.coverage",
  },
  auxOverlay: {
    applyCurrentWindow: "wb.aux_overlay.apply_current_window",
    slice: "wb.aux_overlay.slice",
    stale: "wb.aux_overlay.stale",
    merge: "wb.aux_overlay.merge",
  },
  chartEvents: {
    fetchFail: "wb.chart_events_fetch_fail",
    fallback: "wb.chart_events_fallback",
    merge: "wb.chart_events_merge",
  },
  market: {
    candlesDecision: "wb.market_candles_decision",
    emaDecision: "wb.market_ema_decision",
    panPrefetchDecision: "wb.market_pan_prefetch_decision",
    composeFocusFallback: "wb.market_compose_focus_fallback",
    bundleOverlayCount: "wb.market_bundle_overlay_count",
    overlayCacheDebug: "wb.market_overlay_cache_debug",
  },
  cutover: {
    domainOwners: "wb.cutover.domain_owners",
  },
  lanesTrace: {
    skip: "wb.lanes_trace_skip",
    useLoaded: "wb.lanes_trace_use_loaded",
    sessionRestore: "wb.lanes_trace_session_restore",
  },
  chart: {
    setDataCandles: "chart.setData.candles",
    setDataAnchorEma: "chart.setData.anchor_ema",
    setDataAuxHtf: "chart.setData.aux_htf",
    markersRebuild: "chart.markers.rebuild",
    viewportApply: "chart.viewport.apply",
    viewportApplyTradeFocus: "chart.viewport.apply_trade_focus",
    viewportApplySkippedUserPan: "chart.viewport.apply_skipped_user_pan",
    viewportApplySkippedNoFocusIntent: "chart.viewport.apply_skipped_no_focus_intent",
    viewportRestoreAfterShift: "chart.viewport.restore_after_shift",
    restoreByTimeAnchorFailed: "chart.viewport.restore_by_time_anchor_failed",
    restoreByTimeAnchorApplied: "chart.viewport.restore_by_time_anchor_applied",
    viewportRestoreAfterShiftSkippedStale: "chart.viewport.restore_after_shift_skipped_stale",
    viewportApplySkippedStaleRaf: "chart.viewport.apply_skipped_stale_raf",
    viewportApplySkippedPendingRestore: "chart.viewport.apply_skipped_pending_restore",
  },
} as const;

export type PipelineDebugExportRow = {
  step: string;
  count: number;
  total_ms: number;
  max_ms: number;
  avg_ms: number;
  last_meta?: Record<string, unknown>;
};

export type PipelineDebugExport = {
  steps: PipelineDebugExportRow[];
  debug: {
    cutoverPhase: ChartRuntimeCutoverPhase;
    domainOwners: ChartRuntimeDomainOwners;
  };
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

function touchRow(step: string): Row {
  const row = stats.get(step) ?? { count: 0, totalMs: 0, maxMs: 0 };
  stats.set(step, row);
  return row;
}

function recordTimed(step: string, ms: number, meta: Record<string, unknown>): void {
  const row = touchRow(step);
  row.count += 1;
  row.totalMs += ms;
  row.maxMs = Math.max(row.maxMs, ms);
  row.lastMeta = meta;
  console.debug("[pipeline]", step, { count: row.count, ms: ms.toFixed(1), ...meta });
}

export function dbgMark(step: string, meta?: Record<string, unknown>): void {
  if (!pipelineDebugEnabled()) return;
  const row = touchRow(step);
  row.count += 1;
  if (meta !== undefined) {
    row.lastMeta = meta;
  }
  console.debug("[pipeline]", step, { count: row.count, ...meta });
}

export function dbgTimedSync<T>(step: string, fn: () => T, meta?: MetaFactory): T {
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

export function dbgExport(): PipelineDebugExport {
  const steps = [...stats.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([step, row]) => ({
      step,
      count: row.count,
      total_ms: Number(row.totalMs.toFixed(1)),
      max_ms: Number(row.maxMs.toFixed(1)),
      avg_ms: row.count > 0 ? Number((row.totalMs / row.count).toFixed(1)) : 0,
      ...(row.lastMeta !== undefined ? { last_meta: row.lastMeta } : {}),
    }));

  return {
    steps,
    debug: getCutoverDebugExportFields(),
  };
}

export function dbgReset(): void {
  stats.clear();
}

export function dbgFlush(label = "workbench"): void {
  if (!pipelineDebugEnabled()) return;
  const { steps: rows } = dbgExport();
  console.group(`=== PIPELINE_DEBUG [${label}] ===`);
  console.table(
    rows.map((row) => ({
      step: row.count > 1 ? `REPEAT ${row.step}` : row.step,
      count: row.count,
      total_ms: row.total_ms,
      avg_ms: row.avg_ms,
      max_ms: row.max_ms,
      last_meta: row.last_meta ?? "",
    })),
  );
  console.groupEnd();
  console.info(
    "[pipeline debug] Сохранить: copy(JSON.stringify(__pipelineDebugExport(), null, 2)) → debug/reports/",
  );
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

const PIPELINE_DEBUG_FAQ_LINES = [
  "1. Сделайте сценарий в Workbench (Chart: run, trade, pan, дождаться events/HTF).",
  "2. Перед сценарием (опционально):  __pipelineDebugReset()",
  "3. Таблица таймингов:            __pipelineDebugFlush(\"имя-сценария\")",
  "   Примеры имён: cold-chart-open | tab-switch-chart | long-pan-boundary | distant-trade-navigation",
  "4. Сохранить JSON:               copy(JSON.stringify(__pipelineDebugExport(), null, 2))",
  "   Вставить в файл: debug/reports/workbench-<имя>.json",
  "5. Живые логи по ходу: фильтр консоли [pipeline]",
  "6. Эта справка снова:            __pipelineDebugHelp()",
] as const;

let consoleFaqShown = false;

/** Short FAQ in DevTools console (debug mode only). */
export function dbgPrintConsoleFaq(force = false): void {
  if (!pipelineDebugEnabled()) return;
  if (consoleFaqShown && !force) return;
  if (!force) {
    consoleFaqShown = true;
  }
  console.log(
    "%c[pipeline debug]%c VITE_EMA_PIPELINE_DEBUG — см. FAQ ниже (или __pipelineDebugHelp())",
    "font-weight:700;color:#a78bfa",
    "color:inherit",
  );
  console.groupCollapsed("[pipeline debug] FAQ — что нажать и что вводить в консоль");
  for (const line of PIPELINE_DEBUG_FAQ_LINES) {
    console.log(line);
  }
  console.groupEnd();
}

type PipelineDebugWindow = {
  __pipelineDebugFlush?: (label?: string) => void;
  __pipelineDebugExport?: () => PipelineDebugExport;
  __pipelineDebugReset?: () => void;
  __pipelineDebugHelp?: () => void;
};

if (pipelineDebugEnabled() && typeof window !== "undefined") {
  const w = window as unknown as PipelineDebugWindow;
  w.__pipelineDebugFlush = dbgFlush;
  w.__pipelineDebugExport = dbgExport;
  w.__pipelineDebugReset = dbgReset;
  w.__pipelineDebugHelp = () => dbgPrintConsoleFaq(true);
  dbgPrintConsoleFaq();
}
