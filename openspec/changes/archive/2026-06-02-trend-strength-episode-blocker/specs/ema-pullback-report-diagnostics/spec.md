## Status: Deferred (not shipped in this change)

Entry-bar closed-trade fields (`entry_adx_peak`, `entry_bars_since_adx_peak`, `entry_adx_current`, `entry_trend_strength_active`, `entry_trend_strength_blocked_reason`) were scoped as optional in `design.md` but are **not** implemented in the report builder for this slice.

Use Signal Trace blocker internals and `component_counters` for MVP diagnostics. A follow-up change may add trade-record snapshots without bumping `report_schema_version`.
