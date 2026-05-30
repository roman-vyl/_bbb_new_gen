## Context

Today `ema_pullback` external instances use `strategy.setup` as a **single object** (`component_id` + params). The loader maps it to one typed `SetupSpec` on `EmaPullbackStrategySpec` and a single `components.setup` string. Signal build/trace call one setup function and expose one `setup_ok` lane and one `internals["setup"]` blob—fields like `setup_allowed` collide if two setups run.

`blockers` already demonstrate the target shape: a **non-empty list** with unique `instance_id`, catalog `component_id`, independent evaluation, AND composition into `blockers_ok`, list UI in Composer, and per-instance trace/events.

Relevant code today:

- `research/strategies/ema_pullback/spec.py` — `ComponentStackSpec.setup: str`, `EmaPullbackStrategySpec.setup: SetupSpec`
- `research/strategies/ema_pullback/instance_loader.py` — `_parse_setup(strategy["setup"])`
- `research/strategies/ema_pullback/features/plan.py` — single `isinstance(spec.setup, …)` branch
- `research/strategies/ema_pullback/execution/signals.py` / `signal_trace.py` — one setup branch
- `frontend/src/features/composer/composerComponentSlots.ts` — `setup` in `SINGLETON_ROLES`
- `frontend/src/features/composer/ComposerPanel.tsx` — `SingletonComponentSection` for setup

## Goals / Non-Goals

**Goals**

- One external source of truth: `strategy.setups[]`.
- AND-composed setup gate at runtime; components remain independent (no cross-setup imports).
- Loader-only migration from legacy `strategy.setup` object → one-element `setups`.
- Feature plan deduplication across setup instances.
- Trace/diagnostics/events namespaced by `instance_id`.
- Catalog-driven Composer list UI; no hardcoded setup component ids in frontend.

**Non-Goals**

- Changing untouched-anchor or bounce-counter formulas.
- `data_engine/`, new setup components, chart role toggles, trigger/blocker/exit edits.

## Decisions

### Decision: external field `strategy.setups` (array), not overloaded singleton `setup`

**Choice:** Add/replace with `strategy.setups: SetupInstanceWire[]` (non-empty). Each element:

```json
{
  "instance_id": "untouched_anchor",
  "component_id": "untouched_anchor_setup",
  "lookback": 50,
  "active_bars": 3
}
```

`ema_bounce_counter_setup` continues to use catalog `params_storage: "nested"` → wire shape `{ "instance_id", "component_id", "params": { ... } }` (same as today’s singleton object, plus `instance_id`).

**Rejected alternatives**

| Alternative | Why rejected |
|-------------|--------------|
| Turn `setup` into a JSON array in place | Same key name changes type (object→array); breaks naive validators and is harder to migrate incrementally than a new key |
| Parallel `setup` + `setups` at runtime | Two sources of truth; forbidden by product requirement |
| Only internal stack, wire stays singleton | Composer/API cannot express two setups |

**Rationale:** Matches `blockers` authoring UX, validation errors (`setups[0].lookback`), and frontend list-slot helpers already proven in Composer.

### Decision: loader-only legacy migration; runtime reads `setups` only

**Migration rule (load path only):**

- If `strategy.setups` present → parse list (required for new configs).
- Else if legacy `strategy.setup` object present → normalize to `setups: [{ instance_id: "setup", ...spread legacy fields }]`, then parse as list.
- Else → validation error.

**Save/validate/report emit:** always `setups`; never write legacy `setup`.

**Reject:** keeping `spec.setup` alongside `spec.setups` in `EmaPullbackStrategySpec`.

### Decision: internal `SetupRuleSpec` list on strategy spec

Replace `EmaPullbackStrategySpec.setup: SetupSpec` with:

```python
setups: tuple[SetupRuleSpec, ...]  # len >= 1, unique instance_id
```

`SetupRuleSpec` (frozen dataclass):

- `instance_id: str`
- `component_id: str` (catalog id)
- `params: SetupParamsSpec` where `SetupParamsSpec = UntouchedAnchorSetupSpec | EmaBounceCounterSetupSpec` (existing typed param objects, **without** duplicating component_id inside params)

