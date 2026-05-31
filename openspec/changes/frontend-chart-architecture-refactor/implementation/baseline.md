# Chart runtime refactor — baseline lock

Captured before controller cutover implementation.

## Git

| Field | Value |
|-------|-------|
| Branch | `BIG-frontend-refactoring` (user-created cutover branch) |
| Starting commit | `0bc6e070a87912c83d5f1a49f50697353cfe7501` |
| Working tree at lock | clean |

## Purpose

Baseline is **not** a behavior parity target. It records pre-refactor debug counters on a heavy run so post-cutover acceptance can show:

- fewer `chart.setData.*` calls during active pan
- fewer `api.fetchSignalTrace` / `wb.signal_trace.fetch_start` during active pan
- stable `chart.viewport.apply_trade_focus` (not during user pan)
- no viewport flash on fast May → Feb/Jan pan

## How to capture counters

1. Set `VITE_EMA_PIPELINE_DEBUG=true` in `frontend/.env.local` (or env for dev server).
2. Start Workbench + BFF; open Chart on heavy **BTCUSDT 5m** run (full report range cached when applicable).
3. Run scenarios **before** code changes:
   - initial load (wait for events without manual pan)
   - fast pan May → Feb/Jan (10–20s)
   - edge pan until safe zone, release
   - select trade while idle; select trade during pan
4. In browser console: `__pipelineDebugFlush("baseline-pre-cutover")` then `copy(__pipelineDebugExport())`.
5. Save export under `debug/reports/baseline-pre-cutover-<date>.json` (manual).

## Key steps to compare (from `pipelineDebug.ts`)

| Step id | Meaning |
|---------|---------|
| `chart.setData.candles` | Candle series setData |
| `chart.setData.anchor_ema` | Anchor EMA setData |
| `chart.setData.aux_htf` | Aux/HTF line setData |
| `chart.viewport.apply_trade_focus` | Trade focus viewport apply |
| `chart.viewport.restore_after_shift` | Post window-swap restore |
| `chart.viewport.apply_skipped_user_pan` | Focus suppressed during pan |
| `wb.pan.shift_requested` | Pan triggered window shift |
| `wb.signal_trace.fetch_start` | Trace network fetch started |
| `api.fetchSignalTrace` | BFF trace API timing |

## Post-cutover target (qualitative)

- Active pan: no burst of `setData` or `fetch_start` per boundary crossing
- One `shift_applied` + one `restore_after_shift` per accepted pending shift commit
- `traceReady` path: display apply only, no new viewport apply
