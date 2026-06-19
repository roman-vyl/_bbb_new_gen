# Дорожная карта оптимизации загрузки Workbench Chart

Этот документ фиксирует рекомендуемый путь оптимизации загрузки фронта и свечного графика в Research Workbench. Это именно дорожная карта: она описывает направление, приоритеты и архитектурную логику, а не является детальным implementation plan.

Главная мысль: текущая проблема на границе окна графика не в том, что плохо кэшируются свечи. Свечи уже в целом спасены full RAM cache. Проблема в рассинхроне двух разных pipeline:

```text
candles pipeline = local slice from full cache
events pipeline  = exact-window dense backend recompute
```

Чтобы поведение стало продуктовым, оба pipeline нужно привести к одной модели:

```text
range-based resource store
coverage metadata
chunked normalized cache
in-flight dedupe
abort/supersede
partial display state
background prefetch
```

А затем вынести chart events из dense `signal-trace` в отдельный sparse/materialized слой.

---

## Лучший путь, как делать по-взрослому

### Фаза 1. Развязать frontend orchestration без изменения API

Цель этой фазы: меньше хаоса, меньше лишних rerender, быстрее вкладки, ниже риск следующих правок.

Не нужно переписывать всё сразу. Сначала нужно вынести ответственность из одного большого `WorkbenchContext`.

#### Разделить context

Вместо одного огромного `WorkbenchContext` целевая структура должна быть ближе к такой:

```text
WorkbenchShellContext
  activeTab
  run list
  selectedRunId
  selectedVariantKey
  selectedTradeId
  reload

ReportContext
  report
  variants
  metrics
  trade records

ChartDataContext
  market bundle/window
  trace display state
  htf overlays
  viewport commands
  chart loading/stale states
```

`ReportsPanel` не должен подписываться на `displayApplyRevision`.

`ContextBar` не должен rerender от `chartDisplayComponentEvents`.

`ChartPanel` не должен получать весь workbench universe.

#### Сделать chart-heavy IO ленивым

Сейчас chart IO стартует слишком рано.

Правильнее:

```text
runs/report можно грузить сразу
chart-bundle / signal-trace грузить:
  - при первом открытии Chart
  - или idle-prefetch после report ready
  - но не блокировать Composer/Reports
```

Для `Reports` можно держать `ChartPanel` mounted, если он уже был открыт. Это хорошо. Но первый chart-heavy fetch должен зависеть от одного из условий:

```text
activeTab === "chart"
или hasChartEverActivated === true
или explicit background prefetch allowed
```

#### Добавить abort/supersede для fetch

Сейчас stale responses в основном игнорируются логикой, но сам backend может продолжать считать старый trace.

Нужна foundation для abortable requests:

```text
requestJson(..., { signal })
fetchSignalTrace(..., signal)
fetchChartMarketBundle(..., signal)
```

И при смене `run`, `variant`, `context`, `window`:

```text
abort old request
ignore old result
не занимать backend бессмысленной работой, насколько это возможно
```

Это особенно важно для trade navigation, когда пользователь быстро щёлкает сделки.

Важное уточнение: frontend `AbortController` сам по себе не гарантирует, что CPU-bound backend work сразу остановится. В текущем sync FastAPI handler старый расчёт может продолжить выполняться в threadpool. Но frontend cancellation всё равно нужен как базовый механизм для resource identity, stale response handling и будущей cooperative cancellation на backend.

#### Marker memoization — полезно, но не главный фикс

Marker memoization нужна, но её не стоит продавать как основную оптимизацию. Это anti-flicker и cleanup.

Нужны стабильные fingerprint:

```text
trade markers key =
  variantTradeRecordsVersion + selectedTradeId + windowBounds

component markers key =
  componentEventsCoverageId + toggles + windowBounds

management markers key =
  managementEventsVersion + selectedTradeId + windowBounds
```

`markersPlugin.setMarkers(...)` нужно вызывать только если итоговый fingerprint реально изменился.

---

## Фаза 2. Починить event behavior на границах окна

Это главный UX-fix.

Текущая модель:

```text
committed render window -> exact 50k trace request
```

Целевая модель:

```text
committed render window
  -> TraceDisplayStore checks coverage
  -> computes missing ranges
  -> fetches only missing display chunks
  -> keeps old/partial markers visible
  -> merges chunks
  -> updates chart incrementally
```

