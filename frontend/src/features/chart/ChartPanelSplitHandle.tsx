import {
  CHART_SPLIT_HANDLE_WIDTH,
  MIN_CHART_ASIDE_WIDTH,
} from "@/features/chart/chartPanelSplit";

type ChartPanelSplitHandleProps = {
  asideWidth: number;
  maxAsideWidth: number;
  onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onPointerMove: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onPointerUp: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onPointerCancel: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onDoubleClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
};

export function ChartPanelSplitHandle({
  asideWidth,
  maxAsideWidth,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onDoubleClick,
}: ChartPanelSplitHandleProps) {
  return (
    <button
      type="button"
      className="chart-panel__split"
      style={{ width: CHART_SPLIT_HANDLE_WIDTH, flexBasis: CHART_SPLIT_HANDLE_WIDTH }}
      aria-orientation="vertical"
      aria-label="Resize chart and analysis panels"
      aria-valuenow={asideWidth}
      aria-valuemin={MIN_CHART_ASIDE_WIDTH}
      aria-valuemax={maxAsideWidth}
      title="Drag to resize · double-click to reset"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onDoubleClick={onDoubleClick}
    />
  );
}
