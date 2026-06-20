# Master Plan: Workbench Chart Orchestration Cleanup / Display Model v2

Status: master-plan (human-readable); **not** an active OpenSpec change — planned after `market-bundle-cold-load-optimization` Phase 7  
Related: [24_workbench_chart_loading_roadmap.md](./24_workbench_chart_loading_roadmap.md), OpenSpec change `openspec/changes/market-bundle-cold-load-optimization/`  
Audience: frontend Workbench / Chart pipeline

---

## Контекст

После **market-bundle-cold-load-optimization** Workbench перешёл с монолитной загрузки `GET /api/market/chart-bundle` на split-resource модель:

```text
candles-window  → свечи
ema-window      → EMA overlays по периодам
chart-events    → markers / events / HTF display
signal-trace    → dense diagnostics / lanes / inspector
```

**Функционально цель достигнута:**

- cold open больше не требует full report range;
- свечи могут появляться раньше EMA;
- pan-prefetch догружает соседние market intervals;
- distant trade navigation работает через windowed resources.

**Phase 6 принят как functionally usable.** Оставшаяся визуальная шероховатость (фризы, тяжёлые `setData` при расширении coverage) сознательно выносится в этот план и **не блокирует Phase 7** (perf comparison, legacy chart-bundle deprecation, archive).

---

## Что уже снято (Phase 6 baseline)

По последнему pipeline debug главный orchestration blocker снят:

| Symptom | Status |
|--------|--------|
| EMA arrival → `wb.render_window.init` | Fixed — overlay revision отдельно от foundation key |
| Pan-prefetch → смена render/focus target | Fixed — `marketFocusWindow` vs `marketCoverageWindow` |
| Pending prefetch → `cachedBundle` null → empty chart frame | Fixed — compose fallback на focus window |
| `render_window.init` на pan-prefetch | Fixed — count остаётся 1 |

**Оставшаяся проблема тоньше:** growing coverage/cache иногда напрямую превращается в growing chart series data. Cache/prefetch state всё ещё слишком близко к тому, что отдаётся в ChartPanel через `setData`.

---

## Главная проблема

В Workbench смешаны несколько разных смыслов «окна»:

```text
focus window
  зачем пользователь оказался в этой области:
  cold open, selected trade, run/variant/timeframe switch

coverage window
  какой market range загружен или догружается в cache:
  candles/EMA intervals для pan/prefetch

render window
  текущий logical/visible window графика (50k bar slice + safe zone)

display series window   ← пока нет отдельного слоя
  какой bounded range реально отдаётся в lightweight-charts series.setData
```

Мы уже отделили `focusWindow` от `coverageWindow`, но **полноценного `displaySeriesWindow` пока нет**. Поэтому после pan-prefetch и merge chunk ChartPanel может получать слишком большой или резко изменившийся массив данных → тяжёлый `series.setData`, пересчёт шкал lightweight-charts, viewport restore, визуальный фриз / ощущение re-init.

### Ключевое правило дизайна

```text
Coverage is not display.

coverageWindow      = what we have or want in cache
displaySeriesWindow = what we push into lightweight-charts
```

Эти окна **не должны совпадать по умолчанию**.

---

## Целевая идея

Ввести отдельный **pure** слой `marketDisplayModel` / `chartDisplayModel`, который отвечает только за одно:

```text
focusWindow + coverageWindow + visibleRange + cacheCoverage
  → bounded displaySeriesWindow (+ reason / restore hints)
```

Этот слой **не должен:**

- грузить данные;
- знать API;
- трогать React state;
- запускать trace/chart-events;
- управлять viewport.

---

## Целевая модель слоёв

```text
Backend services
  fetch_candles_window
  fetch_ema_window
  canonical EMA cache

API client
  fetchCandlesWindow
  fetchEmaWindow

marketResourceCache
  interval storage, merge/slice/coverage
  candles and overlays independently

marketWindowPlanner
  missing resource intervals
  plan candles/EMA window fetches

workbenchMarketLoad
  execute planned fetches
  seed marketResourceCache
  emit debug/load decisions

marketDisplayModel                    ← NEW (pure)
  focusWindow + coverageWindow + visibleRange + cache state
  → bounded displaySeriesWindow + reason/restore hints

runMarketView
  market identity, keys, overlay refs
  compose from explicit requested display window only

WorkbenchContext
  orchestration: state, effects, wiring outputs
  no inline market math

ChartPanel
  arrays + viewport commands
  lightweight-charts series lifecycle
  stable data keys; skip redundant setData
```

---

## Responsibility boundaries

### `marketResourceCache`

**Allowed:** store/merge candle and overlay intervals; slice explicit ranges; coverage/missingRange.

**Forbidden:** decide visible chart window; focus/trade/tail; network; Workbench lifecycle.

### `marketWindowPlanner`

**Allowed:** plan missing fetches; dedupe in-flight candles/EMA; compute target fetch interval.

**Forbidden:** decide ChartPanel render range; mutate React state; viewport restore.

