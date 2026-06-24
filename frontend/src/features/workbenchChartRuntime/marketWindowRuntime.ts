import {
  buildMarketTargetWindowKey,
  resolveMarketTargetWindow,
  type MarketDisplayWindowMs,
} from "@/features/chart/workbenchMarketLoad";
import type { RunMarketView } from "@/features/chart/runMarketView";

import type { RuntimeMarketWindowResetReason, RuntimeMarketWindowSnapshot } from "./runtimeTypes";

export type RuntimeMarketWindow = {
  fromMs: number;
  toMs: number;
  toOpenTimeMs: number;
};

export type MarketWindowRuntimeInactiveBoundary = {
  implemented: false;
  focusWindow: RuntimeMarketWindow | null;
  coverageWindow: RuntimeMarketWindow | null;
  focusWindowKey: string | null;
  coverageWindowKey: string | null;
};

export type MarketWindowRuntimeState = {
  marketIdentity: string | null;
  selectedTradeEntryTimeMs: number | null;
  resetKey: string | null;
  focusWindow: RuntimeMarketWindow | null;
  coverageWindow: RuntimeMarketWindow | null;
};

export type MarketWindowRuntimeOutput = RuntimeMarketWindowSnapshot & {
  implemented: true;
};

export type MarketWindowRuntimeBoundary =
  | MarketWindowRuntimeInactiveBoundary
  | MarketWindowRuntimeOutput;

export function windowsEqual(
  left: RuntimeMarketWindow | null,
  right: RuntimeMarketWindow | null,
): boolean {
  if (left === null || right === null) {
    return left === right;
  }
  return (
    left.fromMs === right.fromMs &&
    left.toMs === right.toMs &&
    left.toOpenTimeMs === right.toOpenTimeMs
  );
}

function cloneWindow(window: MarketDisplayWindowMs): RuntimeMarketWindow {
  return {
    fromMs: window.fromMs,
    toMs: window.toMs,
    toOpenTimeMs: window.toOpenTimeMs,
  };
}

export function buildMarketWindowResetKey(params: {
  marketIdentity: string;
  selectedTradeEntryTimeMs: number | null;
}): string {
  return `${params.marketIdentity}:${params.selectedTradeEntryTimeMs ?? "tail"}`;
}

export function toMarketWindowRuntimeState(
  output: MarketWindowRuntimeOutput,
): MarketWindowRuntimeState {
  return {
    marketIdentity: output.marketIdentity,
    selectedTradeEntryTimeMs: output.selectedTradeEntryTimeMs,
    resetKey: output.resetKey,
    focusWindow: output.focusWindow,
    coverageWindow: output.coverageWindow,
  };
}

export function resolveMarketWindowRuntime(input: {
  view: RunMarketView | null;
  marketIdentity: string | null;
  expectedMarketIdentity: string | null;
  selectedTradeEntryTimeMs: number | null;
  previous?: MarketWindowRuntimeState | null;
}): MarketWindowRuntimeOutput {
  if (input.view === null || input.marketIdentity === null) {
    return {
      implemented: true,
      marketIdentity: input.marketIdentity,
      expectedMarketIdentity: input.expectedMarketIdentity,
      selectedTradeEntryTimeMs: input.selectedTradeEntryTimeMs,
      focusWindow: null,
      coverageWindow: null,
      focusWindowKey: null,
      coverageWindowKey: null,
      resetKey: null,
      focusMode: null,
      resetReasons: ["view_unavailable"],
    };
  }

  const resetKey = buildMarketWindowResetKey({
    marketIdentity: input.marketIdentity,
    selectedTradeEntryTimeMs: input.selectedTradeEntryTimeMs,
  });
  const previous = input.previous ?? null;
  if (
    previous !== null &&
    previous.resetKey === resetKey &&
    previous.focusWindow !== null &&
    previous.coverageWindow !== null
  ) {
    return {
      implemented: true,
      marketIdentity: input.marketIdentity,
      expectedMarketIdentity: input.expectedMarketIdentity,
      selectedTradeEntryTimeMs: input.selectedTradeEntryTimeMs,
      focusWindow: previous.focusWindow,
      coverageWindow: previous.coverageWindow,
      focusWindowKey: buildMarketTargetWindowKey(input.marketIdentity, previous.focusWindow),
      coverageWindowKey: buildMarketTargetWindowKey(input.marketIdentity, previous.coverageWindow),
      resetKey,
      focusMode: input.selectedTradeEntryTimeMs !== null ? "around-trade" : "tail",
      resetReasons: ["unchanged"],
    };
  }

  const focusWindow = cloneWindow(
    resolveMarketTargetWindow(input.view, input.selectedTradeEntryTimeMs),
  );
  const coverageWindow = focusWindow;
  const resetReasons: RuntimeMarketWindowResetReason[] = [];

  if (previous === null || previous.focusWindow === null) {
    resetReasons.push("initial_focus");
  } else {
    if (
      previous.marketIdentity !== null &&
      previous.marketIdentity !== input.marketIdentity
    ) {
      resetReasons.push("identity_changed");
    }
    if (previous.selectedTradeEntryTimeMs !== input.selectedTradeEntryTimeMs) {
      resetReasons.push("selected_trade_changed");
    }
    if (!windowsEqual(previous.focusWindow, focusWindow)) {
      resetReasons.push("focus_window_changed");
    }
  }

  if (previous === null || previous.coverageWindow === null) {
    resetReasons.push("coverage_window_initialized");
  } else if (!windowsEqual(previous.coverageWindow, focusWindow)) {
    resetReasons.push("coverage_window_reset_to_focus");
  }

  if (resetReasons.length === 0) {
    resetReasons.push("unchanged");
  }

  return {
    implemented: true,
    marketIdentity: input.marketIdentity,
    expectedMarketIdentity: input.expectedMarketIdentity,
    selectedTradeEntryTimeMs: input.selectedTradeEntryTimeMs,
    focusWindow,
    coverageWindow,
    focusWindowKey: buildMarketTargetWindowKey(input.marketIdentity, focusWindow),
    coverageWindowKey: buildMarketTargetWindowKey(input.marketIdentity, coverageWindow),
    resetKey,
    focusMode: input.selectedTradeEntryTimeMs !== null ? "around-trade" : "tail",
    resetReasons,
  };
}

export function createMarketWindowRuntimeBoundary(input?: {
  view: RunMarketView | null;
  marketIdentity: string | null;
  expectedMarketIdentity: string | null;
  selectedTradeEntryTimeMs: number | null;
  previous?: MarketWindowRuntimeState | null;
}): MarketWindowRuntimeBoundary {
  if (input !== undefined) {
    return resolveMarketWindowRuntime(input);
  }
  return {
    implemented: false,
    focusWindow: null,
    coverageWindow: null,
    focusWindowKey: null,
    coverageWindowKey: null,
  };
}
