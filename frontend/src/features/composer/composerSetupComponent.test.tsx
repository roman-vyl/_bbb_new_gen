/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";

import type { ComponentCatalog, JsonObject } from "@/api/types";
import {
  applyComponentDefaults,
  componentsForRole,
  errorsForPath,
  findComponentSchema,
} from "@/features/composer/composerDraft";
import {
  normalizeComponentSlotForApi,
  normalizeComponentSlotForEditing,
  normalizeConfigDraftForEditing,
} from "@/features/composer/composerComponentSlots";
import { prepareConfigDraftForApi } from "@/features/composer/composerStrategyContexts";
import { ListComponentSection } from "@/features/composer/ComposerPanel";

afterEach(() => cleanup());

const SETUP_CATALOG: ComponentCatalog = {
  family: "ema_pullback",
  schema_version: 1,
  sections: [{ section_id: "setup", label: "Setup", role: "setup" }],
  components: [
    {
      component_id: "untouched_anchor_setup",
      role: "setup",
      label: "Untouched anchor setup",
      params_schema: {
        lookback: { type: "integer", label: "Lookback", default: 50 },
        active_bars: { type: "integer", label: "Active bars", default: 3 },
      },
    },
    {
      component_id: "ema_bounce_counter_setup",
      role: "setup",
      label: "EMA bounce counter setup",
      params_storage: "nested",
      params_schema: {
        max_bounces: { type: "integer", label: "Max bounces", default: 3 },
        raw_touch_mode: {
          type: "string",
          label: "Raw touch mode",
          enum: ["range_cross"],
          default: "range_cross",
        },
        touch_lookback_bars: { type: "integer", label: "Touch lookback bars", default: 10 },
        trend_start_confirmation_bars: {
          type: "integer",
          label: "Trend start confirmation bars",
          default: 1,
        },
        trend_break_confirmation_bars: {
          type: "integer",
          label: "Trend break confirmation bars",
          default: 1,
        },
      },
    },
    {
      component_id: "anchor_stack_width_setup",
      role: "setup",
      label: "Anchor stack width setup",
      params_storage: "nested",
      params_schema: {
        atr_timeframe: {
          type: "string",
          label: "ATR timeframe",
          enum: ["base"],
          default: "base",
        },
        atr_period: { type: "integer", label: "ATR period", default: 14 },
        min_current_width_atr: {
          type: "number",
          label: "Min current width ATR",
          default: 2,
        },
        min_recent_width_atr: {
          type: "number",
          label: "Min recent width ATR",
          default: 4,
        },
        width_lookback_bars: {
          type: "integer",
          label: "Width lookback bars",
          default: 80,
        },
      },
    },
  ],
  context_providers: [],
  context_consumption_roles: [],
};

function StatefulSetupList({ initialSetups }: { initialSetups: JsonObject[] }) {
  const [setups, setSetups] = useState(initialSetups);
  return (
    <ListComponentSection
      compact
      title="Setup"
      role="setup"
      pathRole="setups"
      catalog={SETUP_CATALOG}
      strategy={{ setups }}
      slots={setups}
      instanceIndex={0}
      errors={[]}
      onAdd={(componentId) => {
        const schema = findComponentSchema(SETUP_CATALOG, componentId);
        const slotId = `${componentId}_1`;
        setSetups([
          ...setups,
          applyComponentDefaults({ instance_id: slotId, component_id: componentId }, schema),
        ]);
      }}
      onRemove={(index) => setSetups(setups.filter((_, i) => i !== index))}
      onChange={(index, next) => {
        const list = [...setups];
        list[index] = next;
        setSetups(list);
      }}
    />
  );
}

describe("ListComponentSection setup catalog", () => {
  it("lists all setup components from catalog", () => {
    const options = componentsForRole(SETUP_CATALOG, "setup");
    expect(options.map((o) => o.component_id)).toEqual([
      "untouched_anchor_setup",
      "ema_bounce_counter_setup",
      "anchor_stack_width_setup",
    ]);

    render(
      <StatefulSetupList
        initialSetups={[
          {
            instance_id: "anchor",
            component_id: "untouched_anchor_setup",
            lookback: 50,
            active_bars: 3,
          },
        ]}
      />,
    );

    const addSelect = screen.getAllByRole("combobox")[0];
    const optionLabels = Array.from(addSelect.querySelectorAll("option")).map((o) => o.textContent);
    expect(optionLabels).toContain("Untouched anchor setup");
    expect(optionLabels).toContain("EMA bounce counter setup");
  });

  it("shows ema_bounce_counter_setup params after adding second setup", () => {
    render(
      <StatefulSetupList
        initialSetups={[
          {
            instance_id: "anchor",
            component_id: "untouched_anchor_setup",
            lookback: 50,
            active_bars: 3,
          },
        ]}
      />,
    );

    const addSelect = screen.getAllByRole("combobox")[0];
    fireEvent.change(addSelect, {
      target: { value: "ema_bounce_counter_setup" },
    });
    fireEvent.click(screen.getByRole("button", { name: "+ component" }));

    expect(screen.queryByText("Fast EMA")).toBeNull();
    expect(screen.getByText("Max bounces")).toBeTruthy();
  });
});

