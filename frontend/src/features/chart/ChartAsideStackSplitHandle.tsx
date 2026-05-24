import {
  CHART_ASIDE_STACK_SPLIT_HANDLE_HEIGHT,
  MIN_CHART_ASIDE_STACK_DIAGNOSTICS_HEIGHT,
} from "@/features/chart/chartAsideStackSplit";

type ChartAsideStackSplitHandleProps = {
  diagnosticsHeight: number;
  maxDiagnosticsHeight: number;
  onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onPointerMove: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onPointerUp: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onPointerCancel: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onDoubleClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
};

export function ChartAsideStackSplitHandle({
  diagnosticsHeight,
  maxDiagnosticsHeight,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onDoubleClick,
}: ChartAsideStackSplitHandleProps) {
  return (
    <button
      type="button"
      className="chart-panel__aside-split"
      style={{
        height: CHART_ASIDE_STACK_SPLIT_HANDLE_HEIGHT,
        flexBasis: CHART_ASIDE_STACK_SPLIT_HANDLE_HEIGHT,
      }}
      data-testid="chart-aside-stack-split"
      aria-orientation="horizontal"
      aria-label="Resize trade report and bar inspector"
      aria-valuenow={diagnosticsHeight}
      aria-valuemin={MIN_CHART_ASIDE_STACK_DIAGNOSTICS_HEIGHT}
      aria-valuemax={maxDiagnosticsHeight}
      title="Drag to resize · double-click to reset"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onDoubleClick={onDoubleClick}
    />
  );
}
