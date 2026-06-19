## ADDED Requirements

### Requirement: Chart-heavy IO waits for chart activation
Workbench SHALL keep run list and run report loading eager, but SHALL NOT start chart-heavy IO (`chart-bundle`, initial `signal-trace`, or chart-only auxiliary overlay requests) until the Chart tab has been activated at least once or an explicit background prefetch policy is enabled.

Composer and Reports navigation MUST NOT accidentally trigger chart-heavy IO before chart activation.

#### Scenario: Composer opens without chart-heavy IO
- **GIVEN** the Workbench loads a run report successfully
- **AND** the active tab is `composer`
- **WHEN** the user does not open the Chart tab
- **THEN** Workbench does not request `/api/market/chart-bundle`
- **AND** Workbench does not request `/api/research/runs/{run_id}/signal-trace`

#### Scenario: Chart activation starts chart-heavy IO
- **GIVEN** a run report is loaded
- **AND** chart-heavy IO has not started
- **WHEN** the user opens the Chart tab
- **THEN** Workbench requests the market bundle needed for chart display
- **AND** Workbench may request the initial signal trace after market data establishes a render window

#### Scenario: Reports trade selection waits for chart activation
- **GIVEN** a run report is loaded
- **AND** the active tab is `reports`
- **AND** Chart has not been activated
- **WHEN** the user selects a trade row in Reports
- **THEN** Workbench stores the selected trade id
- **AND** Workbench does not request `/api/market/chart-bundle`
- **AND** Workbench does not request `/api/research/runs/{run_id}/signal-trace`
- **WHEN** the user opens the Chart tab
- **THEN** initial chart focus may center around the selected trade

### Requirement: Chart activation state preserves mounted Chart behavior
Workbench SHALL allow Chart to remain mounted after first activation when switching between Chart and Reports, but the first chart-heavy fetch MUST be gated by chart activation or explicit background prefetch policy.

#### Scenario: Reports after Chart keeps chart state
- **GIVEN** the user opened the Chart tab and chart-heavy IO completed
- **WHEN** the user switches to Reports
- **THEN** Chart state MAY remain mounted and cached
- **AND** Reports does not reset chart activation state