Но важное уточнение: нельзя просто начать дробить `/signal-trace` на много маленьких запросов, если backend всё равно каждый раз пересчитывает весь feature pipeline. Так можно сделать хуже.

Минимально взрослая версия должна поменять resource model, а не просто добавить ещё один cache.

### 2.1. Ввести нормализованный TraceDisplayStore

Нужен не exact-window cache, а resource cache.

Ключ:

```text
run_id
variant_key
context_overlay_ref
timeframe
chunk_start_ms
chunk_end_ms
```

Хранить отдельно:

```text
component_events chunks
htf_context chunks
coverage intervals
in-flight ranges
failed ranges
```

### 2.2. Использовать missingRange() реально

Сейчас `missingRange()` уже есть, но orchestration всё равно мыслит exact window.

Нужно мыслить так:

```text
visible/render window:
  [from, to)

cache coverage:
  [from, x), [y, to)

missing:
  [x, y)
```

И грузить именно missing, а не весь 50k window.

### 2.3. Не очищать events полностью при cache miss

Сейчас при отсутствии slice есть поведение уровня:

```text
setChartDisplayComponentEvents([])
```

Это визуально и даёт мигание.

Лучше:

```text
current displayed events remain
new window has partial coverage
uncovered area marked stale/loading
when missing chunk arrives -> merge -> update only then
```

Состояние должно быть не binary:

```text
loaded / loading
```

А такое:

```text
current
partial
stale
loadingMissingRange
coveredRanges
missingRanges
```

### 2.4. Prefetch — осторожно

Prefetch соседнего trace chunk при pending window shift — идея правильная, но не первый шаг.

Лучший порядок:

```text
1. post-commit / idle prefetch соседнего chunk
2. near-edge prefetch, когда пользователь приблизился к safe zone
3. active-pan low-priority prefetch с AbortController
```

Почему так: текущие проблемы графика во многом связаны с race conditions. Active prefetch во время pan может снова внести гонки, если нет нормального cancellation, resource identity и in-flight ledger.

---

## Фаза 3. Разделить свечи и overlays

Сейчас `chart-bundle` делает слишком много:

```text
candles + fast EMA + anchor EMA + slow EMA
```

И cache key зависит от variant.

Нужно разделить:

```text
CandleChunkStore
  key: symbol + timeframe + data_range/chunk

EmaOverlayStore
  key: symbol + timeframe + source + period + range/chunk

RunMarketIndex
  key: run_id + symbol + timeframe + report_data_range
```

Тогда при variant switch:

```text
candles не перезагружаются
меняются только overlays, если реально другие periods/source
```

Это особенно важно для сценария с множеством strategy instances.

Первый шаг можно сделать без полного chunked API:

```text
старый chart-bundle сохраняем как source
но раскладываем его внутри frontend cache на candles и overlays отдельно
```

Потом уже можно заменить source на chunked backend.

---

## Фаза 4. Ускорить первый paint графика

Сейчас frontend часто ждёт большой full market bundle.

Целевая продуктовая модель:

```text
1. Report loaded.
2. Chart opens.
3. Determine initial focus:
     selected trade neighborhood
     or tail
     or last saved viewport
4. Fetch only initial candle window.
5. Render quickly.
6. Background load adjacent candle chunks.
7. Background load full run range only if needed.
```

Пример:

```text
initial window: 10k-50k candles
background: previous/next chunks
full range: optional cache fill
```

Но это надо делать вместе с нормальным `CandleChunkStore`. Иначе trade navigation далеко в прошлое начнёт тормозить по свечам так же, как сейчас тормозят events.

---

## Фаза 5. Настоящий backend fix: sparse chart events

Это главный архитектурный шаг.

Сейчас `/signal-trace` — тяжёлый dense endpoint. Он нужен для lanes, debug и inspector, но не должен быть основным источником chart markers.

Нужен отдельный продукт данных:

```text
GET /api/research/runs/{run_id}/chart-events
  ?variant=...
  &from=...
  &to_open_time_ms=...
  &context_overlay_ref=...
```

Он должен возвращать только:

```text
component_events
trade_management_events если надо
htf context display points
maybe sparse overlay points
coverage metadata
```

