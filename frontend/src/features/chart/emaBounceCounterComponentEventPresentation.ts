import type { ComponentEvent } from "@/api/types";

export const EMA_BOUNCE_COUNTER_SETUP_COMPONENT_ID = "ema_bounce_counter_setup";

function metaString(meta: Record<string, unknown>, key: string): string | null {
  const value = meta[key];
  return typeof value === "string" ? value : null;
}

function metaNumber(meta: Record<string, unknown>, key: string): number | null {
  const value = meta[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function metaBool(meta: Record<string, unknown>, key: string): boolean | null {
  const value = meta[key];
  return typeof value === "boolean" ? value : null;
}

function formatBoolFlag(label: string, value: boolean | null): string | null {
  if (value === null) {
    return null;
  }
  return `${label}: ${value ? "yes" : "no"}`;
}

export function formatEmaBounceCounterEventLabel(event: ComponentEvent): string | null {
  if (event.component_id !== EMA_BOUNCE_COUNTER_SETUP_COMPONENT_ID) {
    return null;
  }
  const eventName = metaString(event.metadata, "event_name");
  if (!eventName) {
    return null;
  }
  const bounceNumber = metaNumber(event.metadata, "effective_bounce_number");
  const bounceLabel = bounceNumber !== null ? String(bounceNumber) : "?";

  switch (eventName) {
    case "bounce_opportunity_start":
      return `B${bounceLabel} touch`;
    case "pending_bounce_start":
      return `B${bounceLabel}▶`;
    case "pending_bounce_end":
      return `B${bounceLabel}■`;
    case "trend_start":
      return "T+";
    case "trend_break":
      return "T-";
    default:
      return null;
  }
}

export function formatEmaBounceCounterEventTooltip(event: ComponentEvent): string | null {
  if (event.component_id !== EMA_BOUNCE_COUNTER_SETUP_COMPONENT_ID) {
    return null;
  }
  const meta = event.metadata;
  const eventName = metaString(meta, "event_name");
  const lines: string[] = [];

  if (eventName) {
    lines.push(eventName.replaceAll("_", " "));
  }

  const effective = metaNumber(meta, "effective_bounce_number");
  const maxBounces = metaNumber(meta, "max_bounces");
  if (effective !== null && maxBounces !== null) {
    lines.push(`Bounce ${effective}/${maxBounces}`);
  }

  const completed = metaNumber(meta, "completed_bounce_count");
  if (completed !== null) {
    lines.push(`completed: ${completed}`);
  }

  const trendActive = metaBool(meta, "trend_active");
  const trendEpisodeId = metaNumber(meta, "trend_episode_id");
  if (trendActive !== null) {
    const episode =
      trendEpisodeId !== null && trendEpisodeId > 0 ? ` · episode #${trendEpisodeId}` : "";
    lines.push(`trend active: ${trendActive ? "yes" : "no"}${episode}`);
  } else if (trendEpisodeId !== null && trendEpisodeId > 0) {
    lines.push(`trend episode #${trendEpisodeId}`);
  }

  const lookbackBars = metaNumber(meta, "touch_lookback_bars");
  const lookbackLeft = metaNumber(meta, "touch_lookback_left");
  const inLookback = metaBool(meta, "in_touch_lookback");
  if (lookbackBars !== null) {
    const leftText = lookbackLeft !== null ? ` (${lookbackLeft} left)` : "";
    const inLookbackText = inLookback !== null ? ` · in_touch_lookback: ${inLookback ? "yes" : "no"}` : "";
    lines.push(`lookback: ${lookbackBars} bars${leftText}${inLookbackText}`);
  } else if (inLookback !== null) {
    lines.push(`in_touch_lookback: ${inLookback ? "yes" : "no"}`);
  }

  for (const flag of [
    formatBoolFlag("armed", metaBool(meta, "armed")),
    formatBoolFlag("raw_touch", metaBool(meta, "raw_touch")),
    formatBoolFlag("pending_bounce", metaBool(meta, "pending_bounce")),
    formatBoolFlag("setup_allowed", metaBool(meta, "setup_allowed")),
  ]) {
    if (flag) {
      lines.push(flag);
    }
  }

  const fast = metaNumber(meta, "fast_ema");
  const anchor = metaNumber(meta, "anchor_ema");
  const slow = metaNumber(meta, "slow_ema");
  if (fast !== null && anchor !== null && slow !== null) {
    lines.push(`EMA ${fast}/${anchor}/${slow}`);
  }

  const priceSide = metaString(meta, "price_side_of_anchor");
  if (priceSide) {
    lines.push(`price side: ${priceSide}`);
  }

  lines.push(`${event.side} · ${event.instance_id}`);

  return lines.length > 0 ? lines.join("\n") : null;
}
