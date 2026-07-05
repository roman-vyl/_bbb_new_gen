import type { ChartBar, ChartEmaOverlay, ChartAuxEmaOverlay, ComponentEvent } from "@/api/types";
import type { ChartLogicalRange } from "@/features/chart/chartViewport";
import type { WindowBounds } from "@/features/chart/chartDataWindowManager";
import type { ChartViewMode } from "@/features/chart/chartViewWindow";
import type { TraceDisplayStatus } from "@/features/chart/traceDisplayApply";

export type RenderWindowInteractionState =
  | "idle_user_view"
  | "trade_focused"
  | "user_panning"
  | "pending_shift"
  | "applying_shift";

export type PendingShiftDirection = "left" | "right";

export type PendingShiftIntent = {
  direction: PendingShiftDirection;
  anchorTimeSec: number;
  visible: ChartLogicalRange;
  recordedAtMs: number;
};

export type CommittedRenderWindow = {
  bounds: WindowBounds;
  firstTimeSec: number | null;
  lastTimeSec: number | null;
  revision: number;
};

export type ChartNavigationKey =
  | "ArrowLeft"
  | "ArrowRight"
  | "PageUp"
  | "PageDown"
  | "Home"
  | "End";

export type ChartInteractionEvent =
  | { type: "pointerdown" }
  | { type: "pointermove" }
  | { type: "pointerup" }
  | { type: "wheel" }
  | { type: "keyboard_pan_start"; key: ChartNavigationKey }
  | { type: "programmatic_viewport_start" }
  | { type: "programmatic_viewport_end" }
  | { type: "visible_range_changed"; visible: ChartLogicalRange; anchorTimeSec: number | null }
  | { type: "trade_selected"; entryTimeSec: number | null }
  | { type: "resize" };

export type RestoreAfterWindowSwapCommand = {
  type: "restoreAfterWindowSwap";
  anchorTimeSec: number;
  previousVisible: ChartLogicalRange;
  windowStartIndex?: number;
  fullLength?: number;
  shiftSeq: number;
  /** Assigned by Workbench before ChartPanel execute. */
  swapTransactionId: number;
};

export type ViewportControllerCommand =
  | { type: "noViewportChange" }
  | { type: "focusTrade"; entryTimeSec: number }
  | Omit<RestoreAfterWindowSwapCommand, "swapTransactionId">
  | { type: "preserveUserRange" };

/** Viewport command for ChartPanel; restoreAfterWindowSwap always has swapTransactionId when emitted from shell. */
export type ViewportCommand =
  | Exclude<ViewportControllerCommand, { type: "restoreAfterWindowSwap" }>
  | RestoreAfterWindowSwapCommand;

export type ViewportFocusIntent = "trade" | null;

export type ViewportOwner = "user" | "trade";

export type ViewportControllerState = {
  mode: ChartViewMode;
  centerTimeSec: number | null;
  userPanning: boolean;
  /** Set only on explicit trade_selected; cleared on user pan. */
  activeFocusIntent: ViewportFocusIntent;
  viewportOwner: ViewportOwner;
};

export type TraceFetchIntent = {
  windowKey: string;
  fromSec: number;
  toSec: number;
} | null;

export type ChartViewModelInput = {
  candles: ChartBar[];
  emaOverlays: ChartEmaOverlay[];
  auxEmaOverlays: ChartAuxEmaOverlay[];
  displayAuxEmaOverlays: ChartAuxEmaOverlay[];
  componentEvents: ComponentEvent[];
  htfOverlayStale: boolean;
  componentEventsStale: boolean;
  traceDisplayStatus: TraceDisplayStatus;
  traceDisplayMissingRange: { fromSec: number; toSec: number } | null;
  viewMode: ChartViewMode;
  centerTimeSec: number | null;
  firstTimeSec: number | null;
  lastTimeSec: number | null;
  count: number;
};

export type WindowCommitResult = {
  bounds: WindowBounds;
  anchorTimeSec: number;
  previousVisible: ChartLogicalRange;
  boundsBefore: WindowBounds;
  shiftSeq: number;
};
