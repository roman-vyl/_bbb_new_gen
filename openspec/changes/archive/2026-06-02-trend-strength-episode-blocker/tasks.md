## 1. Spec and feature plumbing

- [x] 1.1 Add `AdxDmiFeatureSpec` (or equivalent) and extend `BlockerRuleSpec` with `TrendStrengthEpisodeBlockerParams`; validate only when `component_id` is `trend_strength_episode_blocker`; reject non-`base` timeframe in MVP; ints: `adx_period`, `peak_lookback_bars`, `max_bars_since_peak`; floats: `min_adx_peak` > 0, `min_current_adx` >= 0, `opposite_di_margin` >= 0
- [x] 1.2 Extend `FeaturePlan` / `PlannedFeature` for `adx_dmi` (ADX, +DI, -DI column ids); wire planning from blocker rules in `features/plan.py`
- [x] 1.3 Implement Wilder ADX/+DI/-DI in `features/calculations.py` with column naming used by the plan; add short fixture test vs known values

## 2. Blocker implementation

- [x] 2.1 Implement `trend_strength_episode_blocker` and `trend_strength_episode_blocker_trace` in `components/trend_strength_episode.py` (backward scan for **most recent qualifying** ADX/DMI bar—**not** local ADX max / argmax; freshness, current ADX floor, opposite DI flip)
- [x] 2.2 Register component in `components/registry.py` with description and trace func
- [x] 2.3 Add `blocker_trend_strength_episode(...)` to `component_builders.py`; wire `execution/signals.py` column bindings (ADX/DI via feature plan)
- [x] 2.4 Extend `research/experiments/config_loader.py` (and instance loader if needed) to parse/validate new blocker params from YAML

## 3. Trace, diagnostics, and tests

- [x] 3.1 Attach blocker trace diagnostics in `execution/signal_trace.py` keyed by blocker `instance_id`
- [x] 3.2 Optional: snapshot entry-bar trend strength fields on closed `trade_records` — **deferred** (not implemented; see `design.md` follow-up)
- [x] 3.3 Add component counter support in `execution/signals.py` (or shared helper) for `trend_strength_episode_blocker`: per side + `instance_id`, include `allowed_count`, `blocked_count`, and `blocked_reason_breakdown` (bar counts per reason on blocked bars); reasons: `no_recent_adx_peak`, `peak_too_old`, `current_adx_too_low`, `opposite_di_flip`, `indicator_not_ready`; merge into variant `component_counters` in JSON report
- [x] 3.4 Unit tests: counter totals match `allowed` mask; breakdown sums to `blocked_count`; at least one fixture asserts a specific reason bucket
- [x] 3.5 Unit tests: long/short symmetry, `no_recent_adx_peak`, `peak_too_old`, `current_adx_too_low`, `opposite_di_flip`, allow path with faded ADX after recent peak; EMA stack not enforced by blocker (direction owns stack)
- [x] 3.6 Add one experiment YAML variant under `research/experiments/configs/ema_pullback/` using the new blocker; run `pytest` and one local `run.py` smoke with the variant; confirm `component_counters` includes breakdown in `latest.json`

## 4. Catalog and documentation

- [x] 4.1 Expose component in research_api catalog if registry is mirrored; ensure Composer can list params without frontend computation
- [x] 4.2 Update `docs/research/EMA_PULLBACK_PIPELINE_README.md` blocker list from `planned` to implemented when code lands (during apply, not before)

## 5. Verification

- [x] 5.1 Confirm default/baseline specs still use prior blockers only (`no_blockers` or existing tuple) — no behavior change
- [x] 5.2 Manual: inspect variant `component_counters` for `trend_strength_episode_blocker` (`allowed_count`, `blocked_count`, `blocked_reason_breakdown`) and signal trace per-bar `blocked_reason` on a short date range
- [x] 5.3 `python -m pytest -q` for touched research modules; `git diff --stat data_engine/` is empty
