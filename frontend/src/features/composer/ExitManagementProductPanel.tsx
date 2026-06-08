import type { JsonObject, ValidationErrorItem } from "@/api/types";
import {
  LEGACY_EXIT_MANAGEMENT_UNSUPPORTED_MESSAGE,
  createBlankExitManagement,
  exitManagementHasLegacyKeys,
  summarizeExitManagementProduct,
} from "@/features/composer/composerExitManagementProduct";
import {
  EXIT_MANAGEMENT_MODES,
  writeExitManagementMode,
} from "@/features/composer/composerManagedExitManagement";
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
  const isUnsupportedLegacy = exitManagementHasLegacyKeys(exitManagement);
  const authoringEnabled = Boolean(onChange) && !isUnsupportedLegacy;
  const isManaged = exitManagement.mode === "managed";

  return (
    <div
      className="composer-exit-management-product"
      data-testid="exit-management-product-panel"
    >
      <p className="banner banner--info" role="status">
        Product contract v2: <code>mode</code>, <code>phase_rules</code>,{" "}
        <code>stop_management</code>, <code>take_management</code>, <code>runtime_exits</code>.
        Legacy <code>always_on</code> / <code>profiles</code> exit_management is not supported in
        Composer.
      </p>
      {isUnsupportedLegacy && (
        <div
          className="composer-exit-management-unsupported-legacy"
          data-testid="exit-management-unsupported-legacy"
        >
          <p className="banner banner--warn" role="status">
            This draft uses an unsupported legacy exit_management shape (
            {summary.legacyRulesCount > 0
              ? `${summary.legacyRulesCount} legacy rule(s)`
              : "always_on/profiles keys"}
            ). Composer cannot edit or save it. Saved reports and run artifacts remain readable
            independently.
          </p>
          <p className="composer-exit-management-unsupported-legacy__notice" role="note">
            {LEGACY_EXIT_MANAGEMENT_UNSUPPORTED_MESSAGE}
          </p>
          {onChange ? (
            <div className="composer-exit-management-unsupported-legacy__actions">
              <button
                type="button"
                data-testid="reset-exit-management-v2"
                onClick={() => onChange(createBlankExitManagement())}
              >
                Reset exit_management to v2
              </button>
            </div>
          ) : null}
        </div>
      )}
      <dl className="composer-exit-management-product__summary">
        <div>
          <dt>mode</dt>
          <dd>
            <code>{isUnsupportedLegacy ? "unsupported legacy" : summary.mode}</code>
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
