import { useCallback, useEffect, useRef, useState } from "react";

import type { SignalTraceBundle } from "@/api/types";
import { barIndexAtTime } from "@/features/chart/signalTraceLookup";

type TimelineSide = "long" | "short";

type TimelineLaneKey =
  | "direction_ok"
  | "setup_ok"
  | "trigger_ok"
  | "blockers_ok"
  | "portfolio_entry";

const LANES: { key: TimelineLaneKey; label: string; hint: string }[] = [
  { key: "direction_ok", label: "Direction", hint: "EMA trend allows this side" },
  { key: "setup_ok", label: "Setup", hint: "Pullback setup satisfied" },
  { key: "trigger_ok", label: "Trigger", hint: "Entry trigger fired" },
  { key: "blockers_ok", label: "Blockers", hint: "All blocker filters allow entry" },
  { key: "portfolio_entry", label: "Entry", hint: "Portfolio entry (final gate)" },
];

const ROW_HEIGHT = 14;
const GAP = 2;
const LANE_ROW_PX = ROW_HEIGHT + GAP;
const TIMELINE_TOP_PAD_PX = GAP;

type SignalTimelineLanesProps = {
  signalTrace: SignalTraceBundle | null;
  selectedBarTimeSec: number | null;
  onSelectBar: (timeSec: number) => void;
};

export function SignalTimelineLanes({
  signalTrace,
  selectedBarTimeSec,
  onSelectBar,
}: SignalTimelineLanesProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [side, setSide] = useState<TimelineSide>("long");

  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap || !signalTrace) {
      return;
    }
    const sideTrace = side === "long" ? signalTrace.long : signalTrace.short;
    const count = signalTrace.times.length;
    if (count === 0) {
      return;
    }

    const width = Math.max(wrap.clientWidth, 1);
    const height = LANES.length * (ROW_HEIGHT + GAP) + GAP;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#0f1419";
    ctx.fillRect(0, 0, width, height);

    const barW = width / count;
    const selectedIdx =
      selectedBarTimeSec === null ? -1 : barIndexAtTime(signalTrace.times, selectedBarTimeSec);

    LANES.forEach((lane, laneIdx) => {
      const y = GAP + laneIdx * (ROW_HEIGHT + GAP);
      const values = sideTrace[lane.key] as boolean[];
      if (!Array.isArray(values)) {
        return;
      }
      for (let i = 0; i < count; i += 1) {
        const x = i * barW;
        ctx.fillStyle = values[i] ? "#22c55e" : "#1e2836";
        ctx.fillRect(x, y, Math.max(barW, 1), ROW_HEIGHT);
      }
    });

    if (selectedIdx >= 0 && selectedIdx < count) {
      const x = selectedIdx * barW + barW / 2;
      ctx.strokeStyle = "#fbbf24";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
  }, [signalTrace, side, selectedBarTimeSec]);

  useEffect(() => {
    paint();
    const wrap = wrapRef.current;
    if (!wrap) {
      return;
    }
    const ro = new ResizeObserver(() => paint());
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [paint]);

  const handleClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!signalTrace || signalTrace.times.length === 0) {
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const idx = Math.min(
      signalTrace.times.length - 1,
      Math.max(0, Math.floor((x / rect.width) * signalTrace.times.length)),
    );
    onSelectBar(signalTrace.times[idx]!);
  };

  if (!signalTrace) {
    return null;
  }

  return (
    <div className="signal-timeline">
      <div className="signal-timeline__header">
        <span className="signal-timeline__title">Signal timeline</span>
        <span className="signal-timeline__key" aria-label="Lane colors">
          <span className="signal-timeline__swatch signal-timeline__swatch--pass" aria-hidden />
          pass
          <span className="signal-timeline__swatch signal-timeline__swatch--fail" aria-hidden />
          fail
        </span>
        <label className="signal-timeline__side">
          Side
          <select value={side} onChange={(e) => setSide(e.target.value as TimelineSide)}>
            <option value="long">long</option>
            <option value="short">short</option>
          </select>
        </label>
      </div>
      <div className="signal-timeline__lanes">
        <div
          className="signal-timeline__labels"
          role="list"
          aria-label="Pipeline lanes"
          style={{ paddingTop: TIMELINE_TOP_PAD_PX }}
        >
          {LANES.map((lane) => (
            <div
              key={lane.key}
              className="signal-timeline__lane-label"
              role="listitem"
              style={{ height: LANE_ROW_PX }}
              title={lane.hint}
            >
              <span className="signal-timeline__lane-name">{lane.label}</span>
            </div>
          ))}
        </div>
        <div ref={wrapRef} className="signal-timeline__canvas-wrap">
          <canvas ref={canvasRef} className="signal-timeline__canvas" onClick={handleClick} />
        </div>
      </div>
    </div>
  );
}
