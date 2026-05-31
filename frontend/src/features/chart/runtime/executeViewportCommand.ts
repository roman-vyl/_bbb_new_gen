import type { IChartApi } from "lightweight-charts";

import type { ChartBar } from "@/api/types";
import {
  applyChartViewport,
  restoreVisibleRangeAfterWindowShift,
} from "@/features/chart/chartViewport";
import type { ViewportCommand } from "@/features/chart/runtime/types";

export function executeViewportCommand(params: {
  chart: IChartApi;
  command: ViewportCommand;
  candles: ChartBar[];
}): void {
  switch (params.command.type) {
    case "noViewportChange":
    case "preserveUserRange":
      return;
    case "focusTrade":
      applyChartViewport({
        chart: params.chart,
        mode: "around-trade",
        candles: params.candles,
        centerTimeSec: params.command.entryTimeSec,
      });
      return;
    case "restoreAfterWindowSwap":
      restoreVisibleRangeAfterWindowShift(params.chart, {
        anchorTimeSec: params.command.anchorTimeSec,
        newCandles: params.candles,
        previousVisible: params.command.previousVisible,
        windowStartIndex: params.command.windowStartIndex,
        fullLength: params.command.fullLength,
      });
      return;
    default: {
      const _exhaustive: never = params.command;
      return _exhaustive;
    }
  }
}
