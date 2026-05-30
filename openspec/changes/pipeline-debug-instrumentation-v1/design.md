## Context

The ema_pullback pipeline (see repo README) flows:

```text
JSON config → config_loader / instance_loader → runner (candles once) → run_strategy_spec
  → feature plan → features → context bundle → signals → exits → vectorbt → trade records → JSON report

Workbench (separate requests):
  POST /backtests → same runner path (with preflight validate)
  GET report → GET chart-bundle → GET signal-trace (rebuilds trace pipeline on window)
```

Initial diagnostic run (`run_pipeline_debug.py`, BTCUSDT 1h, ~53k bars) showed:

| Finding | Evidence |
|---------|----------|
| Double config parse on one backtest | `REPEAT config.read_file`, `load_strategy_config`, `load_family_instance` — count **2** (`backtest_service` preflight + `run_strategy_specs_from_config`) |
| No inner loop in single variant backtest | `runner.load_candles_once`, `backtest.signals/exits/add_features` — count **1** |
| Dominant cost | `backtest.run_strategy_spec` ~26s (mostly vectorbt + extract inside; not yet a separate span) |
| Signal trace spike | Second fetch not exercised — `SignalTraceMeta` validation error on `component_ids.setups` list vs string (existing contract gap) |

Instrumentation uses **monkeypatch in the CLI runner** so research/backtest hot paths stay unmodified when debug is off. Frontend uses thin wrappers only where network/policy decisions matter.

## Goals / Non-Goals

**Goals:**

- Opt-in, zero cost when env flags unset.
- Stable step ids for grep (`config.load_strategy_config`, `backtest.signals`, `wb.signal_trace_decision`, etc.).
- stderr summary per `dbg_root` with `REPEAT` highlight for duplicate steps.
- Browser `console.table` summary via `dbgFlush`.
- Document how to run CLI + Workbench checks.

**Non-Goals:**

- Permanent inline `dbg_span` in every `backtest.py` line (optional follow-up).
- Fixing double config load or caching signal trace in run artifacts.
- Production observability stack (OpenTelemetry, etc.).

## Decisions

### D1 — Env-gated module, not compile-time debug

**Choice:** `EMA_PIPELINE_DEBUG` / `VITE_EMA_PIPELINE_DEBUG` check once; all helpers no-op immediately.

**Rationale:** Safe for normal Workbench and CI; no stderr noise.

### D2 — Research: monkeypatch CLI vs inline hooks

**Choice:** `run_pipeline_debug.py` patches modules before invoking `backtest_service` / `signal_trace_service`; core libraries unchanged.

**Rationale:** Matches throwaway spike validation; minimal merge conflict surface. Inline hooks in `backtest_service` (dbg_root + flush) can be added later if operators want traces without the CLI.

**Alternative rejected:** Only inline hooks across 10+ files — higher maintenance for same data.

### D3 — Frontend: API + Workbench policy marks

**Choice:** `dbgTimed` on `runBacktest`, `fetchRunReport`, `fetchChartMarketBundle`, `fetchSignalTrace`; `dbgMark` on market cache hit, signal-trace `decideSignalTraceLoad` action, backtest click.

**Rationale:** Surfaces duplicate fetches and dedup skips without instrumenting React render loops.

### D4 — Step id vocabulary

Stable prefixes: `config.*`, `runner.*`, `backtest.*`, `context.evaluate`, `signal_trace.*`, `bff.*`, `api.*`, `wb.*`.

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Monkeypatch misses calls that imported functions before patch | Patch both defining module and consumer namespace (`runner.run_strategy_spec`, `bt.build_signals_from_spec`) — documented in runner script |
| FE bundle includes debug helpers | Tree-shaken when flag false; no `dbgFlush` in prod unless env set at build time |
| Misread “REPEAT” across roots | `REPEAT` only within one `dbg_root` flush block |

## Migration Plan

1. Rename spike files to permanent names (`pipeline_trace.py`, `pipelineDebug.ts`).
2. Add `research/diagnostics/README.md`.
3. Operators enable flags locally; no deploy config change required.

Rollback: unset env vars; optional revert diagnostics package.

## Open Questions

- Add `backtest.vectorbt` span inside `run_strategy_spec`?
- Inline `dbg_root("bff.backtest")` in `backtest_service` so uvicorn backtests print tables without CLI?
- Fix `SignalTraceMeta` for multi-setup strategies so trace cache test is reliable?
