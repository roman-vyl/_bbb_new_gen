# workbench-report-diagnostics Specification

## Purpose
TBD - created by archiving change frontend-report-diagnostics-v4. Update Purpose after archive.
## Requirements
### Requirement: Schema v4 diagnostics section in Reports tab

When the loaded run report has `report_schema_version` equal to `4`, `5`, or `6` and the selected variant's `metrics` includes diagnostic sections, the Workbench Reports tab SHALL render, for that variant:

1. A **Fee Diagnostics** summary from `metrics.fee_diagnostics`.
2. A **Profile Breakdown** table from `metrics.profile_breakdown` with rows `aligned`, `countertrend`, and `neutral`.
3. An **Exit Reason Breakdown** table from `metrics.exit_reason_breakdown` with one row per full `exit_reason` key.

The UI MUST NOT recompute these aggregates from `trade_records`; it SHALL display values from the JSON payload.

#### Scenario: v4+ report shows fee diagnostics

- **WHEN** the user opens the Reports tab with a loaded report where `report_schema_version` is `4`, `5`, or `6` and `selectedVariant.metrics.fee_diagnostics` is present
- **THEN** the UI displays `fees_rate`, `total_fees_paid`, `gross_pnl`, `net_pnl`, and `fees_as_pct_of_gross_profit` (or an em dash when that field is null or omitted)

#### Scenario: Profile breakdown always shows three profile rows

- **WHEN** the Profile Breakdown table is rendered for a v4+ variant
- **THEN** rows for `aligned`, `countertrend`, and `neutral` are always visible in that order
- **AND** when a profile bucket has `trades` equal to zero, the trades column shows `0` and nullable metric cells show a neutral placeholder rather than hiding the row

#### Scenario: Missing diagnostic section on v4+

- **WHEN** `report_schema_version` is `4`, `5`, or `6` but a given diagnostic section (e.g. `fee_diagnostics`) is absent from `metrics`
- **THEN** the UI omits that block without error and still renders other available sections

### Requirement: Schema v3 diagnostics empty state

When `report_schema_version` is not `4`, `5`, or `6`, the Reports tab SHALL NOT render v4 diagnostic blocks as if values were zero. It SHALL either hide those blocks or show an empty state with text indicating that diagnostics require schema v4+ reports. The existing v3 summary cards, trade table, and exit_reason prefix filters SHALL continue to work unchanged.

Schema **v6** reports SHALL use the same Reports UI gating and flat v5 quality fields as v4/v5 (no new nested-path UI in this change).

#### Scenario: v3 report without diagnostics fields

- **WHEN** the user opens Reports with `report_schema_version` equal to `3`
- **THEN** Fee Diagnostics, Profile Breakdown, and Exit Reason Breakdown blocks are not shown as populated tables and the user sees the v4-only empty-state message or equivalent non-error placeholder
- **AND** the trade table and existing summary metrics render without runtime errors

#### Scenario: v6 report uses existing diagnostics UI

- **WHEN** the user opens Reports with `report_schema_version` equal to `6` and v4 metric sections present
- **THEN** Fee/Profile/Exit breakdown blocks render as for v5
- **AND** no runtime error occurs when `path_diagnostics` is present on trade records

### Requirement: Trade table diagnostic enrichment

For v4 trade rows, the Reports trade table SHALL support viewing enriched per-trade diagnostic fields without replacing the default compact column set.

The default visible columns SHALL remain: trade id, direction, status, entry time, exit time, net pnl, and exit_reason.

An explicit user toggle (e.g. “Diagnostics columns”) SHALL add a defined subset of columns: `entry_profile`, `entry_context_state`, `active_exit_profile`, `exit_group`, `exit_profile`, `exit_kind`, `gross_pnl`, `fees_paid`, and `hold_bars`.

Additional v4 fields (`exit_component_id`, `exit_instance_id`, `gross_return_pct`, `hold_minutes`) MAY appear in the trade detail panel rather than the default table.

#### Scenario: Diagnostics columns off by default

- **WHEN** the user opens Reports for a v4 report
- **THEN** the trade table shows only the default compact columns until the user enables diagnostics columns

#### Scenario: Diagnostics columns show null safely

- **WHEN** a trade row has a null or missing v4 diagnostic field
- **THEN** the corresponding cell displays a neutral placeholder (e.g. em dash) and the UI does not throw

#### Scenario: Trade detail shows full diagnostics

- **WHEN** the user selects a trade that includes v4 diagnostic fields
- **THEN** the trade detail panel lists those fields including exit component/instance identifiers and hold duration fields when present

### Requirement: Client-side trade filters

The Reports tab SHALL provide client-side filters on `selectedVariant.trade_records` for the loaded report only (no API query parameters). Filters SHALL include:

- `entry_profile` (aligned | countertrend | neutral | all)
- `entry_context_state` (up | down | neutral | unknown | all)
- `exit_kind` (all or exact match on `trade.exit_kind` using literal values from data, e.g. `signal`, `stop_loss`, `take_profit` — not abbreviated aliases)
- `exit_group` (all | always_on | profile)
- `exit_reason` (existing prefix categories: all, open, unknown, stop_loss:*, take_profit:*, signal:*)
- trade outcome (all | winning | losing by net `pnl`)

Multiple active filters SHALL combine with logical AND. Filtered-out trades SHALL not appear in the table body.

#### Scenario: Filter by entry profile

- **WHEN** the user selects `entry_profile` filter `aligned`
- **THEN** only trades whose `entry_profile` is `aligned` are listed in the trade table

#### Scenario: Filter by exit_kind uses exact JSON values

- **WHEN** loaded trades include `exit_kind` value `stop_loss` and the user selects the `stop_loss` chip
- **THEN** only trades with `exit_kind` exactly equal to `stop_loss` are listed
- **AND** the UI does not expose a shortened `stop` chip that would fail to match v4 JSON

#### Scenario: Filter by exit reason prefix

- **WHEN** the user selects exit_reason filter `stop_loss`
- **THEN** only trades whose `exit_reason` starts with `stop_loss:` are listed

#### Scenario: Winning trades filter

- **WHEN** the user selects outcome filter `Winners`
- **THEN** only trades with `pnl` strictly greater than zero are listed

### Requirement: Trade selection unchanged with filters

Selecting a trade from a filtered trade table SHALL set `selectedTradeId` to that trade's `trade_id` and SHALL resolve trade detail and chart focus against the full variant `trade_records` list, not only the filtered subset.

#### Scenario: Focus trade after filtering

- **WHEN** the user applies a filter that hides some trades and clicks a visible row for trade id `T`
- **THEN** `selectedTradeId` equals `T`
- **AND** trade detail and chart focus use the trade record with id `T` from the full variant list

### Requirement: No backend or schema contract changes (Workbench UI slice)

The Workbench Reports **UI** capability SHALL NOT modify research report generation, Data Engine, or BFF metric recomputation. TypeScript types MAY include optional v4–v6 fields; no new API routes are required.

Nested `path_diagnostics` / `path_diagnostics_summary` **visualization** is out of scope; optional types for schema v6 are allowed.

#### Scenario: Frontend build and tests

- **WHEN** Workbench Reports implementation is complete
- **THEN** `cd frontend && npm test` succeeds for reports diagnostics tests