Remove `ComponentStackSpec.setup: str` and `_validate_setup_component_matches_spec`. Component registry resolution uses each rule’s `component_id` at execution time.

`strategy_spec_to_dict` / `strategy_spec_config_id` serialize `setups` only; legacy `setup` key removed from canonical dict.

### Decision: list order is significant for `config_id`

**Choice:** `strategy_spec_config_id` hashes the canonical JSON **including `setups` array order** (same as `blockers` today).

**Authors MUST** use stable, meaningful `instance_id` values; reordering the list changes `config_id`.

**Rejected:** sorting by `instance_id` before hash—surprising when UI order reflects author intent; can be a follow-up if needed.

### Decision: runtime AND composition

Per enabled side:

```text
setup_ok = setup_1_ok & setup_2_ok & ... & setup_n_ok
```

Each setup instance:

1. Resolve callable from registry by `component_id`.
2. Build kwargs from typed `params` + `FeaturePlan` columns (per-component, as today).
3. No shared mutable state between instances.

`compose_final_signals(..., setup_ok=setup_ok, ...)` unchanged.

Empty/disabled setups: **not supported**—`setups` must contain ≥1 instance (product: every strategy has at least one setup gate). “Disable a gate” = remove instance from list in Composer.

### Decision: feature plan aggregation

`build_feature_plan_from_strategy_spec`:

- Iterate `spec.setups`.
- For each rule, add EMA/indicator requirements using existing per-component logic (today’s branches for bounce-counter EMA periods, untouched uses anchor column only).
- Reuse existing `seen: set[str]` dedup on `feature_id` so identical EMA periods from anchor stack + bounce counter are computed once.
- `FeaturePlan.setup_columns` becomes **per-instance** map, e.g. `setup_columns_by_instance_id: dict[str, dict[str, str]]`, or retain flat names only where a single setup used them—prefer explicit per-instance map to avoid silent collisions.

### Decision: signal trace and report internals namespacing

**Side trace top-level**

- Keep aggregate `setup_ok` (AND of instances).
- Replace single `internals["setup"]` with `internals["setups"][instance_id] = { ... per-component trace dict ... }`.

**Per-instance trace dict** keeps component-native keys (`setup_allowed`, `touch`, etc.) unchanged inside each instance bucket.

**Trade/report entry diagnostics** (when present): nest under setup instance, e.g. `entry_setup_diagnostics[instance_id]` or prefix keys—pick one shape in implementation; spec requires **no overwrite** when two setups expose `setup_allowed` at entry bar.

**Component events:** each event carries `role: "setup"`, `component_id`, and **`instance_id`** (required when multiple setups exist; always emit for setup events after this change). Chart markers stay generic (tooltip uses `instance_id`).

### Decision: remove `components.setup` from wire format

External instance JSON:

- `direction`, `trigger`, `risk` remain singletons (unchanged).
- `blockers`, **`setups`**, `trade_management.exit_policy.*` are lists.
- Drop `components.setup` string from saved configs and from `ComponentStackSpec` (registry lookup per setup rule).

Reports embedding old `strategy_spec` with singleton `setup`: only the **instance config loader** may migrate that wire shape to `setups[]` when re-loading config. Embedded **signal trace** in old reports is not migrated or read.

### Decision: Composer UI — reuse blockers list pattern

- Remove `setup` from `SINGLETON_ROLES` in `composerComponentSlots.ts`.
- Setup collapsible uses list slot component (same affordances as blockers): Add setup → catalog picker filtered `role === "setup"`, per-slot param form from catalog schema, Remove, unique `instance_id` validation client-side before validate API.
- Loading legacy draft: normalize `setup` object → `setups` array in `normalizeStrategyForEditing` (mirror loader defaults, default `instance_id: "setup"`).
- Saving: `normalizeStrategySingletonsForApi` no longer touches setup; new `normalizeStrategySetupsForApi` nests params per catalog.

**No** `if (component_id === "ema_bounce_counter_setup")` branches—only catalog schema driven.

