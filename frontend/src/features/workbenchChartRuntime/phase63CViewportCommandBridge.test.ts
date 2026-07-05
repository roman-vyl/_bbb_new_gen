import { describe, expect, it } from "vitest";

import { chartRuntimeCutoverConfig } from "./chartRuntimeCutoverConfig";
import { makePhase6Candles } from "./phase6ContractFixtures";
import { createPhase63BRenderWindowOwnerState } from "./phase63BRenderWindowBridge";
import {
  collectForbiddenImportViolations,
  readWorkspaceSource,
} from "./phase6StaticGuardUtils";
import {
  createPhase63CViewportOwnerState,
  PHASE_63C_VIEWPORT_ACK_STEP,
  PHASE_63C_VIEWPORT_DUPLICATE_SKIP_STEP,
  PHASE_63C_VIEWPORT_EMIT_STEP,
  runPhase63CAcknowledgeViewportCommand,
  runPhase63CCancelViewportOnPointerDown,
  runPhase63CDispatchViewportInteraction,
  runPhase63COnWindowSwapCommitted,
  runPhase63CSelectTradeFocusCommand,
  runPhase63CSettleWindowSwapCommit,
} from "./phase63CViewportCommandBridge";
import { findForbiddenAdapterFallbackPatterns } from "./runtimeOutputAdapter.contract";
import type { WindowCommitResult } from "@/features/chart/runtime/types";

function makeWindowSwapCommit(): WindowCommitResult {
  return {
    shiftSeq: 1,
    anchorTimeSec: 1_200,
    previousVisible: { from: 10, to: 90 },
    bounds: { windowStartIndex: 5, windowEndIndex: 105 },
    boundsBefore: { windowStartIndex: 0, windowEndIndex: 100 },
  };
}

