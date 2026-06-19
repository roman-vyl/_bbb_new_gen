## ADDED Requirements

### Requirement: Lazy chart activation preserves render-window semantics
Chart-heavy IO gating SHALL NOT change sliding render-window behavior after Chart activation. Once market data is loaded, the chart MUST still initialize tail or trade-centered windows, use the 50k render window and 10k safe zone defaults, and defer active-pan swaps until commit.

#### Scenario: First chart activation initializes normal window
- **GIVEN** a run report loaded while Chart was not active
- **WHEN** the user opens Chart and market data loads
- **THEN** the render-window manager initializes from the loaded candle data
- **AND** the initial window is tail or trade-centered according to existing selection policy
- **AND** no alternate window semantics are introduced by lazy activation

### Requirement: Event display changes do not alter candle window commits
Trace display partial state, missing-range scheduling, and chart event cache updates MUST NOT trigger render-window shifts or viewport commands. Render-window shifts remain owned by the render-window controller and viewport controller.

#### Scenario: Trace merge does not move viewport
- **GIVEN** a render-window shift committed and viewport restore completed
- **WHEN** a trace display chunk later merges for the current window
- **THEN** markers and HTF overlays may update
- **AND** no additional render-window shift is committed
- **AND** no viewport focus or restore command is issued solely because trace data arrived

### Requirement: Trade navigation remains safe-zone aware
Trade navigation SHALL continue to rebuild the candle render window only when the selected trade entry is outside the current window or inside the safe zone. Trace/event scheduling changes MUST NOT force candle `setData` when an in-zone trade selection only requires viewport focus.

#### Scenario: In-zone trade selection avoids candle rebuild
- **GIVEN** the selected trade entry is within the current render window and outside both safe zones
- **WHEN** the user navigates to that trade
- **THEN** Workbench centers the viewport on the trade
- **AND** candle series data is not reset solely because trace display state changes