Без:

```text
dense long/short arrays
full context_consumption_trace
всех internals для каждого бара
```

Ещё лучше — materialized chunks рядом с run artifact:

```text
research/results/runs/{run_id}/chart_event_chunks/
  variant/context/chunk_*.json
```

Первый запрос может посчитать и сохранить chunk. Следующие pan/trade navigation — это чтение sparse artifact, а не пересчёт стратегии.

`/signal-trace` тогда остаётся для:

```text
lanes
bar inspector
deep diagnostics
focused 2k-5k window
```

А не для обычной отрисовки markers на 50k свечей.

---

## Что важно не перепутать

План оптимизации не должен начинаться с идеи, что нужно просто “добавить cache”. В коде уже есть:

```text
signalTraceDisplayCache
coversRange
missingRange
mergeDisplayChunk
```

Проблема не в отсутствии cache вообще.

Проблема в том, что:

```text
frontend display cache chunked
backend/API still exact-window dense
orchestration still exact-window oriented
```

То есть нужно менять resource model.

Также не стоит начинать с агрессивного prefetch поверх текущей системы. Без cancellation, stable resource identity, in-flight range ledger и coverage model можно получить ещё больше гонок:

```text
старый window
новый window
pending shift
selected trade jump
context overlay change
variant switch
```

Сначала нужна устойчивость модели. Потом prefetch.

---

## Итоговая нарезка по PR

### PR 1. Instrumentation + lazy chart activation + abortable client foundation

Это маленький первый PR, без context split.

Что делать:

```text
- расширить существующий dbgTimed/dbgMark:
    market fetch start/end/cache hit
    trace fetch start/end/cache hit/miss
    display cache covers/missingRange result
    setData candles/EMA
    setMarkers
    duplicate/superseded trace request

- сделать chart-heavy IO lazy:
    runs/report грузятся как раньше
    chart-bundle и initial signal-trace не стартуют, пока Chart реально не активирован
    Reports/Composer не должны нечаянно запускать chart-heavy fetch

- добавить AbortController в api/client.ts:
    requestJson(path, init с signal)
    fetchChartMarketBundle(..., signal)
    fetchSignalTrace(..., signal)
```

Важная оговорка: `AbortController` не нужно считать backend cancellation. Это только защита UI от stale response и отмена frontend/network ожидания. CPU-bound `signal_trace_service.py` может продолжить считать.

Acceptance:

```text
поведение графика не меняется
Composer/Reports не запускают chart-bundle/signal-trace до chart activation
stale response не применяется после run/variant/window/context смены
debug сценарии cold chart, tab switch, long pan, distant trade navigation измеряются
```

### PR 2. WorkbenchContext split, но без изменения поведения

Это уже безопасный refactor ответственности.

Цель: не менять cache/API/window semantics, а вынести chart IO из общего контекста.

Нарезка:

```text
WorkbenchProvider остаётся shell-level:
  activeTab
  runs
  selectedRunId
  report
  selectedVariantKey
  selectedTradeId

ChartDataRuntime / hook:
  market load/cache
  render window
  trace display cache
  signal trace load
  aux overlays
  viewport commands
```

Что запретить в этом PR:

```text
не менять /signal-trace contract
не добавлять chunked backend
не добавлять prefetch
не менять торговую/trace семантику
не переписывать ChartPanel полностью
```

Acceptance:

```text
ReportsPanel не подписан на displayApplyRevision
ContextBar не rerenderится от chartDisplayComponentEvents
ChartPanel получает только chart view model / commands
тесты проходят
```

### PR 3. Anti-flicker events: partial display state

Это первый PR, который прямо бьёт по текущему багу.

Сейчас в `applyTraceDisplayForCurrentWindow()` опасная модель: если slice нет, frontend может очистить `chartDisplayComponentEvents`. Это и даёт визуальное “события пропали/мигнули”, пока свечи уже перешли на новый window.

Нужно ввести состояние:

```text
TraceDisplayState:
  status: current | partial | stale | loading_missing | empty
  coveredRanges
  missingRange
  eventsForCoveredPart
  htfForCoveredPart
```

Правило:

```text
При window shift нельзя полностью очищать markers только потому,
что новый exact window ещё не покрыт trace cache.
```

Лучше:

