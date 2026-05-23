import type { ExitProfileLabel, ProfileBucketMetrics, VariantMetrics } from "@/api/types";
import {
  EM_DASH,
  formatExitReasonMix,
  formatHoldBars,
  formatMoney,
  formatProfitFactor,
  formatReturnPct,
  formatWinRate,
} from "@/features/reports/formatDiagnostics";

const PROFILE_ROWS: ExitProfileLabel[] = ["aligned", "countertrend", "neutral"];

const EMPTY_BUCKET: ProfileBucketMetrics = {
  trades: 0,
  pnl: 0,
  gross_pnl: 0,
  fees_paid: 0,
  profit_factor: null,
  win_rate: null,
  avg_return_pct: null,
  avg_hold_bars: null,
  exit_reason_mix: {},
};

type Props = {
  profileBreakdown: NonNullable<VariantMetrics["profile_breakdown"]>;
};

export function ProfileBreakdownTable({ profileBreakdown }: Props) {
  return (
    <div className="table-wrap">
      <table className="trade-table breakdown-table">
        <thead>
          <tr>
            <th>Profile</th>
            <th>Trades</th>
            <th>Win rate</th>
            <th>PF</th>
            <th>PnL</th>
            <th>Gross</th>
            <th>Fees</th>
            <th>Avg ret %</th>
            <th>Avg hold</th>
            <th>Exit mix</th>
          </tr>
        </thead>
        <tbody>
          {PROFILE_ROWS.map((profile) => {
            const bucket = profileBreakdown[profile] ?? EMPTY_BUCKET;
            const empty = bucket.trades === 0;
            return (
              <tr key={profile}>
                <td>{profile}</td>
                <td>{bucket.trades}</td>
                <td>{empty ? EM_DASH : formatWinRate(bucket.win_rate)}</td>
                <td>{empty ? EM_DASH : formatProfitFactor(bucket.profit_factor)}</td>
                <td>{formatMoney(bucket.pnl)}</td>
                <td>{formatMoney(bucket.gross_pnl)}</td>
                <td>{formatMoney(bucket.fees_paid)}</td>
                <td>{empty ? EM_DASH : formatReturnPct(bucket.avg_return_pct)}</td>
                <td>{empty ? EM_DASH : formatHoldBars(bucket.avg_hold_bars)}</td>
                <td className="exit-mix-cell">{formatExitReasonMix(bucket.exit_reason_mix)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