### `marketDisplayModel` (new)

**Allowed:** derive `displaySeriesWindow`; cap display range; preserve visible-range semantics; explain why display window changed.

**Forbidden:** fetch; seed cache; `setData`; chart-events/signal-trace.

### `WorkbenchContext`

**Allowed:** hold run/variant/trade/chart state; call planner/load/display helpers; coordinate effects.

**Forbidden:** growing inline market math; manual focus/coverage/display stitching; chart data combiner.

### `ChartPanel`

**Allowed:** `setData` / incremental `update`; viewport commands; guard duplicate setData by stable keys.

**Forbidden:** market fetch windows; cache coverage policy; EMA loading policy.

---

## Target behavior

### Cold open

1. Resolve `focusWindow`.
2. Fetch `candles-window`.
3. Candles render as soon as ready.
4. Fetch EMA windows independently.
5. EMA overlays appear progressively.
6. No full chart-bundle.

### Pan near edge

1. User pans near edge of loaded **display** range.
2. Planner expands **coverage** / prefetch interval.
3. Existing chart data remains visible during fetch (compose fallback / display model).
4. New chunk merges into cache.
5. **`marketDisplayModel`** decides whether `displaySeriesWindow` should expand/shift — bounded, not full accumulated coverage.
6. ChartPanel receives bounded data.
7. Viewport preserved by time anchor.
8. No `render_window.init`.
9. No trade/tail refocus.

### Distant trade jump

1. `focusWindow` changes (selected trade).
2. Coverage fetches around that trade.
3. Old distant cache intervals may remain; gaps between far intervals are not fetched.
4. `displaySeriesWindow` bounded around selected trade.

---

## Planned technical direction

### 1. Pure module `marketDisplayModel.ts`

Types (sketch):

```typescript
type DisplaySeriesWindow = {
  fromMs: number;
  toMs: number;
  toOpenTimeMs: number;
  reason: "focus" | "visible_buffer" | "pan_extend" | "trade_focus";
  source: "focus" | "coverage" | "visible";
  // optional: anchorTimeSec, restoreHint
};
```

Inputs: `focusWindow`, `coverageWindow`, visible logical range (or time bounds), cache coverage metadata, render window indices.

Output: bounded `displaySeriesWindow` + diagnostic reason (for `wb.display_series_decision` debug step).

### 2. Cap policy

- Display series stays near **current visible range + buffer**.
- Does **not** grow unbounded with accumulated coverage.
- Initial cap: ~`CHART_RENDER_WINDOW_SIZE` + safe-zone buffer (see `chartViewWindow.ts`).

### 3. Compose path change

Today (Phase 6 interim):

```text
composeDisplayMarketWindowBundle(view, focusWindow, coverageWindow)
  → fallback to focus while coverage cache in flight
```

Target (v2):

```text
displayWindow = deriveDisplaySeriesWindow(...)
composePartialRunMarketWindowBundle(view, displayWindow)
```

Coverage may be `[0..4M ms]` in cache; display might be `[visible- buffer .. visible+ buffer]` only.

### 4. ChartPanel stable data keys

Skip redundant `setData` when key unchanged:

```text
candles: firstTime:lastTime:count
EMA:     role:period:firstTime:lastTime:count
aux:     id:firstTime:lastTime:count
```

Prefer `series.update()` for append-only left/right extend when bounds shift but overlap is large (follow-up slice inside ChartPanel or display model hint).

### 5. Non-goals for v2

- Do **not** reintroduce full `chart-bundle` cold path.
- Do **not** merge chart-events/signal-trace into market loading.
- Do **not** patch `WorkbenchContext` with more refs/if-chains instead of the pure model.
- Do **not** touch backend unless frontend profiling proves a real backend bottleneck.

---

## Acceptance criteria

### Functional

- [ ] Cold open via `candles-window` + `ema-window` per period.
- [ ] Pan-prefetch loads adjacent intervals only (missing range).
- [ ] Distant trade navigation unchanged.
- [ ] chart-events and signal-trace remain independent schedulers.

### Visual

- [ ] No empty chart frame during prefetch.
- [ ] No full blink when coverage expands (bounded display series).
- [ ] No `render_window.init` on pan-prefetch.
- [ ] No trade/tail refocus on pan-prefetch.
- [ ] Viewport stable after chunk merge (time anchor).

### Performance / debug

- [ ] Cold open: 1× `candles-window` + 1× `ema-window` per required period.
- [ ] Pan adjacent chunk: +1× `candles-window` + +1× `ema-window` per required period (not full re-fetch).
- [ ] `chart.setData.candles` does not fire for equivalent data key.
- [ ] `chart.setData.anchor_ema` does not fire for equivalent overlay key.
- [ ] Display series bar count remains bounded (cap policy).

---

## Suggested implementation phases (future OpenSpec)

Review-gated; do not batch without approval.

