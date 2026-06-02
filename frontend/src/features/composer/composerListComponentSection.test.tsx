/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";

import type { ComponentCatalog, JsonObject } from "@/api/types";
import { ListComponentSection } from "@/features/composer/ComposerPanel";

afterEach(() => cleanup());

const catalog: ComponentCatalog = {
  family: "ema_pullback",
  schema_version: 1,
  sections: [],
  components: [
    {
      component_id: "no_blockers",
      role: "blockers",
      label: "No blockers",
      list_slot: true,
    },
    {
      component_id: "counter_candle_blocker",
      role: "blockers",
      label: "Counter candle blocker",
      list_slot: true,
      supports_context_consumption: true,
      context_consumption_policies: [
        {
          policy_id: "htf_regime_gate",
          label: "HTF regime gate",
          params_schema: {
            allowed_regimes: {
              type: "array",
              label: "Allowed regimes",
              enum: ["aligned", "countertrend", "neutral"],
            },
          },
        },
      ],
    },
    {
      component_id: "rsi_lookback_extreme_blocker",
      role: "blockers",
      label: "RSI lookback extreme blocker",
      list_slot: true,
      supports_context_consumption: true,
      context_consumption_policies: [
        {
          policy_id: "htf_regime_gate",
          label: "HTF regime gate",
          params_schema: {
            allowed_regimes: {
              type: "array",
              label: "Allowed regimes",
              enum: ["aligned", "countertrend", "neutral"],
            },
          },
        },
      ],
      params_schema: {
        lookback: { type: "integer", label: "Lookback", default: 20 },
      },
    },
  ],
  context_providers: [],
  context_consumption_roles: [],
};

const setupCatalog: ComponentCatalog = {
  ...catalog,
  components: [
    {
      component_id: "untouched_anchor_setup",
      role: "setup",
      label: "Untouched anchor setup",
      list_slot: true,
      supports_context_consumption: true,
      context_consumption_policies: [
        {
          policy_id: "htf_regime_gate",
          label: "HTF regime gate",
          params_schema: {
            allowed_regimes: {
              type: "array",
              label: "Allowed regimes",
              enum: ["aligned", "countertrend", "neutral"],
            },
          },
        },
      ],
      params_schema: {
        lookback: { type: "integer", label: "Lookback", default: 50 },
      },
    },
    {
      component_id: "ema_bounce_counter_setup",
      role: "setup",
      label: "EMA bounce counter setup",
      list_slot: true,
      supports_context_consumption: true,
      context_consumption_policies: [
        {
          policy_id: "htf_regime_gate",
          label: "HTF regime gate",
          params_schema: {
            allowed_regimes: {
              type: "array",
              label: "Allowed regimes",
              enum: ["aligned", "countertrend", "neutral"],
            },
          },
        },
      ],
    },
  ],
};

function StatefulBlockersList({
  initialSlots,
  strategy,
}: {
  initialSlots: JsonObject[];
  strategy: JsonObject;
}) {
  const [slots, setSlots] = useState(initialSlots);
  return (
    <ListComponentSection
      title="Blockers"
      role="blockers"
      catalog={catalog}
      strategy={strategy}
      slots={slots}
      instanceIndex={0}
      errors={[]}
      onAdd={() => undefined}
      onRemove={() => undefined}
      onChange={(index, next) =>
        setSlots((prev) => prev.map((slot, i) => (i === index ? next : slot)))
      }
    />
  );
}

function renderBlockers(slots: JsonObject[], strategy: JsonObject) {
  render(<StatefulBlockersList initialSlots={slots} strategy={strategy} />);
}

function StatefulSetupsList({
  initialSlots,
  strategy,
}: {
  initialSlots: JsonObject[];
  strategy: JsonObject;
}) {
  const [slots, setSlots] = useState(initialSlots);
  return (
    <ListComponentSection
      title="Setup"
      role="setup"
      catalog={setupCatalog}
      strategy={strategy}
      slots={slots}
      instanceIndex={0}
      errors={[]}
      onAdd={() => undefined}
      onRemove={() => undefined}
      onChange={(index, next) =>
        setSlots((prev) => prev.map((slot, i) => (i === index ? next : slot)))
      }
    />
  );
}

