import type { RunMarketView } from "@/features/chart/runMarketView";
import {
  composeDisplayMarketWindowBundle,
  resolveMarketBundleComposeWindow,
} from "@/features/chart/runMarketView";
import { hasOverlay, marketOverlayReady } from "@/features/chart/marketResourceCache";
import type { MarketDisplayWindowMs } from "@/features/chart/workbenchMarketLoad";

import { dbgMarkCutover } from "./chartRuntimeCutoverTelemetry";

/** Phase 6.3F regression diagnostics — temporary; remove after fixup review. */
export const PHASE_63F_DIAG_MARKET_BUNDLE_OVERLAY_COUNT = "wb.market_bundle_overlay_count";
export const PHASE_63F_DIAG_MARKET_OVERLAY_CACHE = "wb.market_overlay_cache_debug";
export const PHASE_63F_DIAG_RENDER_WINDOW_INPUT_OVERLAY = "wb.render_window.input_overlay_count";
export const PHASE_63F_DIAG_MODEL_ADAPTER_INPUT_OVERLAY = "wb.model_adapter.input_overlay_count";

export function emitMarketOverlayCacheDiagnostic(input: {
  view: RunMarketView;
  focusWindow: MarketDisplayWindowMs;
  coverageWindow: MarketDisplayWindowMs;
}): void {
  const { window: composeWindow, source } = resolveMarketBundleComposeWindow(
    input.view,
    input.focusWindow,
    input.coverageWindow,
  );
  const overlayRefs = input.view.overlayRefs.map((ref) => ({
    role: ref.role,
    period: ref.period,
    overlayKey: ref.key,
    composeCovers: marketOverlayReady(ref.key, composeWindow.fromMs, composeWindow.toMs),
    focusCovers: marketOverlayReady(ref.key, input.focusWindow.fromMs, input.focusWindow.toMs),
    coverageCovers: marketOverlayReady(
      ref.key,
      input.coverageWindow.fromMs,
      input.coverageWindow.toMs,
    ),
    hasOverlayAtCompose: hasOverlay(ref.key, composeWindow.fromMs, composeWindow.toMs),
  }));
  dbgMarkCutover(PHASE_63F_DIAG_MARKET_OVERLAY_CACHE, "market", {
    composeSource: source,
    composeFromMs: composeWindow.fromMs,
    composeToMs: composeWindow.toMs,
    overlayRefCount: input.view.overlayRefs.length,
    overlayRefs,
  });
}

export function emitMarketBundleOverlayDiagnostic(input: {
  view: RunMarketView;
  focusWindow: MarketDisplayWindowMs;
  coverageWindow: MarketDisplayWindowMs;
  marketLoadStatus: string;
}): void {
  const composed = composeDisplayMarketWindowBundle(
    input.view,
    input.focusWindow,
    input.coverageWindow,
  );
  const bundle = composed?.bundle ?? null;
  dbgMarkCutover(PHASE_63F_DIAG_MARKET_BUNDLE_OVERLAY_COUNT, "market", {
    marketLoadStatus: input.marketLoadStatus,
    composeSource: composed?.source ?? null,
    barCount: bundle?.candles.length ?? 0,
    anchorEmaOverlayCount: bundle?.ema_overlays.length ?? 0,
    anchorEmaPointCounts: bundle?.ema_overlays.map((overlay) => ({
      role: overlay.role,
      period: overlay.period,
      pointCount: overlay.points.length,
    })),
  });
}

export function emitRenderWindowInputOverlayDiagnostic(input: {
  bundleAnchorEmaCount: number;
  bundleAuxEmaCount: number;
}): void {
  dbgMarkCutover(PHASE_63F_DIAG_RENDER_WINDOW_INPUT_OVERLAY, "render_window", {
    bundleAnchorEmaCount: input.bundleAnchorEmaCount,
    bundleAuxEmaCount: input.bundleAuxEmaCount,
  });
}

export function emitModelAdapterInputOverlayDiagnostic(input: {
  chartViewEmaCount: number;
  chartViewAuxEmaCount: number;
}): void {
  dbgMarkCutover(PHASE_63F_DIAG_MODEL_ADAPTER_INPUT_OVERLAY, "model", {
    chartViewEmaCount: input.chartViewEmaCount,
    chartViewAuxEmaCount: input.chartViewAuxEmaCount,
  });
}
