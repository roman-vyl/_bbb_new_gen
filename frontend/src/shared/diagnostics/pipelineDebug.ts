/** Opt-in Workbench pipeline timings. Enable with VITE_EMA_PIPELINE_DEBUG=true. */

type Row = { count: number; totalMs: number; maxMs: number };

const stats = new Map<string, Row>();

export function pipelineDebugEnabled(): boolean {
  return import.meta.env.VITE_EMA_PIPELINE_DEBUG === "true";
}

export function dbgMark(step: string, meta?: Record<string, unknown>): void {
  if (!pipelineDebugEnabled()) return;
  const row = stats.get(step) ?? { count: 0, totalMs: 0, maxMs: 0 };
  row.count += 1;
  stats.set(step, row);
  console.debug("[pipeline]", step, { count: row.count, ...meta });
}

export async function dbgTimed<T>(
  step: string,
  fn: () => Promise<T>,
  meta?: Record<string, unknown>,
): Promise<T> {
  if (!pipelineDebugEnabled()) {
    return fn();
  }
  const t0 = performance.now();
  try {
    return await fn();
  } finally {
    const ms = performance.now() - t0;
    const row = stats.get(step) ?? { count: 0, totalMs: 0, maxMs: 0 };
    row.count += 1;
    row.totalMs += ms;
    row.maxMs = Math.max(row.maxMs, ms);
    stats.set(step, row);
    console.debug("[pipeline]", step, { count: row.count, ms: ms.toFixed(1), ...meta });
  }
}

export function dbgFlush(label = "workbench"): void {
  if (!pipelineDebugEnabled()) return;
  const rows = [...stats.entries()].sort(([a], [b]) => a.localeCompare(b));
  console.group(`=== PIPELINE_DEBUG [${label}] ===`);
  console.table(
    rows.map(([step, row]) => ({
      step: row.count > 1 ? `REPEAT ${step}` : step,
      count: row.count,
      total_ms: row.totalMs.toFixed(1),
      max_ms: row.maxMs.toFixed(1),
    })),
  );
  console.groupEnd();
}

if (pipelineDebugEnabled() && typeof window !== "undefined") {
  (window as unknown as { __pipelineDebugFlush?: () => void }).__pipelineDebugFlush =
    dbgFlush;
}