### Decision: minimum viable dual-setup acceptance config

Documented golden example for tests and manual QA:

```json
"setups": [
  {
    "instance_id": "untouched_anchor",
    "component_id": "untouched_anchor_setup",
    "lookback": 50,
    "active_bars": 3
  },
  {
    "instance_id": "bounce_counter",
    "component_id": "ema_bounce_counter_setup",
    "params": {
      "fast_ema": 50,
      "anchor_ema": 200,
      "slow_ema": 500,
      "max_bounces": 3,
      "raw_touch_mode": "range_cross",
      "touch_lookback_bars": 10,
      "trend_start_confirmation_bars": 1,
      "trend_break_confirmation_bars": 1
    }
  }
]
```

Bounce-counter EMA periods may match anchor stack periods; feature plan must still dedupe.

## Legacy cleanup (explicit)

| Remove | Notes |
|--------|------|
| `EmaPullbackStrategySpec.setup` singleton field | Replaced by `setups` tuple |
| `ComponentStackSpec.setup: str` | Per-rule `component_id` on `SetupRuleSpec` |
| `_validate_setup_component_matches_spec` | Obsolete |
| `_parse_setup` returning single tuple | → `_parse_setups` list |
| Runtime `isinstance(spec.setup, …)` branches | Loop `spec.setups` |
| `SingletonComponentSection` for setup | List section |
| `setSingletonComponent(..., "setup", ...)` | List slot add/update/remove |
| Validation assuming one setup object | API + draft validators |
| Permanent dual-read of `setup` + `setups` | **Forbidden** after loader migration |
| `internals["setup"]` singleton trace readers | Remove from runtime, frontend, and report consumers |
| Report-consumer fallback `internals.setup` → `internals.setups` | **Forbidden** |

Temporary **loader migration** for `strategy.setup` only (external config wire); delete migration helpers once repo configs are migrated (optional follow-up task).

### Decision: legacy policy (canonical)

| Surface | Legacy supported? | Rule |
|---------|-------------------|------|
| External config (`strategy.setup` object) | **Yes, loader-only** | Normalize to `strategy.setups[]` at load; canonical save emits `setups[]` only |
| Runtime spec / signals / trace emission | **No** | `spec.setups` only; trace emits `internals["setups"][instance_id]` only |
| Saved reports / embedded trace | **No** | Old reports with `internals["setup"]` are obsolete test artifacts; do not read |
| Workbench / frontend report consumers | **No** | MUST read `internals["setups"][instance_id]` only; no dual-read, no fallback |
| Chart component events | **No** | New events always include `instance_id`; no compatibility shim for pre-stack reports |

**Legacy report / trace compatibility is intentionally not supported.**

Old reports containing singleton setup trace shape such as `internals["setup"]` are considered obsolete test artifacts.

Workbench/report consumers MUST read only the new namespaced setup shape: `internals["setups"][instance_id]`.

No report-consumer dual-read, no fallback from `internals.setup` to `internals.setups`, and no runtime compatibility path.

Only the external config loader may migrate legacy `strategy.setup` to `strategy.setups[]`.

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Old experiment JSON files with `setup` | Loader migration + Composer normalize on load |
| Authors duplicate instance_id | Loader + client validation (same as blockers) |
| config_id churn when migrating shape | Expected one-time; document |
| Stale tests/fixtures still assert `internals["setup"]` | Grep and update or delete; no old-trace compatibility tests (see tasks §8) |

## Migration plan

1. Implement loader: accept `setup` → emit internal `setups`; tests for legacy files.
2. Switch research execution/trace/plan to `spec.setups`.
3. Update research_api validate + catalog (no singleton setup schema).
4. Composer list UI + draft normalization; save only `setups`.
5. Update golden configs under `research/experiments/configs/`.
6. Manual Workbench: add both setups, validate, run backtest, confirm chart events show two `instance_id` tooltips.

## Open questions

_None blocking implementation._ Default `instance_id` for migrated singleton: `"setup"` (stable, single-instance configs keep readable paths).
