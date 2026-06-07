## MODIFIED Requirements

### Requirement: Exit management extends the existing research runtime
The `ema_pullback` research runtime SHALL process stateful exit-management rules and diagnostics inside the existing execution flow using compiled entries, compiled exit-policy outputs, profile/context state, OHLCV, and real trade lifecycle records. It MUST NOT require a separate orchestration engine beside the current research backtest path.

When `trade_management.exit_management.mode` is `diagnostic_only`, the runtime SHALL compute phase state and diagnostics from the same real trade path while preserving the existing exits. When behavior-changing stop/runtime exits are implemented later, they SHALL still operate as extensions of this same managed execution flow, not as a second simulation.

The archived `break_even_stop` `exit_management.always_on/profiles/rules` path SHALL be treated as deprecated compatibility behavior only. It MUST NOT be extended as the product path for the new runtime architecture, and diagnostic runtime v1 MUST NOT use it as a source for phases, stop management, or runtime exits.

#### Scenario: Managed runtime consumes compiled inputs
- **GIVEN** a strategy spec with `trade_management.exit_management`
- **WHEN** the backtest runs
- **THEN** exit management consumes the entries from `build_signals_from_spec`
- **AND** it consumes profile-aware exit-policy outputs from `build_exit_outputs_from_spec`
- **AND** it does not recompute setup, trigger, blocker, EMA, ATR, or context-provider logic

#### Scenario: No management keeps current static path
- **GIVEN** a strategy spec without `trade_management.exit_management`
- **WHEN** the backtest runs
- **THEN** the current static `vectorbt` path remains the execution path
- **AND** trade counts and core metrics match the pre-change behavior within existing test tolerances

#### Scenario: Diagnostic-only management uses the real trade path
- **GIVEN** a strategy spec with `trade_management.exit_management.mode: "diagnostic_only"`
- **WHEN** the backtest runs
- **THEN** exit management derives phase state from the actual opened and closed trades
- **AND** it does not create shadow positions or pseudo-trades
- **AND** it does not replace the existing exit-policy path

#### Scenario: Legacy break-even path remains deprecated compatibility
- **GIVEN** an existing strategy spec uses the archived `break_even_stop` management shape
- **WHEN** the new diagnostic runtime architecture is implemented
- **THEN** that legacy shape is not promoted into the phase-based runtime contract
- **AND** any continued execution support is isolated as deprecated backward compatibility