describe("setup component slot normalization", () => {
  const bounceSchema = findComponentSchema(SETUP_CATALOG, "ema_bounce_counter_setup");

  it("writes backend-compatible nested params on save without legacy EMA keys", () => {
    const editingSlot: JsonObject = {
      instance_id: "bounce_counter",
      component_id: "ema_bounce_counter_setup",
      max_bounces: 3,
      raw_touch_mode: "range_cross",
      touch_lookback_bars: 10,
      trend_start_confirmation_bars: 1,
      trend_break_confirmation_bars: 1,
    };

    const apiSlot = normalizeComponentSlotForApi(editingSlot, bounceSchema);
    expect(apiSlot).toEqual({
      instance_id: "bounce_counter",
      component_id: "ema_bounce_counter_setup",
      params: {
        max_bounces: 3,
        raw_touch_mode: "range_cross",
        touch_lookback_bars: 10,
        trend_start_confirmation_bars: 1,
        trend_break_confirmation_bars: 1,
      },
    });

    const draft = {
      config_version: 1,
      experiment_id: "draft_ema_pullback",
      family: "ema_pullback",
      execution: {},
      instances: [
        {
          instance_id: "instance_1",
          variant: "instance_1",
          market: { symbol: "BTCUSDT", base_timeframe: "5m" },
          strategy: { setups: [editingSlot] },
        },
      ],
    };
    const prepared = prepareConfigDraftForApi(draft, SETUP_CATALOG);
    expect(prepared.instances[0]!.strategy.setups).toEqual([apiSlot]);
    expect(prepared.instances[0]!.strategy).not.toHaveProperty("setup");
  });

  it("migrates legacy singleton setup to setups on load", () => {
    const loadedSlot: JsonObject = {
      component_id: "ema_bounce_counter_setup",
      params: {
        fast_ema: 55,
        anchor_ema: 210,
        slow_ema: 520,
        max_bounces: 4,
        raw_touch_mode: "range_cross",
        touch_lookback_bars: 12,
        trend_start_confirmation_bars: 2,
        trend_break_confirmation_bars: 2,
      },
    };

    const draft = {
      config_version: 1,
      experiment_id: "draft_ema_pullback",
      family: "ema_pullback",
      execution: {},
      instances: [
        {
          instance_id: "instance_1",
          variant: "instance_1",
          market: { symbol: "BTCUSDT", base_timeframe: "5m" },
          strategy: { setup: loadedSlot },
        },
      ],
    };
    const normalized = normalizeConfigDraftForEditing(draft, SETUP_CATALOG);
    const setups = normalized.instances[0]!.strategy.setups as JsonObject[];
    expect(Array.isArray(setups)).toBe(true);
    expect(setups[0]!.instance_id).toBe("setup");
    const editingSlot = normalizeComponentSlotForEditing(setups[0] as JsonObject, bounceSchema);
    expect(editingSlot.fast_ema).toBeUndefined();
    expect(editingSlot.max_bounces).toBe(4);
    expect(normalized.instances[0]!.strategy.setup).toBeUndefined();

    const apiSlot = normalizeComponentSlotForApi(editingSlot, bounceSchema);
    expect(apiSlot.params).not.toHaveProperty("fast_ema");
    expect(apiSlot.params).not.toHaveProperty("anchor_ema");
    expect(apiSlot.params).not.toHaveProperty("slow_ema");
  });

  it("keeps untouched_anchor_setup flat on save", () => {
    const untouchedSchema = findComponentSchema(SETUP_CATALOG, "untouched_anchor_setup");
    const slot: JsonObject = {
      instance_id: "anchor",
      component_id: "untouched_anchor_setup",
      lookback: 40,
      active_bars: 5,
    };
    expect(normalizeComponentSlotForApi(slot, untouchedSchema)).toEqual(slot);
  });

  it("writes anchor_stack_width_setup nested params on save", () => {
    const widthSchema = findComponentSchema(SETUP_CATALOG, "anchor_stack_width_setup");
    const editingSlot: JsonObject = {
      instance_id: "anchor_stack_width",
      component_id: "anchor_stack_width_setup",
      atr_timeframe: "base",
      atr_period: 14,
      min_current_width_atr: 2.5,
      min_recent_width_atr: 4.5,
      width_lookback_bars: 80,
    };
    const apiSlot = normalizeComponentSlotForApi(editingSlot, widthSchema);
    expect(apiSlot.params).toEqual({
      atr_timeframe: "base",
      atr_period: 14,
      min_current_width_atr: 2.5,
      min_recent_width_atr: 4.5,
      width_lookback_bars: 80,
    });
    const loaded = normalizeComponentSlotForEditing(apiSlot, widthSchema);
    expect(loaded.min_current_width_atr).toBe(2.5);
    expect(loaded.width_lookback_bars).toBe(80);
  });

  it("surfaces backend validation errors under setups path", () => {
    const errors = [
      {
        path: "instances[0].strategy.setups[0].params.max_bounces",
        message: "max_bounces must be a positive integer",
      },
    ];
    const scoped = errorsForPath(errors, "instances[0].strategy.setups[0]");
    expect(scoped).toHaveLength(1);
    expect(scoped[0]!.message).toContain("max_bounces");
  });
});
