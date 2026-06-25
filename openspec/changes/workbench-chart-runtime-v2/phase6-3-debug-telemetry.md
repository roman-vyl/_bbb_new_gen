# Phase 6.3-debug — Owner/Domain/Phase Telemetry (before any cutover)

**Status:** Not started — **mandatory gate before 6.3A**

**Phase debug tag:** `phase: 6.3-debug`

## Why this step exists

Staged cutover review depends on opening the Chart tab and reading the console to see which pipeline owns each domain. Without explicit `owner` / `domain` / `phase` telemetry, existing marks (`wb.chart_window_slice`, `chart.setData.*`, `wb.trace_display.*`) are ambiguous: old owner, v2 owner, adapter, or mixed path.

This step wires the debug layer **before** any production owner transfer. After 6.3-debug, every subsequent slice (6.3A–6.3F) must be verifiable in the browser without guessing.

## Goal

On cold Chart open (and on any chart interaction), the console and `__pipelineDebugExport()` MUST show, for each chart-runtime domain:

| Domain key | `owner` value (pre-cutover) | `owner` value (after slice N) |
|---|---|---|
| `model` | `old_production` | `runtime_v2_production` from 6.3A onward |
| `render_window` | `old_production` | `runtime_v2_production` from 6.3B onward |
| `viewport` | `old_production` | `runtime_v2_production` from 6.3C onward |
| `trace` | `old_production` | `runtime_v2_production` from 6.3D onward |
| `aux_overlay` | `old_production` | `runtime_v2_production` from 6.3E onward |
| `market` | `old_production` | `runtime_v2_production` from 6.3F onward |

Plus top-level `phase`: `6.3-debug` | `6.3A` | `6.3B` | `6.3C` | `6.3D` | `6.3E` | `6.3F`.

## Deliverables (code — this step only)

1. **`ChartRuntimeDomainOwners` type** in `runtimeTypes.ts`:
   ```ts
   type ChartRuntimeDomainOwner = "old_production" | "runtime_v2_production";
   type ChartRuntimeDomain = "model" | "render_window" | "viewport" | "trace" | "aux_overlay" | "market";
   type ChartRuntimeDomainOwners = Record<ChartRuntimeDomain, ChartRuntimeDomainOwner>;
   type ChartRuntimeCutoverPhase = "6.3-debug" | "6.3A" | "6.3B" | "6.3C" | "6.3D" | "6.3E" | "6.3F";
   ```

2. **`debug.domainOwners` and `debug.cutoverPhase`** on `ChartRuntimeDebugSnapshot` (and exported via `__pipelineDebugExport()` when debug is enabled).

3. **Central cutover config** (e.g. `chartRuntimeCutoverConfig.ts`) — single place to set active `cutoverPhase` and per-domain owners. Pre-6.3A: all domains `old_production`, phase `6.3-debug`. Each later slice updates only the config; no scattered booleans.

4. **Console emission** on Chart tab activation and on domain-relevant `dbgMark` paths:
   - `wb.cutover.domain_owners` — full `domainOwners` + `phase` snapshot
   - Existing marks (`wb.load.market_bundle_ready`, `wb.render_window.init`, `chart.setData.candles`, `wb.trace_display.apply_current_window`, …) gain optional payload fields `{ owner, domain, phase }` resolved from cutover config at emit time

5. **Tests:**
   - Pre-cutover: all domains `old_production`, phase `6.3-debug`
   - Simulated 6.3A config: only `model` → `runtime_v2_production`; others `old_production`
   - No domain has two owners (static guard)

## Explicitly forbidden in 6.3-debug

- No production owner transfer (no adapter cutover, no v2 fetch/cache/viewport)
- No changes to `chartValue` production data path
- No guessing owner from log message text alone — owner MUST come from `domainOwners` config

## Browser acceptance (gate for 6.3A)

With debug enabled, cold Chart open:

- [ ] Console shows `wb.cutover.domain_owners` (or equivalent) with all six domains `old_production` and `phase: 6.3-debug`
- [ ] `chart.setData.candles` mark includes `owner`, `domain`, `phase` (domain `model` or `render_window` as appropriate for that mark)
- [ ] `wb.trace_display.apply_current_window` includes `owner: old_production`, `domain: trace`
- [ ] `__pipelineDebugExport().debug.domainOwners` matches console
- [ ] Build green; old chart pipeline behavior unchanged

## STOP FOR REVIEW

Do not start 6.3A until this gate passes in the browser.
