import type { JsonObject } from "@/api/types";

export type AnchorStackEmaRole = "fast" | "anchor" | "slow";

export type AnchorStackPeriods = {
  fast: number;
  anchor: number;
  slow: number;
};

export class AnchorStackParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AnchorStackParseError";
  }
}

function readPeriod(stack: JsonObject, role: AnchorStackEmaRole): number {
  const node = stack[role];
  if (node === null || typeof node !== "object" || Array.isArray(node)) {
    throw new AnchorStackParseError(
      `strategy_spec.anchor_stack.${role} must be an object with period`,
    );
  }
  const period = (node as JsonObject).period;
  if (typeof period !== "number" || !Number.isInteger(period) || period <= 0) {
    throw new AnchorStackParseError(
      `strategy_spec.anchor_stack.${role}.period must be a positive integer`,
    );
  }
  return period;
}

/** Periods from run report only — no draft/defaults/fallback. */
export function anchorStackPeriodsFromStrategySpec(strategySpec: JsonObject): AnchorStackPeriods {
  const stack = strategySpec.anchor_stack;
  if (stack === null || typeof stack !== "object" || Array.isArray(stack)) {
    throw new AnchorStackParseError("strategy_spec.anchor_stack is required");
  }
  const fast = readPeriod(stack as JsonObject, "fast");
  const anchor = readPeriod(stack as JsonObject, "anchor");
  const slow = readPeriod(stack as JsonObject, "slow");
  if (!(fast < anchor && anchor < slow)) {
    throw new AnchorStackParseError(
      "strategy_spec.anchor_stack must satisfy fast.period < anchor.period < slow.period",
    );
  }
  return { fast, anchor, slow };
}
