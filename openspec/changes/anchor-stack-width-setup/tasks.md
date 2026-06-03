## 1. Research — spec and registry

- [ ] 1.1 Add `ANCHOR_STACK_WIDTH_SETUP_COMPONENT`, `AnchorStackWidthSetupSpec`, and validation in `research/strategies/ema_pullback/spec.py`
- [ ] 1.2 Wire `SetupRuleSpec` type checks and config identity for new params
- [ ] 1.3 Register `anchor_stack_width_setup` / trace in `components/registry.py`

## 2. Research — feature plan and runtime

- [ ] 2.1 Extend `features/plan.py` to map anchor_stack EMA columns + ATR for `AnchorStackWidthSetupSpec`
- [ ] 2.2 Implement `anchor_stack_width_setup_trace` and `anchor_stack_width_setup` in `components/setup.py`
- [ ] 2.3 Dispatch in `setup_runtime.py` (`run_setup_mask`, `run_setup_trace`)
- [ ] 2.4 Parse YAML/config in `instance_loader.py` and add `component_builders.py` helpers

## 3. Research — signal trace, counters, chart events

- [ ] 3.1 Register trace callable and setup internals in `execution/signal_trace.py`
- [ ] 3.2 Add component counters (`allowed_count`, `blocked_count`, `blocked_reason_breakdown`)
- [ ] 3.3 Emit allowed episodes only: `span_start`/`Width ok` on false→true, `span_end`/`Width end` on true→false; tooltips per design; 2 events per continuous allowed run
- [ ] 3.4 Verify HTF context EMA overlays unchanged on variant with `strategy.contexts` (see `workbench-chart-htf-context-overlays`)

## 4. Research — tests

- [ ] 4.1 Add `tests/test_anchor_stack_width_setup.py` (inclusive rolling max window, no recent>current requirement, allow/block reasons, side-neutral width)
- [ ] 4.2 Extend config loader / feature plan tests (valid config, invalid params, ATR dependency)
- [ ] 4.3 Multi-setup AND test with existing setup component
- [ ] 4.4 Confirm `git diff --stat data_engine/` is empty

## 5. research_api — catalog

- [ ] 5.1 Add `anchor_stack_width_setup` to `component_catalog.py` (setup role, param schema, help text)
- [ ] 5.2 Extend API/catalog tests for new setup entry

## 6. Frontend — Composer and chart

- [ ] 6.1 Verify Composer lists setup fields from catalog (ATR timeframe/period, width thresholds, lookback)
- [ ] 6.2 Add/extend Composer save-load test preserving params after reload
- [ ] 6.3 Add chart presentation for `Width ok` / `Width end` spans (formatter optional) + unit tests for transition-only emission
- [ ] 6.4 Chart acceptance: episodes on `setup_allowed` transitions only; setup role toggle; width tooltips; no per-bar spam; no viewport/subchart/runtime changes

## 7. Acceptance

- [ ] 7.1 Run targeted pytest for new and affected modules
- [ ] 7.2 Optional: add experiment YAML example under `research/experiments/configs/ema_pullback/`
- [ ] 7.3 Archive change via `/opsx:archive` after review
