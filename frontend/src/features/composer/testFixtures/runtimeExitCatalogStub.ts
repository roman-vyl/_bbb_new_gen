import type { ComponentCatalog } from "@/api/types";

import { RUNTIME_EXIT_ROLE } from "@/features/composer/composerRuntimeExitAuthoring";

/** Minimal catalog stub for runtime_exits picker / validation tests. */
export const RUNTIME_EXIT_CATALOG_STUB: ComponentCatalog = {
  family: "ema_pullback",
  schema_version: 1,
  sections: [],
  components: [
    {
      component_id: "rsi_signal_exit",
      role: "exits",
      label: "RSI signal exit",
      allowed_roles: ["exit_policy.signal_exit", RUNTIME_EXIT_ROLE],
    },
    {
      component_id: "ema_cross_loss_exit",
      role: "exits",
      label: "EMA cross loss exit",
      allowed_roles: ["exit_policy.signal_exit", RUNTIME_EXIT_ROLE],
    },
    {
      component_id: "phase_runtime_exit",
      role: "exit_management",
      label: "Phase runtime exit",
      allowed_roles: [RUNTIME_EXIT_ROLE],
    },
    {
      component_id: "atr_stop_loss",
      role: "exits",
      label: "ATR stop loss",
      allowed_roles: ["exit_policy.stop_loss"],
    },
  ],
  context_providers: [],
  context_consumption_roles: [],
};
