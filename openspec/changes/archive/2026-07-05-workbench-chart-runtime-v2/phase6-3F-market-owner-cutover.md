# Phase 6.3F — Market/Load/Cache Owner Cutover (LAST)

**Status:** Not started (OpenSpec template — fill during implementation)

**Phase debug tag:** `phase: 6.3F`, `domain: market`

## 1. Owner transfer

| Item | Value |
|---|---|
| Old owner | `WorkbenchContext` — market windows, load effect, `executeMarketWindowLoad`, bundle composition, pan prefetch |
| New owner | `marketViewRuntime`, `marketWindowRuntime`, `marketLoadRuntime`, `marketBundleRuntime`, `panRuntime` |
| Already v2 | model/adapter, render-window, viewport, trace/events, aux overlays |

## 2. Transfer scope

- Market focus/coverage windows
- Candles/EMA fetch planning and execution
- `marketResourceCache` writes and ready promotion
- In-flight dedupe, status/error, source/count/range
- Pan-driven coverage expansion (when applicable)

## 3. Forbidden

- Old market fallback when v2 returns empty
- Dual market owner
- Repeated fetch for unchanged ready/in-flight key
- Empty `chart.setData.candles` after successful fetch
- Cache-hit promotion loop rebuilding chart model
- Clearing chart during in-flight fetch when stale data exists

## 4. Tests

- Cold open market fetch once per missing window
- Cache hit no model rebuild storm
- Pan expansion dedupe; clamped pan no-op
- Single-owner market fetch static guards

## 5. Browser evidence

- [ ] Cold Chart open — candles + EMA
- [ ] `chart.setData.candles` — `barCount > 0`
- [ ] Single initial fetch per required window
- [ ] Cache-hit cycles — no chart model churn
- [ ] Pan left/right — expansion without fetch storm
- [ ] Clamped pan — no-op
- [ ] No blank chart, freeze, or viewport teleport
- [ ] Debug — `runtime_v2_production` for market; all domains v2

## 6. STOP FOR REVIEW

Do not start 6.4 until approved.
