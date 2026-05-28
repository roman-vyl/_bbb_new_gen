## Phase 1 — research: honest trade attribution + trace alignment

- [x] 1.1 `consumption_attribution_for_trade`: set entry `applied` from `htf_state_gate` at `entry_idx` (same helper as trace); document exit `applied` semantics
- [x] 1.2 Plumb `ContextBundle` or precomputed gate into `extract_trade_records` / backtest so trade rows cannot drift from trace
- [x] 1.3 pytest: entry bar blocked → `entry_context_consumption.applied == false`; allowed → `true`
- [x] 1.4 (Optional) Enrich blocker trace `outcome` with `state_at_bar` + `allowed_states` for `htf_state_gate`
- [x] 1.5 pytest: trace `outcome` matches gate series when 1.4 enabled

## Phase 2 — frontend: shared causal lookup

- [x] 2.1 Add `tradeContextCausalDiagnostics.ts` — resolve bar index from trade times; lookup consumption + HTF state; format allow/block labels
- [x] 2.2 Unit tests: entry/exit bar index resolution; gate formatting; missing trace window
- [x] 2.3 Pass `signalTrace` + `signalTraceStatus` into `ChartTradeDiagnostics` from Chart panel / Workbench

## Phase 3 — Chart trade panel causal sections

- [x] 3.1 Split UI: **Configured consumer** (existing v5 wiring) vs **Entry bar decision** / **Exit bar decision** (causal from trace)
- [x] 3.2 Entry causal: `state`, `allowed_states`, `gate` (from `context_applied`), `context_ref`, `policy_id`, `instance_id` when present
- [x] 3.3 Exit causal: `htf_state`, active `profile` from `outcome`, `context_ref`, `policy_id`; do not mislabel exit `context_applied` as gate
- [x] 3.4 Empty states: trace not loaded; bar outside window; overlay ref mismatch — explicit copy, no silent fallback
- [x] 3.5 Vitest: trade with trace fixture shows `block`/`allow` and state on entry bar; wiring section still present
- [x] 3.6 Bar Inspector: optional refactor to shared formatters only (no behavior change)

## Phase 4 — verification

- [x] 4.1 `pytest -q tests/test_context_consumption_trace.py` (+ new causal attribution tests)
- [x] 4.2 `cd frontend && npm test -- --run src/features/chart`
- [ ] 4.3 Manual Workbench: select trade → entry bar shows state + gate; click entry bar in chart → Bar Inspector matches
- [x] 4.4 Update `research/strategies/ema_pullback/README.md` — wiring vs causal diagnostic layers

## Cross-cutting

- [ ] X.1 (Optional) Reports `TradeDetail` causal sections — same helper as Chart
- [ ] X.2 OpenSpec archive after acceptance; link from `strategy-level-contexts-v1` design §11 as follow-up
