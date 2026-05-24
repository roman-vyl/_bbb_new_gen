/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { ExitComponentRow } from "@/features/chart/exitPolicyForTrade";
import { ActiveExitComponentsList } from "@/features/chart/ActiveExitComponentsList";

afterEach(() => cleanup());

const sampleRow: ExitComponentRow = {
  group: "always_on",
  profile: null,
  component_id: "atr_stop_loss",
  instance_id: "atr_sl",
  exit_kind: "stop_loss",
  parameters: { timeframe: "5m", period: "14", multiplier: "2" },
  emaPeriods: [],
  isClosing: false,
  emaAvailabilityHint: null,
};

describe("ActiveExitComponentsList", () => {
  it("shows warning and table when both present", () => {
    render(
      <ActiveExitComponentsList
        rows={[sampleRow]}
        warning="active_exit_profile missing — profile exits omitted"
      />,
    );
    expect(screen.getByText(/active_exit_profile missing/)).toBeTruthy();
    expect(screen.getByTestId("active-exit-components")).toBeTruthy();
    expect(screen.getByText("atr_sl")).toBeTruthy();
  });

  it("shows only warning when no rows", () => {
    render(<ActiveExitComponentsList rows={[]} warning="exit_policy missing" />);
    expect(screen.getByText("exit_policy missing")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });
});
