import type { ExitComponentRow } from "@/features/chart/exitPolicyForTrade";
import { EM_DASH } from "@/features/reports/tradeDiagnosticsFields";

function formatParameters(parameters: Record<string, string>): string {
  const entries = Object.entries(parameters);
  if (entries.length === 0) return EM_DASH;
  return entries.map(([k, v]) => `${k}=${v}`).join(", ");
}

type Props = {
  rows: ExitComponentRow[];
  warning: string | null;
};

export function ActiveExitComponentsList({ rows, warning }: Props) {
  if (rows.length === 0 && !warning) {
    return <p className="chart-trade-diagnostics__hint">No exit policy rules to list.</p>;
  }

  return (
    <div className="chart-exit-components" data-testid="active-exit-components">
      {warning && <p className="chart-trade-diagnostics__hint">{warning}</p>}
      {rows.length === 0 ? null : (
        <>
      <table className="trade-table chart-exit-components__table">
        <thead>
          <tr>
            <th>group</th>
            <th>profile</th>
            <th>component</th>
            <th>instance</th>
            <th>kind</th>
            <th>params</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={`${row.group}-${row.instance_id}`}
              className={row.isClosing ? "chart-exit-components__row--closing" : undefined}
              data-testid={row.isClosing ? "closing-exit-component" : undefined}
            >
              <td>{row.group}</td>
              <td>{row.profile ?? EM_DASH}</td>
              <td>
                <code>{row.component_id}</code>
              </td>
              <td>
                <code>{row.instance_id}</code>
              </td>
              <td>{row.exit_kind}</td>
              <td>
                <code className="chart-exit-components__params">{formatParameters(row.parameters)}</code>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.some((r) => r.emaAvailabilityHint) && (
        <ul className="chart-exit-components__ema-hints" aria-label="EMA overlay availability">
          {rows
            .filter((r) => r.emaAvailabilityHint)
            .map((row) => (
              <li key={`ema-${row.instance_id}`}>
                <code>{row.instance_id}</code>: {row.emaAvailabilityHint}
              </li>
            ))}
        </ul>
      )}
        </>
      )}
    </div>
  );
}
