import type { JsonObject, ValidationErrorItem } from "@/api/types";
import {
  createBlankExitManagement,
  createProductExitManagement,
  hasLegacyExitManagementRules,
  summarizeExitManagementProduct,
} from "@/features/composer/composerExitManagementProduct";
import { defaultDiagnosticPhaseRules } from "@/features/composer/composerPhaseRulesEditor";
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

  return (
    <div
      className="composer-exit-management-product"
      data-testid="exit-management-product-panel"
    >
      <p className="banner banner--info" role="status">
        Product contract: <code>mode</code> = <code>diagnostic_only</code>,{" "}
        <code>phase_rules</code>, reserved <code>stop_management</code> and{" "}
        <code>runtime_exits</code>. Legacy <code>break_even_stop</code> rules are deprecated
        compatibility-only — Composer does not offer them for new configs.
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
          <dd>{summary.stopManagementCount} (reserved)</dd>
        </div>
        <div>
          <dt>runtime_exits</dt>
          <dd>{summary.runtimeExitsCount} (reserved)</dd>
        </div>
        {hasLegacy && (
          <div>
            <dt>legacy rules</dt>
            <dd>{summary.legacyRulesCount} (deprecated)</dd>
          </div>
        )}
      </dl>

      {authoringEnabled ? (
        <PhaseRulesEditor
          exitManagement={exitManagement}
          pathPrefix={pathPrefix}
          errors={errors}
          onChange={onChange!}
        />
      ) : null}
    </div>
  );
}
