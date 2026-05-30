## 1. Research diagnostics module

- [x] 1.1 Add `research/diagnostics/pipeline_trace.py` (`dbg_root`, `dbg_span`, `dbg_mark`, `dbg_flush`, `EMA_PIPELINE_DEBUG`)
- [x] 1.2 Add `research/diagnostics/run_pipeline_debug.py` (monkeypatch + sample config + backtest + optional double signal-trace fetch)
- [x] 1.3 Rename spike filenames to permanent names; update imports and module docstrings
- [x] 1.4 Add `research/diagnostics/README.md` (CLI + env + interpreting `REPEAT`)
- [x] 1.5 Add `debug/run-pipeline-debug.bat` + `debug/reports/` for saved logs

## 2. Frontend diagnostics

- [x] 2.1 Add `frontend/src/shared/diagnostics/pipelineDebug.ts`
- [x] 2.2 Wrap `runBacktest`, `fetchRunReport`, `fetchChartMarketBundle`, `fetchSignalTrace` with `dbgTimed`
- [x] 2.3 Workbench: market cache / signal-trace policy marks + `dbgFlush` after trace ready
- [x] 2.4 Composer: `wb.backtest_click` mark
- [x] 2.5 Rename `_pipelineDebugSpike.ts` → `pipelineDebug.ts` and fix imports

## 3. Verification

- [x] 3.1 CLI run on BTCUSDT 1h — document double config load (`REPEAT` ×2) in design
- [x] 3.2 Manual Workbench run with `VITE_EMA_PIPELINE_DEBUG=true` — capture console table once
- [ ] 3.3 `npm run build` in `frontend/` (ensure diagnostics imports typecheck)

## 4. Follow-ups (out of scope for this change)

- [ ] 4.1 Remove duplicate `load_strategy_config_file` in `backtest_service` preflight
- [ ] 4.2 Add `backtest.vectorbt` span in runner patches or inline `backtest.py`
- [ ] 4.3 Fix `SignalTraceMeta` multi-setup fields so signal-trace debug run completes
