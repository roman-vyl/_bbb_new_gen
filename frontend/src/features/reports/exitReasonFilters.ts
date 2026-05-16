export const EXIT_REASON_FILTER_OPTIONS = [
  { id: "all", label: "All" },
  { id: "open", label: "open" },
  { id: "unknown", label: "unknown" },
  { id: "stop_loss", label: "stop_loss:*" },
  { id: "take_profit", label: "take_profit:*" },
  { id: "signal", label: "signal:*" },
] as const;

export type ExitReasonFilterId = (typeof EXIT_REASON_FILTER_OPTIONS)[number]["id"];

export function matchesExitReasonFilter(exitReason: string, filter: ExitReasonFilterId): boolean {
  if (filter === "all") return true;
  if (filter === "open") return exitReason === "open";
  if (filter === "unknown") return exitReason === "unknown";
  if (filter === "stop_loss") return exitReason.startsWith("stop_loss:");
  if (filter === "take_profit") return exitReason.startsWith("take_profit:");
  if (filter === "signal") return exitReason.startsWith("signal:");
  return true;
}
