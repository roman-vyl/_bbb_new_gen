## ADDED Requirements

### Requirement: Component registry declares allowed consumer roles
The research layer SHALL maintain consumer-role metadata for each registered `component_id`. Each entry MUST include at minimum:

- `component_id`
- `allowed_roles` — non-empty list of dotted consumer role strings
- `input_contract` — name of the params object shape the consumer expects
- `output_contract` — name of the result shape (`signal_mask`, `phase_condition_bool`, `managed_stop_price`, …)
- `side_aware` — boolean
- `feature_requirements` — declarative feature keys or planning hook id
- `params_schema_ref` — string reference to the params schema (BFF catalog / loader); v1 uses `component_id` as the ref key (e.g. `"rsi_signal_exit"`)
- `diagnostics_contract` — keys emitted in managed events / trade records

The registry MUST NOT load arbitrary external plugins. Unknown `component_id` values MUST be rejected at validation time.

#### Scenario: rsi_signal_exit declares dual roles
- **GIVEN** the consumer registry entry for `rsi_signal_exit`
- **WHEN** metadata is read
- **THEN** `allowed_roles` includes `exit_policy.signal_exit` and `exit_management.runtime_exit`
- **AND** `output_contract` is `signal_mask`
- **AND** `side_aware` is true

#### Scenario: ema_cross_loss_exit declares dual roles
- **GIVEN** the consumer registry entry for `ema_cross_loss_exit`
- **WHEN** metadata is read
- **THEN** `allowed_roles` includes `exit_policy.signal_exit` and `exit_management.runtime_exit`

#### Scenario: atr_stop_loss is exit_policy only
- **GIVEN** the consumer registry entry for `atr_stop_loss`
- **WHEN** metadata is read
- **THEN** `allowed_roles` is exactly `["exit_policy.stop_loss"]`
- **AND** `exit_management.runtime_exit` is not present

#### Scenario: adx_di_threshold is phase condition only
- **GIVEN** the consumer registry entry for `adx_di_threshold`
- **WHEN** metadata is read
- **THEN** `allowed_roles` includes `exit_management.phase_condition`
- **AND** `output_contract` is `phase_condition_bool`

### Requirement: Validation rejects component used in disallowed role
Strategy spec validation SHALL resolve each component reference to its registry entry and the consumer role implied by the JSON location and optional explicit `role` field.

When the resolved consumer role is not listed in `allowed_roles`, validation MUST fail with an error naming `component_id`, attempted role, and allowed roles. Validation MUST NOT silently ignore the rule or substitute a fallback component.

#### Scenario: rsi_signal_exit valid in exit_policy signal slot
- **GIVEN** a rule under `trade_management.exit_policy` with `component_id: "rsi_signal_exit"` in a signal exit list
- **WHEN** validation runs
- **THEN** validation succeeds

#### Scenario: rsi_signal_exit valid in runtime_exits with role
- **GIVEN** a rule under `trade_management.exit_management.runtime_exits` with `component_id: "rsi_signal_exit"`, `role: "exit_management.runtime_exit"`, and `activate_when`
- **WHEN** validation runs
- **THEN** validation succeeds

#### Scenario: atr_stop_loss invalid in runtime_exits
- **GIVEN** a `runtime_exits` rule with `component_id: "atr_stop_loss"` and `role: "exit_management.runtime_exit"`
- **WHEN** validation runs
- **THEN** validation fails with a message that the component is not allowed in that role

#### Scenario: Unknown component_id rejected
- **GIVEN** a `runtime_exits` rule with `component_id: "unknown_exit"`
- **WHEN** validation runs
- **THEN** validation fails with an unknown component error

#### Scenario: Role mismatch rejected
- **GIVEN** a `runtime_exits` rule with `component_id: "rsi_signal_exit"` and `role: "exit_policy.signal_exit"`
- **WHEN** validation runs
- **THEN** validation fails because the role does not match the runtime_exits consumer

### Requirement: BFF component catalog exposes allowed_roles
The `research_api` component catalog SHALL expose `allowed_roles` on each `ComponentSchema` (additive field). Catalog entries MUST stay consistent with the research consumer registry for the same `component_id` and family.

Pipeline slot `role` on `ComponentSchema` (e.g. `exits`, `exit_management`) SHALL remain for Composer section placement. `allowed_roles` SHALL describe authorized JSON consumers.

#### Scenario: Catalog returns allowed_roles for rsi_signal_exit
- **WHEN** the Workbench fetches the `ema_pullback` component catalog
- **THEN** the `rsi_signal_exit` entry includes `allowed_roles` containing `exit_policy.signal_exit` and `exit_management.runtime_exit`

#### Scenario: Catalog parity test
- **GIVEN** any `component_id` present in both research registry and BFF catalog
- **WHEN** a parity test compares `allowed_roles`
- **THEN** the sets are equal

### Requirement: Consumer adapter layer separates role from primitive
The research runtime SHALL invoke reusable component functions through consumer adapters keyed by consumer role. Adapters MUST interpret `output_contract` for that role (e.g. compile always-on mask for `exit_policy.signal_exit`; emit phased runtime trigger for `exit_management.runtime_exit`).

Adapters MUST NOT duplicate trading math inside adapter code. New consumer roles MUST NOT require new primitive component ids when an existing primitive's `allowed_roles` already authorizes the role.

#### Scenario: Same rsi primitive backs two consumers
- **GIVEN** `rsi_signal_exit` configured once in `exit_policy` and once in `runtime_exits`
- **WHEN** feature planning and runtime evaluation run
- **THEN** both consumers call the same `rsi_signal_exit` function implementation
- **AND** no `runner_rsi_exit` component exists in the registry
