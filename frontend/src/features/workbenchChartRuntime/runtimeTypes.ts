import type {
  ChartAuxEmaOverlay,
  ChartBar,
  ChartEmaOverlay,
  ComponentEvent,
  RunReport,
  RunVariant,
  SignalTraceBundle,
} from "@/api/types";
import type { ChartInteractionEvent, ViewportCommand } from "@/features/chart/runtime/types";
import type { ChartViewModel } from "@/features/chart/runtime/chartViewModel";

export type RuntimeLoadStatus = "idle" | "loading" | "ready" | "error";
export type RuntimeCandlesSource = "market" | "unavailable";
export type RuntimeTraceStatus = "idle" | "loading" | "ready" | "error";

export type ChartRuntimeFocusIntent =
  | { type: "none" }
  | { type: "trade"; tradeId: number | string | null; entryTimeMs: number | null; reason: string };

export type ChartRuntimeInput = {
  reportLoadStatus: "loading" | "ready" | "error";
  report: RunReport | null;
  selectedRunId: string | null;
  reloadToken: number;
  selectedVariantKey: string;
  selectedVariant: RunVariant | null;
  selectedTradeId: number | string | null;
  selectedTradeEntryTimeMs: number | null;
  chartTradeFocusWarning: string | null;
  selectedBarTimeSec: number | null;
  chartTimeframe: string;
  chartHeavyIoEnabled: boolean;
  contextOverlayRef: string | null;
  effectiveContextOverlayRef: string | null;
  contextOverlayRefOptions: readonly string[];
  chartFocusIntent: ChartRuntimeFocusIntent;
};

export type ChartRuntimeMarketOutput = {
  status: RuntimeLoadStatus;
  error: string | null;
  candlesSource: RuntimeCandlesSource;
  candlesCount: number;
  fullCandleRange: { min: number; max: number } | null;
};

export type ChartRuntimeTraceOutput = {
  lanesSignalTrace: SignalTraceBundle | null;
  lanesSignalTraceStatus: RuntimeTraceStatus;
  lanesSignalTraceError: string | null;
};

export type ChartRuntimeViewportOutput = {
  command: ViewportCommand | null;
  commandSeq: number;
  acknowledge(): void;
  isWindowSwapTransactionCancelled(swapTransactionId: number): boolean;
  settleWindowSwapCommit(shiftSeq: number, swapTransactionId: number): void;
};

export type ChartRuntimeInteractionOutput = {
  dispatch(event: ChartInteractionEvent): void;
};

export type ChartRuntimeOwnerFlags = {
  marketWindows: boolean;
  marketCacheWrites: boolean;
  renderWindow: boolean;
  viewportCommands: boolean;
  traceDisplayCache: boolean;
  denseLanesTrace: boolean;
  auxOverlays: boolean;
  finalChartModel: boolean;
};

export type ChartRuntimeDebugSnapshot = {
  runId: string | null;
  variantKey: string;
  selectedTradeId: number | string | null;
  selectedTradeEntryTimeMs: number | null;
  chartHeavyIoEnabled: boolean;
  marketIdentity: string | null;
  focusWindow: { fromMs: number; toMs: number; toOpenTimeMs: number } | null;
  coverageWindow: { fromMs: number; toMs: number; toOpenTimeMs: number } | null;
  fetchedCandles: { range: { min: number; max: number } | null; count: number };
  cachedCandles: { range: { min: number; max: number } | null; count: number };
  displayBundle: { range: { min: number; max: number } | null; count: number; source: string | null };
  renderWindow: { startIndex: number | null; endIndex: number | null; firstTimeSec: number | null; lastTimeSec: number | null };
  chartModel: { firstTimeSec: number | null; lastTimeSec: number | null; count: number; seriesKey: string | null };
  viewportCommand: ViewportCommand | null;
  traceRequests: { displayKey: string | null; denseKey: string | null; status: RuntimeTraceStatus };
  counts: { componentEvents: number; auxOverlays: number; htfOverlays: number; markers: number | null };
  ownerFlags: ChartRuntimeOwnerFlags;
};

export type ChartRuntimeOutput = {
  chartViewModel: ChartViewModel;
  market: ChartRuntimeMarketOutput;
  trace: ChartRuntimeTraceOutput;
  overlays: { htfAuxEmaOverlayStale: boolean };
  display: { componentEventsStale: boolean; displayApplyRevision: number; renderWindowShiftSeq: number };
  viewport: ChartRuntimeViewportOutput;
  interaction: ChartRuntimeInteractionOutput;
  debug: ChartRuntimeDebugSnapshot;
};

export type ChartRuntimeCompatibilityInput = {
  selectedVariant: RunVariant | null;
  selectedTradeId: number | string | null;
  selectedBarTimeSec: number | null;
};

export type ChartRuntimeModelParts = {
  candles: ChartBar[];
  emaOverlays: ChartEmaOverlay[];
  auxEmaOverlays: ChartAuxEmaOverlay[];
  componentEvents: ComponentEvent[];
};
