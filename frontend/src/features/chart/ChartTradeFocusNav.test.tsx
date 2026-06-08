/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { TradeRecord } from "@/api/types";
import { ChartTradeFocusNav } from "@/features/chart/ChartTradeFocusNav";

afterEach(() => cleanup());

const trades: TradeRecord[] = [
  {
    trade_id: 1,
    direction: "long",
    status: "closed",
    entry_time_ms: 1_000,
    exit_time_ms: 2_000,
    entry_price: 100,
    exit_price: 101,
    size: 1,
    pnl: 1,
    return_pct: 0.01,
    exit_reason: "signal:test",
  },
  {
    trade_id: 2,
    direction: "long",
    status: "closed",
    entry_time_ms: 3_000,
    exit_time_ms: 4_000,
    entry_price: 100,
    exit_price: 102,
    size: 1,
    pnl: 2,
    return_pct: 0.02,
    exit_reason: "signal:test",
  },
  {
    trade_id: 3,
    direction: "short",
    status: "closed",
    entry_time_ms: 5_000,
    exit_time_ms: 6_000,
    entry_price: 100,
    exit_price: 99,
    size: 1,
    pnl: 1,
    return_pct: 0.01,
    exit_reason: "signal:test",
  },
];

describe("ChartTradeFocusNav", () => {
  it("steps with arrow buttons", () => {
    const onSelectTrade = vi.fn();
    render(
      <ChartTradeFocusNav trades={trades} selectedTradeId={2} onSelectTrade={onSelectTrade} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Previous trade" }));
    expect(onSelectTrade).toHaveBeenCalledWith(1);

    fireEvent.click(screen.getByRole("button", { name: "Next trade" }));
    expect(onSelectTrade).toHaveBeenCalledWith(3);
  });

  it("jumps to typed trade id on Enter", () => {
    const onSelectTrade = vi.fn();
    render(
      <ChartTradeFocusNav trades={trades} selectedTradeId={1} onSelectTrade={onSelectTrade} />,
    );

    const input = screen.getByRole("textbox", { name: "Trade number" });
    fireEvent.change(input, { target: { value: "3" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onSelectTrade).toHaveBeenCalledWith(3);
  });

  it("commits typed trade id on blur", () => {
    const onSelectTrade = vi.fn();
    render(
      <ChartTradeFocusNav trades={trades} selectedTradeId={2} onSelectTrade={onSelectTrade} />,
    );

    const input = screen.getByRole("textbox", { name: "Trade number" });
    fireEvent.change(input, { target: { value: "1" } });
    fireEvent.blur(input);

    expect(onSelectTrade).toHaveBeenCalledWith(1);
  });

  it("reverts invalid input on blur", () => {
    const onSelectTrade = vi.fn();
    render(
      <ChartTradeFocusNav trades={trades} selectedTradeId={2} onSelectTrade={onSelectTrade} />,
    );

    const input = screen.getByRole("textbox", { name: "Trade number" });
    fireEvent.change(input, { target: { value: "abc" } });
    fireEvent.blur(input);

    expect(onSelectTrade).not.toHaveBeenCalled();
    expect((input as HTMLInputElement).value).toBe("2");
  });

  it("shows sequential display number for managed string trade ids", () => {
    const managedTrades: TradeRecord[] = [
      {
        ...trades[0]!,
        trade_id: "long:641890",
      },
      {
        ...trades[1]!,
        trade_id: "short:979",
      },
    ];
    render(
      <ChartTradeFocusNav
        trades={managedTrades}
        selectedTradeId="short:979"
        onSelectTrade={vi.fn()}
      />,
    );
    expect((screen.getByRole("textbox", { name: "Trade number" }) as HTMLInputElement).value).toBe(
      "2",
    );
  });

  it("allows jump to id not in list (stale focus)", () => {
    const onSelectTrade = vi.fn();
    render(
      <ChartTradeFocusNav trades={trades} selectedTradeId={2} onSelectTrade={onSelectTrade} />,
    );

    const input = screen.getByRole("textbox", { name: "Trade number" });
    fireEvent.change(input, { target: { value: "99" } });
    fireEvent.blur(input);

    expect(onSelectTrade).toHaveBeenCalledWith(99);
  });
});
