import type { JsonObject, ValidationErrorItem } from "@/api/types";
import {
  hasLegacyExitManagementRules,
  summarizeExitManagementProduct,
} from "@/features/composer/composerExitManagementProduct";
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
        <p className="banner banner--warn" role="status">
          This instance still loads deprecated legacy management rules (
          {summary.legacyRulesCount}). They remain readable for old artifacts only; phase-rules
          authoring is disabled until legacy rules are removed from the config JSON.
        </p>
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