```text
показать то, что покрыто cache
старые/частичные events держать как stale/partial
догружать missing
обновить markers только после merge
```

Acceptance:

```text
при pan за boundary events не исчезают целиком
stale виден только как состояние данных, а не как полный visual reset
component markers не clear/rebuild без реального изменения event fingerprint
```

### PR 4. MissingRange scheduling, но без active-pan prefetch

Вот тут `missingRange()` становится частью scheduling, а не просто check coverage.

Целевая логика:

```text
committed render window
  -> displayCache.coversRange(from, to)?
      yes -> apply slice
      no  -> missing = displayCache.missingRange(from, to)
             fetch missing range
             merge chunk
             apply slice
```

Важный нюанс: если старый `/signal-trace` всё ещё expensive dense compute, то дробить его слишком мелко опасно. Поэтому для временной модели лучше грузить разумный normalized chunk, а не произвольный микродиапазон.

Например:

```text
trace chunk size = 50k bars или 25k bars
chunk boundaries нормализованы по индексам/времени
request key = run + variant + context + normalizedFrom + normalizedTo
```

Что пока не делать:

```text
active-pan prefetch
speculative multi-chunk fanout
backend materialization
```

Можно добавить только `post-commit idle prefetch` соседнего chunk после того, как in-flight ledger и supersede работают стабильно.

### PR 5. Split market cache

Это отдельная ветка, не смешивать с trace.

Сейчас market key включает:

```text
run_id
symbol
timeframe
variant
fast/anchor/slow periods
range
reloadToken
```

Из-за этого candles могут быть привязаны к variant, хотя сами свечи не зависят от variant.

Целевая frontend-модель:

```text
CandlesCache:
  key = symbol + timeframe + from + to + reloadToken

OverlayCache:
  key = symbol + timeframe + source + period + from + to + reloadToken

RunMarketView:
  связывает report/run/variant с нужными cache keys
```

Первым шагом можно не менять backend: пусть `/chart-bundle` пока остаётся источником, но frontend после ответа раскладывает данные в разные cache слои. Потом уже можно перейти на `/candles` и `/indicators/ema`.

Acceptance:

```text
switch variant при том же symbol/timeframe/data_range не перезагружает candles
перегружаются только реально отличающиеся overlays
```

### PR 6. Sparse/materialized chart events

Это уже не frontend refactor, а отдельный OpenSpec.

Цель:

```text
Chart markers/HTF display не должны питаться от dense /signal-trace.
```

Нужен отдельный backend product:

```text
/api/research/runs/{run_id}/chart-events
```

Он возвращает:

```text
component_events
htf display points / context states
coverage metadata
```

И не возвращает:

```text
long/short dense arrays
internals на каждый бар
context_consumption_trace на каждый бар
```

`/signal-trace` оставить для:

```text
lanes
bar inspector
debug diagnostics
focused small window
```

Это главный взрослый backend fix.

---

## Целевая архитектура

Целевая схема:

```text
WorkbenchShell
  ├─ RunStore
  ├─ ReportStore
  └─ UI selection state

ChartRuntime
  ├─ RenderWindowController
  ├─ CandleChunkStore
  ├─ OverlayStore
  ├─ TraceDisplayStore
  ├─ DenseTraceStore
  └─ ViewportCommandQueue

ChartPanel
  receives:
    candles slice
    EMA overlays slice
    sparse events slice
    stale/coverage state
    viewport command
```

Ключевые принципы:

```text
ChartPanel не должен знать, как грузятся данные.
WorkbenchContext не должен быть базой данных.
SignalTrace dense bundle не должен кормить обычные markers.
```

---

## Самый важный практический вывод

Текущий баг на границе окна — это не “плохо кэшируются свечи”. Свечи как раз более-менее спасены full RAM cache.

Проблема в том, что:

```text
candles pipeline = local slice from full cache
events pipeline  = exact-window dense backend recompute
```

Поэтому они рассинхронизируются по скорости и состояниям.

Начинать лучше не с большого переписывания backend, а с двух безопасных frontend шагов:

```text
1. развязать WorkbenchContext / lazy chart IO / abort foundation
2. убрать all-or-nothing event display на cache miss
```

После этого главный взрослый шаг:

```text
sparse chart-events chunks вместо /signal-trace как источника markers
```