| Phase | Scope |
|-------|--------|
| **D1 — Model + tests** | `marketDisplayModel.ts`, unit tests for cap/buffer/visible anchoring; debug step `wb.display_series_decision`. |
| **D2 — Compose wire-up** | WorkbenchContext uses display window for `cachedBundle` / chart slice; keep coverage for fetch only. |
| **D2 STOP** | Manual smoke: pan prefetch, no grow-unbounded setData bar counts. |
| **D3 — ChartPanel keys + update path** | Stable keys; optional incremental update for edge extend. |
| **D4 — Cleanup** | Remove interim compose fallback complexity where display model subsumes it; trim WorkbenchContext refs. |

Phase 7 of `market-bundle-cold-load-optimization` (comparison doc, legacy deprecation, archive) proceeds **in parallel** — no dependency on D1–D4.

---

## What not to do

- Continue patching `WorkbenchContext` with prefetch/display edge cases.
- Make `runMarketView` a display orchestration combiner.
- Make `ChartPanel` decide market windows or fetch policy.
- Solve flicker by hiding loaders or suppressing errors only.
- Block Phase 7 archive on visual polish.

---

## Current status (2026-06)

```text
market-bundle-cold-load-optimization Phase 6  → accepted (functional)
market-bundle-cold-load-optimization Phase 7  → proceed (perf / migration / archive)
Display Model v2                              → this document; separate change when scheduled
```

Interim mitigations already in tree (Phase 6.9): `marketFocusWindow` / `marketCoverageWindow` split, compose focus fallback during in-flight prefetch, left-expand `offsetWindowStart` on prepended bars. These are **baseline**, not the final display architecture.

Future frontend architecture risks / refactor backlog

После market-bundle-cold-load-optimization главный data-loading монолит был разрезан на отдельные data products:

candles-window
ema-window
chart-events
signal-trace

Это закрывает самый тяжёлый bottleneck: Workbench больше не должен зависеть от одного огромного chart-bundle.

Но в процессе стало видно несколько зон фронта, которые требуют отдельного будущего внимания.

1. Workbench orchestration / display lifecycle

Главный текущий долг — WorkbenchContext и связанный lifecycle графика.

Сейчас WorkbenchContext всё ещё концентрирует слишком много ответственностей:

run / variant / trade selection
report loading
market loading
focus window
coverage window
render window
viewport commands
pan prefetch
chart-events scheduling
signal-trace scheduling
debug lifecycle

Функционально это работает, но дальнейшее развитие через добавление новых refs/effects/guards в тот же Context опасно.

Целевая идея будущего рефактора:

WorkbenchContext = orchestration/wiring only
marketDisplayModel = pure model для displaySeriesWindow
marketResourceCache = cache/coverage only
marketWindowPlanner = fetch planning only
ChartPanel = rendering only

Ключевое правило:

coverageWindow ≠ displaySeriesWindow

Coverage может расти для prefetch/cache, но ChartPanel должен получать bounded/stable display range.

2. ChartPanel / lightweight-charts series lifecycle

Даже если Workbench не делает render_window.init, график может визуально моргать из-за тяжёлых series.setData.

Будущий рефактор должен отдельно стабилизировать:

stable data keys
skip setData for equivalent arrays
bounded display series window
viewport restore by time anchor
no empty candle/EMA frame during async loading

ChartPanel не должен решать market-window логику. Он должен только безопасно применять уже подготовленные arrays/commands.

3. Strategy Composer state model

Composer пока не главный пожар, но потенциально может повторить путь WorkbenchContext.

Риск:

catalog
draft config
validation
save/load
component forms
selected instance
backend sync

могут снова налипнуть в один большой Context/component.

Будущая целевая модель:

catalog model
draft state model
validation model
persistence/load-save model
UI forms

раздельно.

4. Reports filters → Chart interaction

Будущая зона риска — связь фильтров отчёта, выбранных сделок, markers, chart-events и diagnostics.

Не делать прямую сцепку:

Reports UI state → ChartPanel напрямую

Лучше заранее выделить:

chartFilterModel / reportSelectionModel

который будет описывать, какие trades/events видимы на графике и почему.

5. Debug / pipeline instrumentation hygiene

pipelineDebug очень полезен, но его нельзя превращать в часть логики.

Правило:

debug marks describe lifecycle
debug marks do not control lifecycle

Также стоит следить, чтобы debug marks не спамились на каждый pixel-level event без dedupe.

Process guard for future frontend work

Перед каждой новой frontend-фичей нужно отвечать:

1. Это новый data resource?
2. Это новый user intent?
3. Это новый display model?
4. Это новый rendering lifecycle?
5. Это новая diagnostics/trace информация?

Если “да” больше чем на один пункт — нельзя просто добавлять state/effects в существующий Context. Нужно сначала назвать слой и границу ответственности.

Stop rule:

Если во время одной фичи третий раз чиним один и тот же Context/комбайн,
останавливаем implementation и выносим pure model/helper.

Главная формула:

данные отдельно
намерения пользователя отдельно
cache coverage отдельно
display window отдельно
render lifecycle отдельно

Если один файл начинает знать сразу 4 из 5 — это будущий монстр.