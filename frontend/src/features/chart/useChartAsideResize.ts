import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

import {
  clampAsideWidth,
  DEFAULT_CHART_ASIDE_WIDTH,
  persistAsideWidth,
  readStoredAsideWidth,
} from "@/features/chart/chartPanelSplit";

export function useChartAsideResize(bodyRef: RefObject<HTMLElement | null>) {
  const [asideWidth, setAsideWidth] = useState(readStoredAsideWidth);
  const [containerWidth, setContainerWidth] = useState(1200);
  const asideWidthRef = useRef(asideWidth);
  asideWidthRef.current = asideWidth;

  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const clampToContainer = useCallback(
    (width: number) => {
      const containerWidth = bodyRef.current?.clientWidth ?? 1200;
      return clampAsideWidth(width, containerWidth);
    },
    [bodyRef],
  );

  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;

    let rafId = 0;

    const sync = () => {
      const width = el.clientWidth;
      if (width === 0) return;
      setContainerWidth((prev) => (prev === width ? prev : width));
      setAsideWidth((current) => {
        const next = clampAsideWidth(current, width);
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
  }, [bodyRef]);

  const endDrag = useCallback(() => {
    dragRef.current = null;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    persistAsideWidth(asideWidthRef.current);
  }, []);

  const onSplitPointerDown = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { startX: event.clientX, startWidth: asideWidthRef.current };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  const onSplitPointerMove = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (!dragRef.current) return;
      const { startX, startWidth } = dragRef.current;
      const next = clampToContainer(startWidth + startX - event.clientX);
      setAsideWidth(next);
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
    const reset = clampToContainer(DEFAULT_CHART_ASIDE_WIDTH);
    setAsideWidth(reset);
    persistAsideWidth(reset);
  }, [clampToContainer]);

  const maxAsideWidth = clampAsideWidth(Number.MAX_SAFE_INTEGER, containerWidth);

  return {
    asideWidth,
    maxAsideWidth,
    splitHandleProps: {
      onPointerDown: onSplitPointerDown,
      onPointerMove: onSplitPointerMove,
      onPointerUp: onSplitPointerUp,
      onPointerCancel: onSplitPointerCancel,
      onDoubleClick: onSplitDoubleClick,
    },
  };
}
