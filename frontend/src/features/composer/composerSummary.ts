import type { ComponentCatalog, JsonObject, StrategyInstanceDraft } from "@/api/types";

import { findComponentSchema } from "./composerDraft";

export function componentLabel(catalog: ComponentCatalog, componentId: string): string {
  return findComponentSchema(catalog, componentId)?.label ?? componentId;
}

function readComponentId(value: JsonObject | undefined): string {
  return String(value?.component_id ?? "");
}

function tradeSidesLabel(sides: JsonObject | undefined): string {
  const long = Boolean(sides?.long);
  const short = Boolean(sides?.short);
  if (long && short) return "long + short";
  if (long) return "long";
  if (short) return "short";
  return "—";
}

export type PipelineStep = {
  role: string;
  title: string;
  value: string;
  count?: number;
};

export function buildPipelineSteps(
  strategy: JsonObject,
  catalog: ComponentCatalog,
): PipelineStep[] {
  const blockers = (strategy.blockers as JsonObject[] | undefined) ?? [];
  const tradeManagement = (strategy.trade_management as JsonObject | undefined) ?? {};
  const exitPolicy = (tradeManagement.exit_policy as JsonObject | undefined) ?? {};
  const alwaysOn = ((exitPolicy.always_on as JsonObject | undefined)?.exits as JsonObject[] | undefined) ?? [];
  const profiles = (exitPolicy.profiles as JsonObject | undefined) ?? {};
  const aligned = ((profiles.aligned as JsonObject | undefined)?.exits as JsonObject[] | undefined) ?? [];
  const countertrend =
    ((profiles.countertrend as JsonObject | undefined)?.exits as JsonObject[] | undefined) ?? [];
  const neutral = ((profiles.neutral as JsonObject | undefined)?.exits as JsonObject[] | undefined) ?? [];
  const exits = [...alwaysOn, ...aligned, ...countertrend, ...neutral];

  const directionId = readComponentId(strategy.direction as JsonObject);
  const setupId = readComponentId(strategy.setup as JsonObject);
  const triggerId = readComponentId(strategy.trigger as JsonObject);
  const riskId = readComponentId(strategy.risk as JsonObject);

  return [
    {
      role: "direction",
      title: "Direction",
      value: componentLabel(catalog, directionId) || "—",
    },
    {
      role: "setup",
      title: "Setup",
      value: componentLabel(catalog, setupId) || "—",
    },
    {
      role: "trigger",
      title: "Trigger",
      value: componentLabel(catalog, triggerId) || "—",
    },
    {
      role: "blockers",
      title: "Blockers",
      value:
        blockers.length === 0
          ? "none"
          : blockers
              .map((s) => componentLabel(catalog, readComponentId(s)))
              .join(", "),
      count: blockers.length,
    },
    {
      role: "risk",
      title: "Risk",
      value: componentLabel(catalog, riskId) || "—",
    },
    {
      role: "exits",
      title: "Exits",
      value:
        exits.length === 0
          ? "none"
          : exits.map((s) => componentLabel(catalog, readComponentId(s))).join(", "),
      count: exits.length,
    },
  ];
}

export function instanceCardMeta(
  inst: StrategyInstanceDraft,
  catalog: ComponentCatalog,
): { sides: string; blockerCount: number; exitCount: number; direction: string } {
  const strategy = inst.strategy as JsonObject;
  const blockers = (strategy.blockers as JsonObject[] | undefined) ?? [];
  const tradeManagement = (strategy.trade_management as JsonObject | undefined) ?? {};
  const exitPolicy = (tradeManagement.exit_policy as JsonObject | undefined) ?? {};
  const alwaysOn = ((exitPolicy.always_on as JsonObject | undefined)?.exits as JsonObject[] | undefined) ?? [];
  const profiles = (exitPolicy.profiles as JsonObject | undefined) ?? {};
  const aligned = ((profiles.aligned as JsonObject | undefined)?.exits as JsonObject[] | undefined) ?? [];
  const countertrend =
    ((profiles.countertrend as JsonObject | undefined)?.exits as JsonObject[] | undefined) ?? [];
  const neutral = ((profiles.neutral as JsonObject | undefined)?.exits as JsonObject[] | undefined) ?? [];
  const exits = [...alwaysOn, ...aligned, ...countertrend, ...neutral];
  const directionId = readComponentId(strategy.direction as JsonObject);

  return {
    sides: tradeSidesLabel(strategy.trade_sides as JsonObject),
    blockerCount: blockers.length,
    exitCount: exits.length,
    direction: componentLabel(catalog, directionId) || "—",
  };
}
