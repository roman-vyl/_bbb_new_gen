import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

import {
  clampDiagnosticsHeight,
  DEFAULT_CHART_ASIDE_STACK_DIAGNOSTICS_HEIGHT,
  persistDiagnosticsHeight,
  readStoredDiagnosticsHeight,
} from "@/features/chart/chartAsideStackSplit";

export function useChartAsideStackResize(
  asideRef: RefObject<HTMLElement | null>,
  enabled: boolean,
) {
  const [diagnosticsHeight, setDiagnosticsHeight] = useState(readStoredDiagnosticsHeight);
  const [containerHeight, setContainerHeight] = useState(600);
  const diagnosticsHeightRef = useRef(diagnosticsHeight);
  diagnosticsHeightRef.current = diagnosticsHeight;

  const dragRef = useRef<{ startY: number; startHeight: number } | null>(null);

  const clampToContainer = useCallback(
    (height: number) => {
      const heightPx = asideRef.current?.clientHeight ?? 600;
      return clampDiagnosticsHeight(height, heightPx);
    },
    [asideRef],
  );

  useEffect(() => {
    if (!enabled) return;
    const el = asideRef.current;
    if (!el) return;

    let rafId = 0;

    const sync = () => {
      const height = el.clientHeight;
      if (height === 0) return;
      setContainerHeight((prev) => (prev === height ? prev : height));
      setDiagnosticsHeight((current) => {
        const next = clampDiagnosticsHeight(current, height);
        return next === current ? current : next;
      });
    };

    const scheduleSync = () => {
      if (rafId !== 0) return;
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        sync();
      });
    };

    scheduleSync();
    const ro = new ResizeObserver(scheduleSync);
    ro.observe(el);
    return () => {
      ro.disconnect();
      if (rafId !== 0) cancelAnimationFrame(rafId);
    };
  }, [asideRef, enabled]);

  const endDrag = useCallback(() => {
    dragRef.current = null;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    persistDiagnosticsHeight(diagnosticsHeightRef.current);
  }, []);

  const onSplitPointerDown = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { startY: event.clientY, startHeight: diagnosticsHeightRef.current };
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
  }, []);

  const onSplitPointerMove = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (!dragRef.current) return;
      const { startY, startHeight } = dragRef.current;
      const next = clampToContainer(startHeight + (event.clientY - startY));
      setDiagnosticsHeight(next);
    },
    [clampToContainer],
  );

  const onSplitPointerUp = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (!dragRef.current) return;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      endDrag();
    },
    [endDrag],
  );

  const onSplitPointerCancel = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      endDrag();
    },
    [endDrag],
  );

  const onSplitDoubleClick = useCallback(() => {
    const reset = clampToContainer(DEFAULT_CHART_ASIDE_STACK_DIAGNOSTICS_HEIGHT);
    setDiagnosticsHeight(reset);
    persistDiagnosticsHeight(reset);
  }, [clampToContainer]);

  const maxDiagnosticsHeight = clampDiagnosticsHeight(Number.MAX_SAFE_INTEGER, containerHeight);

  return {
    diagnosticsHeight,
    maxDiagnosticsHeight,
    stackSplitHandleProps: {
      onPointerDown: onSplitPointerDown,
      onPointerMove: onSplitPointerMove,
      onPointerUp: onSplitPointerUp,
      onPointerCancel: onSplitPointerCancel,
      onDoubleClick: onSplitDoubleClick,
    },
  };
}
