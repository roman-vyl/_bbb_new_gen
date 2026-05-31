## MODIFIED Requirements

### Requirement: chartWindowKey reflects current render window for signal trace

`chartWindowKey` used for trace session identity and diagnostics MUST remain derived from the current render window bounds (`firstTime`, `lastTime` of render window candles), including `context_overlay_ref`.

When the render window shifts on pan, Workbench MUST evaluate **trace chunk cache coverage** for the new bounds. If the cache already covers the new range, signal trace MUST NOT be re-fetched solely because `chartWindowKey` changed.

When the render window shifts to an uncovered range, Workbench MUST fetch only the missing/current window chunk and merge into cache.

When trade selection recenters viewport without window rebuild, `chartWindowKey` MUST NOT change.

#### Scenario: Pan shift within cached trace range does not refetch

- **GIVEN** trace chunk cache covers render windows `[T0, T1]` and `[T0', T1']` where the latter is contained in cached time span
- **WHEN** user pans until `chartWindowKey` changes to reflect `[T0', T1']`
- **THEN** display updates from cache slice
- **AND** no new signal trace fetch starts solely due to the key change

#### Scenario: Pan shift to uncovered range triggers chunk fetch

- **GIVEN** trace cache covers `[T0, T1]` only
- **WHEN** user pans until render window is `[T0', T1']` outside cached coverage
- **THEN** `chartWindowKey` reflects the new bounds
- **AND** Workbench requests a signal trace chunk for the missing/current range

#### Scenario: In-zone trade select preserves trace window key

- **GIVEN** trace cache covers the current render window
- **WHEN** user selects another trade whose entry is inside the safe zone of the same render window
- **THEN** `chartWindowKey` remains unchanged
- **AND** signal trace is not re-fetched solely due to trade selection
