import type { JsonObject } from "@/api/types";
import {
  hasLegacyExitManagementRules,
  summarizeExitManagementProduct,
} from "@/features/composer/composerExitManagementProduct";

type Props = {
  exitManagement: JsonObject;
};

export function ExitManagementProductPanel({ exitManagement }: Props) {
  const summary = summarizeExitManagementProduct(exitManagement);
  const hasLegacy = hasLegacyExitManagementRules(exitManagement);

  return (
    <div
      className="composer-exit-management-product"
      data-testid="exit-management-product-panel"
    >
      <p className="banner banner--info" role="status">
        Product contract: <code>mode</code>, <code>phase_rules</code>, reserved{" "}
        <code>stop_management</code> and <code>runtime_exits</code>. Legacy{" "}
        <code>break_even_stop</code> rules are deprecated compatibility-only — Composer does not
        offer them for new configs. Phase-rules editor is not in Composer yet; edit JSON directly.
      </p>
      {hasLegacy && (
        <p className="banner banner--warn" role="status">
          This instance still loads deprecated legacy management rules (
          {summary.legacyRulesCount}). They remain readable for old artifacts only; do not use them
          as the basis for new runtime work.
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
    </div>
  );
}
