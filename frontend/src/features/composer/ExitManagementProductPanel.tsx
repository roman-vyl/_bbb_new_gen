import type { JsonObject, ValidationErrorItem } from "@/api/types";
import {
  createBlankExitManagement,
  createProductExitManagement,
  hasLegacyExitManagementRules,
  summarizeExitManagementProduct,
} from "@/features/composer/composerExitManagementProduct";
import {
  EXIT_MANAGEMENT_MODES,
  writeExitManagementMode,
} from "@/features/composer/composerManagedExitManagement";
import { defaultDiagnosticPhaseRules } from "@/features/composer/composerPhaseRulesEditor";
import {
  ManagementRulesEditor,
  RUNTIME_EXIT_COMPONENT_IDS,
  STOP_MANAGEMENT_COMPONENT_IDS,
  TAKE_MANAGEMENT_COMPONENT_IDS,
} from "@/features/composer/ManagementRulesEditor";
import { PhaseRulesEditor } from "@/features/composer/PhaseRulesEditor";

type Props = {
  exitManagement: JsonObject;
  pathPrefix: string;
  errors?: ValidationErrorItem[];
  onChange?: (nextExitManagement: JsonObject) => void;
};

export function ExitManagementProductPanel({
  exitManagement,
  pathPrefix,
  errors = [],
  onChange,
}: Props) {
  const summary = summarizeExitManagementProduct(exitManagement);
  const hasLegacy = hasLegacyExitManagementRules(exitManagement);
  const authoringEnabled = Boolean(onChange) && !hasLegacy;
  const isManaged = exitManagement.mode === "managed";

  return (
    <div
      className="composer-exit-management-product"
      data-testid="exit-management-product-panel"
    >
      <p className="banner banner--info" role="status">
        Product contract v2: <code>mode</code>, <code>phase_rules</code>,{" "}
        <code>stop_management</code>, <code>take_management</code>, <code>runtime_exits</code>.
        Legacy <code>always_on</code> / <code>profiles</code> management rules are deprecated —
        Composer does not emit them for new configs.
      </p>
      {hasLegacy && (
        <div
          className="composer-exit-management-legacy-quarantine"
          data-testid="exit-management-legacy-quarantine"
        >
          <p className="banner banner--warn" role="status">
            This instance still loads deprecated legacy management rules (
            {summary.legacyRulesCount}). Phase-rules authoring is disabled while the legacy shape
            remains in this draft. To edit diagnostic phase rules, explicitly replace the deprecated
            rules below — this does not change saved reports or backend compatibility for old
            artifacts.
          </p>
          <p className="composer-exit-management-legacy-quarantine__notice" role="note">
            Explicit replacement removes legacy <code>always_on</code>, <code>profiles</code>, and{" "}
            <code>break_even_stop</code> rules from this draft only. Save the config to persist the
            new product contract.
          </p>
          {onChange ? (
            <div className="composer-exit-management-legacy-quarantine__actions">
              <button
                type="button"
                data-testid="replace-legacy-empty-product"
                onClick={() => onChange(createBlankExitManagement())}
              >
                Remove legacy rules and use diagnostic-only contract
              </button>
              <button
                type="button"
                data-testid="replace-legacy-default-phases"
                onClick={() =>
                  onChange(createProductExitManagement(defaultDiagnosticPhaseRules()))
                }
              >
                Replace with default diagnostic phases
              </button>
            </div>
          ) : null}
        </div>
      )}
      <dl className="composer-exit-management-product__summary">
        <div>
          <dt>mode</dt>
          <dd>
            <code>{summary.mode}</code>
          </dd>
        </div>
        <div>
          <dt>phase_rules</dt>
          <dd>{summary.phaseRulesCount}</dd>
        </div>
        <div>
          <dt>stop_management</dt>
          <dd>{summary.stopManagementCount}</dd>
        </div>
        <div>
          <dt>take_management</dt>
          <dd>{summary.takeManagementCount}</dd>
        </div>
        <div>
          <dt>runtime_exits</dt>
          <dd>{summary.runtimeExitsCount}</dd>
        </div>
        {hasLegacy && (
          <div>
            <dt>legacy rules</dt>
            <dd>{summary.legacyRulesCount} (deprecated)</dd>
          </div>
        )}
      </dl>

      {authoringEnabled ? (
        <>
          <label className="field composer-exit-management-product__mode">
            <span>mode</span>
            <select
              data-testid="exit-management-mode-select"
              value={exitManagement.mode === "managed" ? "managed" : "diagnostic_only"}
              onChange={(e) =>
                onChange!(writeExitManagementMode(exitManagement, e.target.value as "diagnostic_only" | "managed"))
              }
            >
              {EXIT_MANAGEMENT_MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {mode}
                </option>
              ))}
            </select>
          </label>

          <PhaseRulesEditor
            exitManagement={exitManagement}
            pathPrefix={pathPrefix}
            errors={errors}
            onChange={onChange!}
          />

          {isManaged ? (
            <>
              <ManagementRulesEditor
                exitManagement={exitManagement}
                pathPrefix={pathPrefix}
                layer="stop_management"
                title="Stop management"
                componentIds={STOP_MANAGEMENT_COMPONENT_IDS}
                errors={errors}
                onChange={onChange!}
              />
              <ManagementRulesEditor
                exitManagement={exitManagement}
                pathPrefix={pathPrefix}
                layer="take_management"
                title="Take management"
                componentIds={TAKE_MANAGEMENT_COMPONENT_IDS}
                errors={errors}
                onChange={onChange!}
              />
              <ManagementRulesEditor
                exitManagement={exitManagement}
                pathPrefix={pathPrefix}
                layer="runtime_exits"
                title="Runtime exits"
                componentIds={RUNTIME_EXIT_COMPONENT_IDS}
                errors={errors}
                onChange={onChange!}
              />
            </>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