describe("Phase 6.3C viewport command cutover", () => {
  it("sets cutover config to phase 6.3F with viewport on runtime_v2_production", () => {
    expect(chartRuntimeCutoverConfig.cutoverPhase).toBe("6.3F");
    expect(chartRuntimeCutoverConfig.domainOwners.viewport).toBe("runtime_v2_production");
    expect(chartRuntimeCutoverConfig.domainOwners.trace).toBe("runtime_v2_production");
    expect(chartRuntimeCutoverConfig.domainOwners.aux_overlay).toBe("runtime_v2_production");
    expect(chartRuntimeCutoverConfig.domainOwners.market).toBe("runtime_v2_production");
  });

  it("emits selected-trade focus command through v2 viewport controller", () => {
    const renderOwner = createPhase63BRenderWindowOwnerState(() => {});
    const viewportOwner = createPhase63CViewportOwnerState(renderOwner);

    const command = runPhase63CSelectTradeFocusCommand(viewportOwner, renderOwner, 1_200);
    expect(command).toEqual({ type: "focusTrade", entryTimeSec: 1_200 });
    expect(viewportOwner.viewportState.commandSeq).toBe(1);
  });

  it("does not bump command seq for duplicate selected-trade focus", () => {
    const renderOwner = createPhase63BRenderWindowOwnerState(() => {});
    const viewportOwner = createPhase63CViewportOwnerState(renderOwner);

    const first = runPhase63CSelectTradeFocusCommand(viewportOwner, renderOwner, 1_200);
    expect(first).not.toBeNull();
    expect(viewportOwner.viewportState.commandSeq).toBe(1);

    const duplicate = runPhase63CSelectTradeFocusCommand(viewportOwner, renderOwner, 1_200);
    expect(duplicate).toBeNull();
    expect(viewportOwner.viewportState.commandSeq).toBe(1);
  });

  it("clears programmatic focus intent on wheel interaction", () => {
    const renderOwner = createPhase63BRenderWindowOwnerState(() => {});
    const viewportOwner = createPhase63CViewportOwnerState(renderOwner);

    runPhase63CSelectTradeFocusCommand(viewportOwner, renderOwner, 1_200);
    runPhase63CAcknowledgeViewportCommand(viewportOwner);
    renderOwner.controller.chartRuntime.viewport.dispatch({ type: "wheel" });

    const blocked = runPhase63CDispatchViewportInteraction(viewportOwner, renderOwner, {
      type: "pointermove",
    });
    expect(blocked).toBeNull();
    expect(renderOwner.controller.chartRuntime.viewport.getState().activeFocusIntent).toBeNull();
  });

  it("cancels viewport commands on pointer down and supports settle", () => {
    const renderOwner = createPhase63BRenderWindowOwnerState(() => {});
    const viewportOwner = createPhase63CViewportOwnerState(renderOwner);
    const candles = makePhase6Candles(120);
    renderOwner.controller.chartRuntime.renderWindow.reset(candles.length);
    renderOwner.controller.chartRuntime.renderWindow.getManager().buildTailWindow();

    runPhase63CCancelViewportOnPointerDown(viewportOwner);
    const restore = runPhase63COnWindowSwapCommitted(viewportOwner, renderOwner, {
      commit: makeWindowSwapCommit(),
      bundleCandleCount: candles.length,
    });
    expect(restore).not.toBeNull();
    expect(restore?.type).toBe("restoreAfterWindowSwap");
    if (restore?.type !== "restoreAfterWindowSwap") {
      return;
    }

    runPhase63CSettleWindowSwapCommit(
      viewportOwner,
      renderOwner,
      restore.shiftSeq,
      restore.swapTransactionId,
    );
  });

  it("does not include market fetch/cache helpers in viewport bridge", () => {
    const bridgeSource = readWorkspaceSource(
      "src/features/workbenchChartRuntime/phase63CViewportCommandBridge.ts",
    );
    expect(bridgeSource).not.toContain("executeMarketWindowLoad");
    expect(bridgeSource).not.toContain("mergeCandlesWindowBundle");
    expect(bridgeSource).not.toContain("seedCandlesWindow");
    expect(bridgeSource).not.toContain("clearMarketResourceCache");
  });

  it("wires render viewport integration layer to v2 viewport bridge without full runtime hook", () => {
    const renderViewportSource = readWorkspaceSource(
      "src/shared/context/WorkbenchRenderViewportContext.tsx",
    );
    expect(renderViewportSource).toContain("phase63CViewportCommandBridge");
    expect(renderViewportSource).toContain("runPhase63CForceTradeFocusCommand");
    expect(renderViewportSource).toContain("runPhase63CDispatchViewportInteraction");
    expect(renderViewportSource).not.toContain("useWorkbenchChartRuntime");
    expect(findForbiddenAdapterFallbackPatterns(renderViewportSource)).toEqual([]);

    const workbenchSource = readWorkspaceSource("src/shared/context/WorkbenchContext.tsx");
    expect(workbenchSource).not.toContain("phase63CViewportCommandBridge");
    expect(workbenchSource).not.toContain("useWorkbenchChartRuntime");
    expect(workbenchSource).not.toContain("chartRuntimeRef");
    expect(findForbiddenAdapterFallbackPatterns(workbenchSource)).toEqual([]);
  });

  it("keeps ChartPanel on workbench integration hooks without runtime internals", () => {
    const chartPanelSource = readWorkspaceSource("src/features/chart/ChartPanel.tsx");
    const violations = collectForbiddenImportViolations(chartPanelSource, [
      /from\s+["']@\/features\/workbenchChartRuntime/,
      /useWorkbenchChartRuntime/,
    ]);
    expect(violations).toEqual([]);
    expect(chartPanelSource).toContain("useWorkbenchRenderViewport");
  });

  it("documents viewport debug step ids", () => {
    expect(PHASE_63C_VIEWPORT_EMIT_STEP).toBe("wb.viewport.command_emit");
    expect(PHASE_63C_VIEWPORT_ACK_STEP).toBe("wb.viewport.command_ack");
    expect(PHASE_63C_VIEWPORT_DUPLICATE_SKIP_STEP).toBe("wb.viewport.duplicate_skipped");
  });
});
