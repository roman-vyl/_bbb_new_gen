## Why

The ema_pullback path from external JSON config through backtest, report load, market bundle, and on-demand signal trace has no first-class way to see **how often** each step runs or **how long** it takes. That makes duplicate work (e.g. config parsed twice on `POST /backtests`) and expensive second passes (signal trace rebuilding the entry pipeline) hard to confirm without ad-hoc prints. A small, **opt-in** instrumentation layer preserves zero overhead when disabled and matches what we already prototyped in `research/diagnostics/` and `frontend/src/shared/diagnostics/`.

## What Changes

- **research**: `pipeline_trace` module (`dbg_root`, `dbg_span`, `dbg_mark`, `dbg_flush`) gated by `EMA_PIPELINE_DEBUG=1`; CLI `run_pipeline_debug.py` monkeypatches the ema_pullback + BFF path and prints a stderr table (`REPEAT` when `count > 1` within a root).
- **frontend**: `pipelineDebug.ts` gated by `VITE_EMA_PIPELINE_DEBUG=true`; timings on key API calls; Workbench marks for market cache, signal-trace load policy decisions, auto `dbgFlush` after trace ready; `window.__pipelineDebugFlush()` in dev.
- **Documentation**: short runbook in `research/diagnostics/README.md` (env vars, one-shot CLI, Workbench console).
- **Findings captured in design** (not fixed in this change): double `load_strategy_config_file` on Workbench backtest preflight + run; signal-trace BFF contract mismatch on multi-setup meta (blocks trace spike’s second fetch).

**Non-goals**

- No change to trading logic, report schema, or default production behavior when flags are off.
- No always-on logging middleware in BFF for every HTTP route.
- No automatic fixes for double config load or signal-trace performance (follow-up changes).
- No pytest timing assertions (flaky).

## Capabilities

### New Capabilities

- `pipeline-debug-instrumentation`: Opt-in pipeline step counters and timings for research backtest + Workbench load path.

### Modified Capabilities

- _(none)_

## Impact

| Layer | Scope |
|-------|--------|
| **research** | `research/diagnostics/pipeline_trace.py`, `run_pipeline_debug.py`, README |
| **research_api** | None at runtime unless CLI patches BFF modules locally |
| **frontend** | `shared/diagnostics/pipelineDebug.ts`, hooks in `api/client.ts`, `WorkbenchContext.tsx`, `ComposerPanel.tsx` |
| **data_engine** | _none_ |

**Reference**: [`docs/research/EMA_PULLBACK_PIPELINE_README.md`](../../../docs/research/EMA_PULLBACK_PIPELINE_README.md), [`research/strategies/ema_pullback/README.md`](../../../research/strategies/ema_pullback/README.md).
