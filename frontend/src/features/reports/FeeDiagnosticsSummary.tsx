import type { FeeDiagnostics } from "@/api/types";
import {
  formatFeesPctOfGross,
  formatFeesRate,
  formatMoney,
} from "@/features/reports/formatDiagnostics";

type Props = {
  feeDiagnostics: FeeDiagnostics;
};

export function FeeDiagnosticsSummary({ feeDiagnostics }: Props) {
  return (
    <div className="reports-summary fee-diagnostics-summary">
      <div className="metric-card">
        <span>Fees rate</span>
        <strong>{formatFeesRate(feeDiagnostics.fees_rate)}</strong>
      </div>
      <div className="metric-card">
        <span>Total fees</span>
        <strong>{formatMoney(feeDiagnostics.total_fees_paid)}</strong>
      </div>
      <div className="metric-card">
        <span>Gross PnL</span>
        <strong>{formatMoney(feeDiagnostics.gross_pnl)}</strong>
      </div>
      <div className="metric-card">
        <span>Net PnL</span>
        <strong>{formatMoney(feeDiagnostics.net_pnl)}</strong>
      </div>
      <div className="metric-card">
        <span>Fees / gross profit</span>
        <strong>{formatFeesPctOfGross(feeDiagnostics.fees_as_pct_of_gross_profit)}</strong>
      </div>
    </div>
  );
}
