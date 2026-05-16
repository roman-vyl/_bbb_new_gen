import { useMemo } from "react";

import type { StrategyConfigDraft } from "@/api/types";
import { useWorkbench } from "@/shared/context/WorkbenchContext";

export function ComposerPanel() {
  const { configDraft, setConfigDraft } = useWorkbench();
  const preview = useMemo(() => JSON.stringify(configDraft, null, 2), [configDraft]);

  const instance = configDraft.instances[0];

  return (
    <section className="panel composer-panel">
      <div className="panel__header">
        <h2>Strategy Composer</h2>
        <p className="panel__hint">Draft config only — JSON preview (no YAML written to repo)</p>
      </div>

      <div className="composer-grid">
        <div className="composer-form">
          <label className="field">
            <span>experiment_id</span>
            <input
              value={configDraft.experiment_id}
              onChange={(e) => patchDraft(setConfigDraft, configDraft, { experiment_id: e.target.value })}
            />
          </label>

          {instance && (
            <>
              <label className="field">
                <span>instance_id</span>
                <input
                  value={instance.instance_id}
                  onChange={(e) =>
                    patchInstance(setConfigDraft, configDraft, 0, { instance_id: e.target.value })
                  }
                />
              </label>
              <label className="field">
                <span>symbol</span>
                <input
                  value={instance.market.symbol}
                  onChange={(e) =>
                    patchInstance(setConfigDraft, configDraft, 0, {
                      market: { ...instance.market, symbol: e.target.value },
                    })
                  }
                />
              </label>
              <label className="field">
                <span>base_timeframe</span>
                <input
                  value={instance.market.base_timeframe}
                  onChange={(e) =>
                    patchInstance(setConfigDraft, configDraft, 0, {
                      market: { ...instance.market, base_timeframe: e.target.value },
                    })
                  }
                />
              </label>
              <label className="field">
                <span>init_cash</span>
                <input
                  type="number"
                  value={configDraft.execution.init_cash}
                  onChange={(e) =>
                    patchDraft(setConfigDraft, configDraft, {
                      execution: {
                        ...configDraft.execution,
                        init_cash: Number(e.target.value),
                      },
                    })
                  }
                />
              </label>
            </>
          )}

          <p className="composer-note">
            Phase 0: minimal editable fields. Catalog-driven forms arrive in phase 3.
          </p>
        </div>

        <div className="composer-preview">
          <h3>Draft JSON preview</h3>
          <pre>{preview}</pre>
        </div>
      </div>
    </section>
  );
}

function patchDraft(
  setDraft: (d: StrategyConfigDraft) => void,
  current: StrategyConfigDraft,
  patch: Partial<StrategyConfigDraft>,
) {
  setDraft({ ...current, ...patch });
}

function patchInstance(
  setDraft: (d: StrategyConfigDraft) => void,
  current: StrategyConfigDraft,
  index: number,
  patch: Partial<StrategyConfigDraft["instances"][number]>,
) {
  const instances = current.instances.map((inst, i) =>
    i === index ? { ...inst, ...patch } : inst,
  );
  setDraft({ ...current, instances });
}
