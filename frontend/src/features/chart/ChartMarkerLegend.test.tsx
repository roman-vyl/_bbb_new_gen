/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ChartMarkerLegend } from "@/features/chart/ChartMarkerLegend";

afterEach(() => {
  cleanup();
});

describe("ChartMarkerLegend trade management toggles", () => {
  it("shows trade management toggles when events exist", () => {
    render(
      <ChartMarkerLegend
        showEntryBlockMarkers
        onShowEntryBlockMarkersChange={vi.fn()}
        showExitSignalMarkers
        onShowExitSignalMarkersChange={vi.fn()}
        showSetupMarkers
        onShowSetupMarkersChange={vi.fn()}
        hasComponentEvents={false}
        hasTradeManagementEvents
        showTradeManagementPhaseMarkers={false}
        onShowTradeManagementPhaseMarkersChange={vi.fn()}
        showTradeManagementExitMarkers={false}
        onShowTradeManagementExitMarkersChange={vi.fn()}
      />,
    );
    expect(screen.getByText("Trade management")).toBeTruthy();
    expect(screen.getByTestId("chart-toggle-trade-management-phases")).toBeTruthy();
    expect(screen.getByTestId("chart-toggle-trade-management-exits")).toBeTruthy();
  });

  it("hides trade management toggles for old reports without events", () => {
    render(
      <ChartMarkerLegend
        showEntryBlockMarkers
        onShowEntryBlockMarkersChange={vi.fn()}
        showExitSignalMarkers
        onShowExitSignalMarkersChange={vi.fn()}
        showSetupMarkers
        onShowSetupMarkersChange={vi.fn()}
        hasComponentEvents={false}
        hasTradeManagementEvents={false}
        showTradeManagementPhaseMarkers={false}
        onShowTradeManagementPhaseMarkersChange={vi.fn()}
        showTradeManagementExitMarkers={false}
        onShowTradeManagementExitMarkersChange={vi.fn()}
      />,
    );
    expect(screen.queryByText("Trade management")).toBeNull();
  });

  it("calls phase toggle handler", () => {
    const onPhases = vi.fn();
    render(
      <ChartMarkerLegend
        showEntryBlockMarkers
        onShowEntryBlockMarkersChange={vi.fn()}
        showExitSignalMarkers
        onShowExitSignalMarkersChange={vi.fn()}
        showSetupMarkers
        onShowSetupMarkersChange={vi.fn()}
        hasComponentEvents={false}
        hasTradeManagementEvents
        showTradeManagementPhaseMarkers={false}
        onShowTradeManagementPhaseMarkersChange={onPhases}
        showTradeManagementExitMarkers={false}
        onShowTradeManagementExitMarkersChange={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId("chart-toggle-trade-management-phases"));
    expect(onPhases).toHaveBeenCalledWith(true);
  });
});
