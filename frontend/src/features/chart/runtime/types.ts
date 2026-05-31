import type { ChartBar, ChartEmaOverlay, ChartAuxEmaOverlay, ComponentEvent } from "@/api/types";
import type { ChartLogicalRange } from "@/features/chart/chartViewport";
import type { WindowBounds } from "@/features/chart/chartDataWindowManager";
import type { ChartViewMode } from "@/features/chart/chartViewWindow";

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

export type ChartInteractionEvent =
  | { type: "pointerdown" }
  | { type: "pointermove" }
  | { type: "pointerup" }
  | { type: "wheel" }
  | { type: "programmatic_viewport_start" }
  | { type: "programmatic_viewport_end" }
  | { type: "visible_range_changed"; visible: ChartLogicalRange; anchorTimeSec: number | null }
  | { type: "trade_selected" }
  | { type: "resize" };

export type ViewportCommand =
  | { type: "noViewportChange" }
  | { type: "focusTrade"; entryTimeSec: number }
  | { type: "restoreAfterWindowSwap"; anchorTimeSec: number; previousVisible: ChartLogicalRange }
  | { type: "preserveUserRange" };

export type ViewportControllerState = {
  mode: ChartViewMode;
  centerTimeSec: number | null;
  userPanning: boolean;
  suppressTradeFocus: boolean;
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