describe("ListComponentSection blockers context consumption", () => {
  it("renders context consumption controls for counter_candle_blocker", () => {
    renderBlockers(
      [{ instance_id: "b1", component_id: "counter_candle_blocker" }],
      { contexts: { htf_1: { component_id: "htf_context", timeframe: "4h" } } },
    );
    expect(screen.getByText("Context consumption")).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox", { name: /Context consumption/i }));
    expect(screen.getAllByText("context_ref").length).toBeGreaterThan(0);
    expect(screen.getAllByText("policy_id").length).toBeGreaterThan(0);
  });

  it("does not render context consumption for no_blockers", () => {
    renderBlockers([{ instance_id: "b0", component_id: "no_blockers" }], {
      contexts: { htf_1: { component_id: "htf_context" } },
    });
    expect(screen.queryByText("Context consumption")).toBeNull();
  });

  it("renders context consumption controls for rsi_lookback_extreme_blocker", () => {
    renderBlockers(
      [{ instance_id: "rsi1", component_id: "rsi_lookback_extreme_blocker", lookback: 20 }],
      { contexts: { htf_1: { component_id: "htf_context" } } },
    );
    expect(screen.getByText("Context consumption")).toBeTruthy();
  });

  it("shows empty contexts hint when strategy.contexts is empty", () => {
    renderBlockers([{ instance_id: "b1", component_id: "counter_candle_blocker" }], {
      contexts: {},
    });
    fireEvent.click(screen.getByRole("checkbox", { name: /Context consumption/i }));
    expect(screen.getByText("Add a strategy context first")).toBeTruthy();
  });

  it("lists htf_regime_gate in policy selector from catalog", () => {
    renderBlockers(
      [{ instance_id: "b1", component_id: "counter_candle_blocker" }],
      { contexts: { htf_1: { component_id: "htf_context" } } },
    );
    fireEvent.click(screen.getByRole("checkbox", { name: /Context consumption/i }));
    const policySelect = screen.getAllByRole("combobox").find((el) =>
      Array.from(el.querySelectorAll("option")).some((o) => o.textContent === "HTF regime gate"),
    );
    expect(policySelect).toBeTruthy();
  });

  it("renders allowed_regimes multiselect for htf_regime_gate", () => {
    renderBlockers(
      [{ instance_id: "b1", component_id: "counter_candle_blocker" }],
      { contexts: { htf_1: { component_id: "htf_context" } } },
    );
    fireEvent.click(screen.getByRole("checkbox", { name: /Context consumption/i }));
    const selects = screen.getAllByRole("combobox");
    const contextSelect = selects.find((el) =>
      Array.from(el.querySelectorAll("option")).some((o) => o.textContent === "htf_1"),
    )!;
    fireEvent.change(contextSelect, { target: { value: "htf_1" } });
    const policySelect = selects.find((el) =>
      Array.from(el.querySelectorAll("option")).some((o) => o.textContent === "HTF regime gate"),
    )!;
    fireEvent.change(policySelect, { target: { value: "htf_regime_gate" } });
    expect(screen.getByText("Allowed regimes")).toBeTruthy();
    expect(screen.getByText("aligned")).toBeTruthy();
    expect(screen.getByText("countertrend")).toBeTruthy();
    expect(screen.getByText("neutral")).toBeTruthy();
  });

  it("does not list HTF state gate in policy selector", () => {
    renderBlockers(
      [{ instance_id: "b1", component_id: "counter_candle_blocker" }],
      { contexts: { htf_1: { component_id: "htf_context" } } },
    );
    fireEvent.click(screen.getByRole("checkbox", { name: /Context consumption/i }));
    const policySelect = screen.getAllByRole("combobox").find((el) =>
      Array.from(el.querySelectorAll("option")).some((o) => o.textContent === "HTF regime gate"),
    );
    expect(policySelect).toBeTruthy();
    const options = Array.from(policySelect!.querySelectorAll("option")).map((o) => o.textContent);
    expect(options).not.toContain("HTF state gate");
  });

  it("lists only defined context refs in selector", () => {
    renderBlockers(
      [{ instance_id: "b1", component_id: "counter_candle_blocker" }],
      { contexts: { htf_1: { component_id: "htf_context" } } },
    );
    fireEvent.click(screen.getByRole("checkbox", { name: /Context consumption/i }));
    const contextSelect = screen.getAllByRole("combobox").find((el) => {
      const options = Array.from(el.querySelectorAll("option")).map((o) => o.textContent);
      return options.some((t) => t === "htf_1");
    });
    expect(contextSelect).toBeTruthy();
    const options = Array.from(contextSelect!.querySelectorAll("option")).map(
      (o) => o.textContent,
    );
    expect(options).not.toContain("12");
  });
});

describe("ListComponentSection setup context consumption", () => {
  it("renders context consumption controls for setup list item", () => {
    render(
      <StatefulSetupsList
        initialSlots={[{ instance_id: "s1", component_id: "untouched_anchor_setup", lookback: 50 }]}
        strategy={{ contexts: { htf_1: { component_id: "htf_context", timeframe: "4h" } } }}
      />,
    );
    expect(screen.getByText("Context consumption")).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox", { name: /Context consumption/i }));
    expect(screen.getAllByText("context_ref").length).toBeGreaterThan(0);
    expect(screen.getAllByText("policy_id").length).toBeGreaterThan(0);
  });
});
