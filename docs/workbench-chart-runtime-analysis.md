# Workbench Chart Runtime Analysis

Анализ выполнен по текущей ветке `main`. Объект анализа: `frontend/src/shared/context/WorkbenchContext.tsx`, 3096 строк.

## 1. Краткое описание текущего pipeline

Текущий Workbench pipeline устроен как один provider, который одновременно владеет shell state, Composer state, загрузкой run/report, выбором variant/trade/bar и почти всем chart runtime. `ChartPanel` получает уже собранный `chartViewModel` и набор runtime callbacks через `useWorkbenchChart()`, а затем применяет их к Lightweight Charts.

Поток от выбранного run/report/variant/trade до chart model:

1. При старте `WorkbenchProvider` загружает список runs через `fetchRunSummaries()`, выбирает default run и по `selectedRunId + reloadToken` загружает report через `fetchRunReport()`.
2. Для report выбирается variant: `resolveVariantKeyForReport()` нормализует ключ, `deriveSelectedVariant()` достает variant, а `defaultClosedTradeSelection()` выбирает trade/bar по умолчанию.
3. Для selected trade вычисляется entry time через `resolveSelectedTradeEntryTimeMs()`. Это entry time определяет режим chart view: `around-trade` или `tail`.
4. Из report + selected variant + chart timeframe строится `RunMarketView`: symbol, timeframe, report data range, candle cache key, anchor-stack EMA overlay keys и identity.
5. Market focus window строится вокруг selected trade или tail. Coverage window сначала равна focus window, а затем расширяется при pan/edge loading.
6. Market loader докачивает candles и anchor-stack EMA в resource cache. Когда focus candles готовы, статус становится `ready`; coverage может продолжать расширяться без мигания графика.
7. `composeDisplayMarketWindowBundle()` собирает display bundle из cache: если coverage полностью доступна, берется coverage; иначе удерживается focus bundle как fallback.
8. Render-window runtime нарезает bundle до текущего окна, формирует `chartView`, затем `buildChartViewModel()` собирает renderer-facing model: candles, EMA, aux overlays, component events, stale flags, trace display status и window metadata.

Поток от market focus/coverage windows до загрузки candles/EMA:

1. `resolveMarketTargetWindow()` берет `RunMarketView` и selected trade entry time, затем считает target display window с размером `CHART_RENDER_WINDOW_SIZE`.
2. `marketFocusWindow` отражает целевое окно для текущего trade/tail, а `marketCoverageWindow` является расширяемой областью cache coverage.
3. Market effect запускается только когда report ready, selected variant есть, chart heavy IO разрешен и coverage window существует.
4. `executeMarketWindowLoad()` планирует недостающие candle/EMA ranges через `marketWindowPlanner`, дедуплицирует in-flight keys, вызывает `/market/candles-window` и `/market/ema-window`, затем seed-ит resource caches.
5. `marketCandlesRevision` и `marketOverlayRevision` выступают React-триггерами для повторной композиции bundle после изменения внешних cache.

Поток от cache/bundle composition до данных графика:

1. `cachedBundle` читается из market cache через `composeDisplayMarketWindowBundle()`.
2. Если расширенная coverage еще не готова, `marketComposeSourceRef` фиксирует `focus` fallback, чтобы chart не получил `undefined` и не мигнул пустым состоянием.
3. `cachedBundleCandlesRef` хранит последнюю usable candle-последовательность для render-window init и trade focus rebuild.
4. `chartWindowSlice` через `ChartDataWindowManager` нарезает candles, anchor-stack EMA и aux overlays до render window, стабилизирует массивы по bounds keys, затем `chartView` добавляет mode/center/range/count.

Поток от chart interactions до pan/edge loading:

1. `ChartPanel` адаптером dispatch-ит pointer/wheel/visible-range/resize/programmatic events в `dispatchChartInteraction()`.
2. `chartRuntime.dispatchInteraction()` обновляет render-window controller и viewport controller.
3. На `visible_range_changed` при user pan/pending/applying shift provider сэмплирует видимые candle индексы из текущего `chartView.candles`.
4. `attemptMarketPanPrefetch()` проверяет близость к краю coverage через `evaluateMarketPanPrefetchExpansion()`.
5. Если нужно расширение, обновляется `marketCoverageWindow`; это запускает market loading effect для нового coverage key.
6. Отдельно render-window controller может commit-ить shift после idle debounce или pointerup; commit вызывает viewport restore command и trace fetch intent.

Поток от signal trace / chart events до markers/events на графике:

1. После готовности market и render window `evaluateSignalTraceBootstrap()` строит window key и trace request.
2. `planTraceDisplayLoad()` решает, можно ли грузить trace сейчас, нужно ли восстановить session cache, отложить во время pan или перейти к network.
3. Display cache может заполняться через `/chart-events` при `VITE_CHART_EVENTS_API=1`; иначе или при fallback используется dense `/signal-trace`.
4. Dense trace хранится как `signalTrace` только для lanes/diagnostics текущего render window; normalized display chunks попадают в `signalTraceDisplayCacheRef`.
5. `deriveTraceDisplayStateForCandles()` срезает display cache под текущие candles и выдает component events + HTF slice + status.
6. `ChartPanel` строит trade markers, component event markers и trade-management markers уже на стороне renderer, используя selected variant/trade и `chartViewModel.componentEvents`.

Поток от render window / viewport command до Lightweight Charts:

1. Render-window controller владеет индексным окном поверх cached bundle: reset, tail window, around-trade window, boundary shift.
2. Viewport controller владеет intent-ами: user vs trade owner, active trade focus, restore after window swap.
3. Provider превращает viewport controller commands в React state `chartViewportCommand + chartViewportCommandSeq`.
4. `ChartPanel` применяет commands к Lightweight Charts через `executeViewportCommand()`, подавляет programmatic feedback и acknowledge-ит command.
5. Для restore-after-window-swap используется transaction id, чтобы pointerdown мог отменить старый restore и не вызвать teleport/flicker.

## 2. Таблица ответственностей `WorkbenchContext.tsx`

| Ответственность | Что делает сейчас | Где живёт в `WorkbenchContext.tsx` | Связанные state | Связанные refs | Связанные effects | Связанные callbacks / memos | Используемые helper-модули / импортированные функции | Какие данные принимает | Какие данные отдаёт | Downstream consumers | Как участвует в текущем chart/runtime pipeline | Что может сломаться при переносе | Предварительный целевой модуль для будущего нового pipeline | Предварительный тип миграции | Примечания |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Shell / tab state | Хранит active tab, отмечает первый заход в Chart, включает heavy chart IO после первой активации Chart. | Lines 396-397, 501-507, 2847-2856 | `activeTab`, `hasChartEverActivated` | Нет | `activeTab -> hasChartEverActivated` | `chartHeavyIoEnabled` как derived boolean | React state/effect only | `initialActiveTab`, действия UI по tab switch | `activeTab`, `setActiveTab`, `chartHeavyIoEnabled` | Workbench shell, Composer может вызвать `setActiveTab`, chart market/aux/trace effects | Gating для market, aux EMA и signal trace загрузок; не дает тяжелому IO стартовать до Chart tab | Cold start: если новый runtime не получит тот же gate, он может начать тяжелые fetch-и на неактивной вкладке или наоборот не загрузить chart после активации | `WorkbenchShellRuntime` outside chart + `ChartIoGate` adapter | keep outside chart runtime / copy gate semantics | Новый chart runtime должен принимать `chartHeavyIoEnabled` как input, но не владеть tab state. |
| Config / Composer state | Загружает config list/draft, выбирает saved config, создает blank draft, предоставляет refresh runs для Composer. | Lines 398-402, 534-590, 782-786, 2887-2912 | `configDraft`, `configLoadStatus`, `configLoadError`, `configList`, `selectedConfigPath` | Нет | initial `reloadConfig()` | `applyConfigState`, `reloadConfig`, `selectConfig`, `createNewConfig`, `refreshRunsAndSelectRun`, `composerValue` | `fetchConfigState`, `selectSavedConfig`, `COMPOSER_DEFAULT_FAMILY`, `createBlankConfigDraft`, `ApiError` | Composer family, experiment id, new run id | Composer context fields, selected config path/draft/list/status | Composer panel, provider-level hooks | Не является chart runtime, но может обновить runs and selected run после Composer action | Смешивание с chart runtime может создать лишние reload/report resets при config-only изменениях | Existing Composer context / `WorkbenchComposerProvider` | keep outside chart runtime | Не переносить в chart pipeline; максимум оставить adapter для `refreshRunsAndSelectRun`. |
| Runs / report loading | Bootstrap runs, выбирает run, reload-ит report, сбрасывает market identity/revisions перед fetch report, хранит report status/errors. | Lines 404-405, 447-449, 469, 597-637, 651-692, 774-786 | `runs`, `selectedRunId`, `report`, `reportLoadStatus`, `reportError`, `reloadToken` | Нет прямых refs, но trace reset refs реагируют на `selectedRunId` | report load effect, runs bootstrap effect, trace reset on run switch, report ready debug | `pickDefaultRunId`, `setSelectedRunId`, `reloadReport`, `refreshRunsAndSelectRun` | `fetchRunSummaries`, `fetchRunReport`, `ApiError`, `dbgMark` | API responses, user-selected run id, reload token | `report`, `runs`, status/error, selected run id | Reports UI, Chart runtime inputs, Composer refresh flow | Стартовая точка pipeline: report дает symbol, timeframe, data_range, variants, trade records, strategy specs | Run switch ordering: можно получить stale report, старый market identity, trace от предыдущего window или неверный default trade | `WorkbenchReportLoader` outside chart runtime | keep outside chart runtime / copy invalidation contract | Новый chart runtime должен получать уже готовые `report`, `selectedRunId`, `reloadToken`, `reportLoadStatus`. |
| Variant / trade / bar selection | Нормализует selected variant, выбирает default closed trade/bar, валидирует trade membership, вычисляет entry/focus time и warning. | Lines 450-452, 513-532, 694-759, 788-818, 2135-2179 | `selectedVariantKey`, `selectedTradeId`, `selectedBarTimeSec` | `selectedVariantKeyRef`, `selectedTradeIdRef`, `prevVariantKeyRef`, `prevRunIdForTradeBootstrapRef`, `skipTradeWindowRebuildRef` | report -> variant key, report/variant -> default trade, layout validation selected trade, selectedTradeIdRef sync | `deriveSelectedVariant`, `setSelectedVariantKey`, `applyTradeFocusSelection`, `selectedTradeResolution`, `selectTrade`, `selectBar` | `defaultClosedTradeSelection`, `deriveSelectedVariant`, `findTradeById`, `formatTradeDisplayNumber`, `isTradeInVariant`, `resolveSelectedTradeEntryTimeMs`, `resolveTradeEntryTimeMs`, `resolveVariantKeyForReport`, `tradeIdsEqual`, `hasTradeManagementEvents` | Report variants, trade records, user select trade/bar | selected variant, selected trade id, selected bar time, trade focus warning, trade entry time | Reports UI, ChartPanel markers, market focus window, render window, viewport focus | Entry time drives market focus window, chart mode, render-window around-trade and focus viewport command | Selected trade navigation can break if default selection fires too early/late or if trade focus command races with render-window init | `ChartSelectionStateAdapter` + report-level selection owner outside runtime | split: keep selection owner outside; copy derived chart inputs | `selectTrade()` currently mutates chart viewport/runtime and marker toggles; future design should separate selection mutation from chart side effects. |
| Market view identity | Resolves report+variant into market view identity: symbol/timeframe/data range/cache keys/anchor EMA overlay refs/reload token. | Lines 592-595, 699-721, 820-837, 1513-1515 | `runMarketViewIdentity` | `intendedRunMarketViewIdentityRef`, `intendedRunMarketViewRef` | sync intended identity ref | `expectedRunMarketViewIdentity`, `intendedRunMarketView`, `intendedRunMarketViewIdentity`, `chartTimeframeMs` | `CHART_MARKET_TIMEFRAME`, `resolveChartTimeframeMs`, `resolveRunMarketView`, `buildRunMarketViewIdentity`, `anchorStackPeriodsFromStrategySpec`, `AnchorStackParseError` | Ready report, selected variant, chart timeframe, reload token | `RunMarketView`, identity string, timeframe mismatch metadata | Market loader, trace bootstrap, cache keys, ChartPanel timeframe indicators | Defines cache namespace and verifies trace belongs to the expected report/variant/run | If duplicated, two identities may disagree and trace bootstrap will block or cache reads will miss | `MarketViewIdentityResolver` | copy/rewrite | Keep identity pure and deterministic; provider should not maintain multiple competing identity refs. |
| Market focus / coverage windows | Computes focus window for selected trade/tail, initializes and resets coverage window, builds window keys, mirrors windows into refs. | Lines 415-416, 424-427, 839-906, 890-902 | `marketFocusWindow`, `marketCoverageWindow` | `marketFocusWindowRef`, `marketCoverageWindowRef`, `marketReadyTargetKeyRef`, `lastPanPrefetchExpansionKeyRef`, `lastPanPrefetchLogKeyRef`, `lastVisiblePrefetchSampleRef`, `prevBundleFirstTimeSecRef`, `lastComposeFallbackKeyRef` | intended view/trade entry -> reset/resolve windows | `marketFocusWindowKey`, `marketCoverageWindowKey` | `resolveMarketTargetWindow`, `buildMarketTargetWindowKey` | `RunMarketView`, selected trade entry time, reload token | focus/coverage windows and keys | Market loader, bundle composer, pan prefetch, render window foundation | Focus is the minimum ready window; coverage is the expandable cache target | Reset behavior can cause stale coverage, fetch storms, or chart blink if focus and coverage are conflated | `MarketWindowController` | rewrite with copied semantics | Important invariant: focus changes reset ready/log/fallback refs; coverage expansion should not reset selected trade focus. |
| Market loading / fetch lifecycle | Fetches missing candles and anchor EMA overlays for coverage window; handles aborts, in-flight dedupe, load generation, cache-hit readiness, status/error/revisions. | Lines 406-414, 473-475, 761-767, 908-1069 | `marketLoadStatus`, `marketError`, `runMarketViewIdentity`, `marketCandlesRevision`, `marketOverlayRevision` | `marketLoadGenRef`, `marketFetchInFlightKeysRef`, `marketReadyTargetKeyRef`, `intendedRunMarketViewIdentityRef` | main market load effect | `bumpMarketCandlesRevision`, `bumpMarketOverlayRevision` | `executeMarketWindowLoad`, `marketCandlesReadyForTarget`, `resolveRunMarketView`, `buildRunMarketViewIdentity`, `buildMarketTargetWindowKey`, `marketErrorMessage`, `isAbortError`, `dbgMark` | report, selected variant, chart timeframe, reload token, coverage/focus window, IO gate | resource cache side effects, status/error, revisions, ready identity | Bundle composition, render-window foundation, trace bootstrap | Converts report/variant/window intent into actual cached market resources | Two active loaders can fight over status; stale response handling can mark wrong run ready/error; missing revision bump freezes chart | `MarketResourceLoader` | rewrite/copy helper calls | Current readiness only requires focus candles for `ready`; EMA overlays can arrive through revision after status ready. Preserve or explicitly change. |
| Market cache / bundle composition | Reads candle/EMA caches, composes display bundle, keeps focus fallback while coverage loads, records full range/count/source. | Lines 414, 421-423, 1071-1180, 1127-1143, 2126-2133 | Derived `cachedBundle`, `marketCandlesCount`, `fullCandleRange`, `candlesSource` | `cachedBundleCandlesRef`, `marketComposeSourceRef`, `prevBundleFirstTimeSecRef`, `lastComposeFallbackKeyRef` | cache candles snapshot effect, fallback debug effect, bundle ready debug effect | `cachedBundle`, `renderWindowFoundationKey`, `fullCandleRange` | `composeDisplayMarketWindowBundle`, `getCandles`, `marketCandlesReadyForTarget`, `candleRangeMs`, `dbgMark` | intended market view, focus/coverage windows, cache revisions, market status | `ChartMarketBundle`, candle count/source/range, render-window foundation key | Render window runtime, ChartPanel info banners | Prevents empty chart during coverage expansion and determines data available for slicing | Removing fallback can create blank chart on pan; wrong foundation key can rebuild window too often or not at all | `MarketBundleComposer` | copy/rewrite | `composePartialRunMarketWindowBundle` is imported but not used in this file. |
| Pan / edge loading | Detects user pan near coverage edges, expands market coverage by chunks, protects from duplicate expansions/log spam. | Lines 418-420, 1341-1392, 1394-1428, 1569-1571 | `marketCoverageWindow` | `lastPanPrefetchLogKeyRef`, `lastPanPrefetchExpansionKeyRef`, `lastVisiblePrefetchSampleRef`, `chartViewCandlesRef`, `marketCoverageWindowRef`, `intendedRunMarketViewRef` | Triggered from dispatch interaction and window commit, not standalone effect | `attemptMarketPanPrefetch`, part of `dispatchChartInteraction`, part of `applyWindowCommit` | `evaluateMarketPanPrefetchExpansion`, `resolveChartTimeframeMs`, `dbgMark` | visible from/to sec, current coverage, report bounds, interaction state, IO gate | expanded coverage window or no-op | Market loader effect | Makes distant pan possible without full report load; prefetches before render window runs out | Fetch storm, repeated coverage updates, pan blocked by wrong interaction state, clamped edges misreported | `MarketPanPrefetchController` | rewrite | There are two edge systems: market coverage expansion and render-window shifting. They must remain coordinated but not duplicated. |
| Chart interaction dispatch | Receives ChartPanel pointer/wheel/programmatic/visible range events, updates runtime controllers, cancels stale viewport commands, samples visible range for market decisions. | Lines 1394-1428 | `chartViewportCommand` can be cleared on pointerdown | `windowSwapCancelledThroughIdRef`, `windowSwapTransactionIdRef`, `chartRuntimeRef`, `chartViewCandlesRef`, `lastVisiblePrefetchSampleRef` | None directly | `dispatchChartInteraction` | `createChartRuntime`, `ChartInteractionEvent`, `ViewportCommand` | Chart interaction events from ChartPanel | viewport command side effects, render-window controller state, market prefetch call | ChartPanel interaction adapter and chart runtime | Bridges Lightweight Charts events to provider-owned runtime state | Pointerdown cancellation and programmatic viewport suppression can desync, causing restore after user pan or dropped focus | `ChartInteractionRuntime` | move/rewrite | Future module should expose a narrow dispatch API and hide refs/transaction mechanics. |
| Render-window runtime | Owns render window manager/controller, reset/init, tail/selected-trade window, first-candle prepend offset, idle boundary shift, window swap commit. | Lines 476-494, 1182-1206, 1231-1326, 1530-1586 | `renderWindowRevision`, `renderWindowShiftSeq` | `chartRuntimeRef`, `applyWindowCommitRef`, `renderWindowShiftSeqRef`, `cachedBundleCandlesRef`, `prevBundleFirstTimeSecRef`, `skipTradeWindowRebuildRef`, `chartViewCandlesRef` | first bundle prepend offset, render-window init, selected trade rebuild, applyWindowCommit ref sync | `renderWindowManager`, `bumpRenderWindow`, `applyRenderWindowForTrade`, `applyWindowCommit` | `createChartRuntime`, `ChartDataWindowManager`, `findBarIndexAtOrBefore`, `dbgTimedSync`, `dbgScheduleShiftFlush` | cached bundle candles, selected trade entry time, visible boundary commit | window indices, sliced view revision, shift seq, queued trace intent, viewport restore command | Chart window slicing, trace scheduler, ChartPanel viewport restore | Keeps rendered candle count bounded and enables infinite-like panning over cached bundle | Trade focus can land outside current window; prepend offset can shift wrong direction; double owners can both slice candles | `RenderWindowRuntime` | move/rewrite | Current manager is mutable and ref-held; migration should avoid React state as source of truth for indices. |
| Viewport command runtime | Emits focus/restore commands, filters commands, protects trade focus intent, tracks swap transactions, lets ChartPanel acknowledge/settle/cancel. | Lines 495-496, 1208-1229, 1328-1339, 1542-1554, 1617-1623, 2135-2154 | `chartViewportCommand`, `chartViewportCommandSeq` | `chartRuntimeRef`, `windowSwapTransactionIdRef`, `windowSwapCancelledThroughIdRef` | Trace ready can emit focus command; ChartPanel applies via its own effect | `emitChartViewportCommand`, `acknowledgeChartViewportCommand`, `isWindowSwapTransactionCancelled`, `settleWindowSwapCommit`, `selectTrade` | `canEmitTradeFocus`, `ViewportCommand`, `dbgMark` | viewport controller command, selected trade entry time, window swap commit | command + seq for ChartPanel, cancellation/settle callbacks | ChartPanel `executeViewportCommand()` effect | Prevents teleport/flicker while applying programmatic viewport changes | Stale command can restore after user panned; lost acknowledge can repeat command; focus command can override user viewport | `ViewportCommandRuntime` | move/rewrite | Keep command ownership single. ChartPanel should remain executor, not policy owner. |
| Signal trace runtime | Decides when render window can bootstrap trace, handles status/error/window key, session restore, network orchestration for dense lanes and display data. | Lines 453-468, 1884-1950, 1959-1994, 2181-2842 | `signalTrace`, `signalTraceStatus`, `loadedSignalTraceWindowKey`, `signalTraceError`, `traceSchedulingTick` | `signalTraceRequestCoordinatorRef`, `signalTraceStatusRef`, `signalTraceRef`, `signalTraceErrorRef`, `loadedSignalTraceWindowKeyRef`, `previousChartWindowKeyRef`, `traceLoadGenerationRef`, `signalTraceBundleSessionCacheRef` | run switch reset, trace display cache reset, session cache reset, main signal trace effect, ref sync effects | `traceDisplayCacheKey`, `sessionCacheIdentity`, `chartWindowKey`, `lanesSignalTrace`, `lanesSignalTraceStatus`, `lanesSignalTraceError`, `finalizeTraceDisplayUpdate` | `evaluateSignalTraceBootstrap`, `decideSignalTraceLoad`, `planTraceDisplayLoad`, `buildDisplayTraceRequestKey`, `buildTraceRequestKey`, `createSignalTraceRequestCoordinator`, `buildSessionCacheIdentity`, `createSignalTraceBundleSessionCache`, `isChartEventsApiEnabled`, `workbenchTraceNetworkLoad` helpers | report/run/variant, market readiness identity, render window candles/bounds, context overlay ref, display cache coverage, IO gate | dense trace for lanes, status/error, loaded window key, display cache updates | ChartPanel diagnostics/lanes, component events, HTF overlays, viewport focus on trace ready | Adds markers/events/HTF context to current render window | Fetch storm, stale dense trace shown for wrong window, pan-triggered network during active shift, session cache restored under wrong identity | `TraceRuntimeOrchestrator` + `TraceNetworkRuntime` | rewrite with copied policies | This is the densest block. It currently mixes bootstrap, planning, network, cache mutation, React state and viewport side effects. |
| Trace display cache / chunk scheduling | Maintains normalized display cache, plans missing chunks, merges chart-events/dense responses, slices events/HTF to current candles, retains stale display during loading. | Lines 429-438, 1617-1728, 1884-1923, 1996-2084 | `displayCacheVersion`, `displayApplyRevision`, `traceDisplayState`, `chartDisplayComponentEvents` | `signalTraceDisplayCacheRef`, `applyTraceDisplayRef`, `chartDisplayComponentEventsRef`, `lastSlicedHtfOverlaysRef` | cache key reset, test invalidator, apply display on render bounds/cache version, ref sync | `applyTraceDisplayForCurrentWindow`, `applyHtfOverlaysFromDisplaySlice`, `displayCacheCoversWindow`, `displayCacheHasWindowData`, `componentEventsStale`, `chartDisplayAuxEmaOverlays` | `createSignalTraceDisplayCache`, `buildTraceDisplayCacheKey`, `mergeDisplayChunkFromResponse`, `deriveTraceDisplayStateForCandles`, `shouldRetainPreviousTraceDisplay`, `planMissingTraceDisplayChunkFetch`, `buildTraceDisplayChunkKey` | current render candles, trace/display network responses, selected variant/trade for debug | component events, HTF display slice, stale flags, display revisions | Chart view model, ChartPanel markers/indicators | Supplies chart events and HTF overlay source independent of dense trace state | Cache reset at wrong time can lose display; retaining stale events can show wrong markers; chunk boundaries can miss selected trade | `TraceDisplayCacheRuntime` | move/rewrite | Test invalidator is provider-level test API and should not leak into production runtime interface. |
| Chart events / component events | Uses optional `/chart-events` display path, falls back to dense trace, exposes component events and marker toggles; trade-management marker toggles live here but marker build is in ChartPanel. | Lines 435-445, 1649-1687, 2086-2095, 2097-2124, 2135-2166 | `chartDisplayComponentEvents`, marker toggle booleans | `chartDisplayComponentEventsRef` | display apply updates events; selectTrade auto-enables trade management toggles | marker toggle setters, `componentEventsStale`, `chartViewModel` | `isChartEventsApiEnabled`, `loadDisplayTraceChunk`, `mergeDisplayFromDenseFallback`, `hasTradeManagementEvents`, `buildChartViewModel` | display cache events, selected variant trade-management events, user marker toggles | component events in view model, stale flag, toggles | ChartPanel marker rebuild, marker legend UI | Converts trace/chart-events output into renderer marker inputs | Component events can lag render window; toggles can be reset/auto-enabled unexpectedly; chart-events fallback can duplicate events if dedupe changes | `ChartEventsDisplayRuntime` for data; marker preferences outside runtime | split: move data, keep UI prefs outside | Trade markers and trade-management markers are not built in provider; provider only supplies data and toggles. |
| HTF / aux overlays | Computes aux EMA specs from strategy, fetches BFF EMA overlays, derives HTF overlays from trace display slice or dense trace fallback, freezes/stales HTF overlays. | Lines 428, 457, 1517-1528, 1588-1615, 1625-1647, 1756-1882, 2041-2080 | `auxEmaOverlays`, `contextOverlayRef` | `lastSlicedHtfOverlaysRef` | context overlay validation/defaulting, BFF aux EMA fetch, HTF fallback effect | `contextOverlayRefOptions`, `defaultContextOverlayRef`, `effectiveContextOverlayRef`, `auxEmaSpecs`, `applyHtfOverlaysFromDisplaySlice`, `htfAuxEmaOverlayStale`, `chartDisplayAuxEmaOverlays` | `strategyContextRefOptions`, `defaultChartContextOverlayRef`, `anchorStackPeriodsFromStrategySpec`, `collectAuxEmaSpecs`, `fetchChartOverlayEma`, `auxOverlayFromHtfSlice`, `auxOverlayFromHtfTrace`, `mergeAuxOverlayPoints`, `displayAuxOverlaysForRenderWindow`, `frozenHtfOverlaysForStorage` | selected variant strategy spec, chart timeframe, context overlay ref, report symbol/range, trace display HTF slice | aux overlays, display aux overlays, stale flag, context overlay options | ChartPanel overlay rendering and context selector | Adds strategy-specific overlay lines beyond anchor-stack EMA | HTF overlays can freeze forever, BFF fetch can race run switch, context overlay reset can invalidate trace unexpectedly | `AuxOverlayRuntime` + context overlay selection outside | split/rewrite | Separate BFF aux EMA from HTF trace overlays; they have different readiness and cache semantics. |
| Chart window slicing | Slices full cached bundle to render window, slices EMA/aux overlays, stabilizes arrays, exposes window metadata and current candles ref. | Lines 488-493, 1430-1508 | Derived `chartWindowSlice`, `chartView` | `chartCandlesCacheRef`, `chartEmaCacheRef`, `chartAuxEmaCacheRef`, `chartViewCandlesRef` | none; memo-driven | `chartWindowSlice`, `chartView` | `buildRenderWindowBoundsKey`, `buildEmaOverlaysStabilizeKey`, `buildAuxOverlaysStabilizeKey`, `stabilizeByWindowBoundsKey`, `emptyChartViewWindow`, `ChartDataWindowManager` | cached bundle, aux overlays, renderWindowRevision, identities | sliced candles/EMA/aux, mode/range/count | Chart view model, pan prefetch sampler, trace bootstrap | Produces the exact data arrays passed to renderer and trace scheduler | Wrong memo deps can keep stale arrays; slicing aux before trace display readiness can hide overlays; unstable arrays can trigger redraw storms | `ChartWindowProjector` | move/rewrite | Current implementation intentionally stabilizes by bounds + overlay fingerprints; preserve performance behavior. |
| Chart view model composition | Builds renderer-facing model and legacy context fields from chartView + display aux + events + stale/status metadata. | Lines 181-246, 288-345, 2097-2124, 2914-3025 | `chartViewModel` derived; many chart context fields | No additional refs | memo only | `buildChartViewModel`, `chartValue` | `buildChartViewModel` | chart view, display overlays, component events, trace display status, stale flags | `chartViewModel`, legacy chart fields, callbacks | `ChartPanel`, tests, any `useWorkbenchChart()` consumer | Final provider output before Chart tab render | If new runtime only returns model but old fields remain derived separately, the two can diverge | `ChartRuntimeViewModelAdapter` | copy/rewrite | Prefer one authoritative output object, then compatibility fields derived from it during migration. |
| Context provider output | Splits provider value into shell/report/composer/chart contexts and re-combines for `useWorkbench()`. | Lines 165-350, 2847-3095 | All state and derived values | None beyond provider refs | none | `shellValue`, `reportValue`, `composerValue`, `chartValue`, hooks | React context APIs | internal provider state | four context slices and combined hook | Whole Workbench UI and tests | Public surface that ChartPanel consumes today | New runtime can leave `WorkbenchContext` large if provider just wraps old fields around new internals without deleting ownership | `WorkbenchProviderGlue` | keep outside chart runtime / adapter | Future migration should reduce chart fields to a narrow runtime output and keep shell/report/composer separate. |

## 3. Current pipeline diagram

Main data path:

```text
selected run id / reload token
-> fetch run report
-> normalize selected variant
-> default or user-selected trade/bar
-> selected trade entry time
-> RunMarketView identity
-> market focus window + coverage window
-> market resource loading into candle/EMA caches
-> display bundle composition with focus fallback
-> render-window manager
-> sliced candles / EMA / aux overlays
-> signal trace bootstrap for current render window
-> trace display cache + component events + HTF slice
-> chart view model
-> WorkbenchChartContext
-> ChartPanel / Lightweight Charts
```

Market loading path:

```text
report.symbol + report.data_range + selected variant strategy_spec
-> resolveRunMarketView()
-> candles cache key + anchor-stack EMA overlay keys
-> resolveMarketTargetWindow(selected trade entry or tail)
-> marketFocusWindow
-> marketCoverageWindow
-> executeMarketWindowLoad()
-> fetch missing candles-window / ema-window
-> seed resource caches
-> bump candle/overlay revisions
-> composeDisplayMarketWindowBundle()
-> cachedBundle
```

Chart interaction / pan path:

```text
ChartPanel pointer/wheel/visible-range events
-> dispatchChartInteraction()
-> chartRuntime.renderWindow + chartRuntime.viewport
-> visible range sampled against current chartView.candles
-> attemptMarketPanPrefetch()
-> evaluateMarketPanPrefetchExpansion()
-> marketCoverageWindow expansion
-> market loader effect
-> cache revision
-> bundle composition
-> render/display update
```

Render-window shift path:

```text
visible_range_changed near render-window boundary
-> renderWindow.recordBoundaryIntent()
-> pointerup or idle debounce
-> renderWindow.tryCommitPendingShift()
-> Workbench applyWindowCommit()
-> emit restoreAfterWindowSwap command
-> queue trace fetch intent
-> bump renderWindowRevision
-> ChartPanel setData + execute viewport restore
-> settleWindowSwapCommit()
```

Trace / events path:

```text
chartView.candles + report/run/variant + market identity
-> evaluateSignalTraceBootstrap()
-> decideSignalTraceLoad()
-> planTraceDisplayLoad()
-> display cache hit / pan block / session restore / network
-> optional chart-events display fetch
-> dense signal-trace lanes fetch or fallback
-> merge display chunk into signalTraceDisplayCache
-> deriveTraceDisplayStateForCandles()
-> chartDisplayComponentEvents + HTF slice
-> chartViewModel.componentEvents / displayAuxEmaOverlays
-> ChartPanel markers and overlays
```

Viewport command path:

```text
selected trade or window swap or trace ready
-> viewport controller command
-> emitChartViewportCommand()
-> chartViewportCommand + seq
-> ChartPanel executeViewportCommand()
-> acknowledgeChartViewportCommand()
-> optional settleWindowSwapCommit()
```

## 4. Предварительные границы будущих модулей

Это не финальный design, а карта возможных границ для будущего OpenSpec.

| Модуль | Какую ответственность забирает | Из каких текущих частей собирается | Входы | Выходы | Недопустимые зависимости | Риск разрастания |
|---|---|---|---|---|---|---|
| `ChartIoGate` | Решает, разрешены ли тяжелые chart IO операции. | `activeTab`, `hasChartEverActivated`, `chartHeavyIoEnabled`. | active tab, activation history. | boolean gate. | Не должен знать report, market cache или ChartPanel. | Может начать владеть shell tabs вместо простого gate. |
| `ChartSelectionAdapter` | Превращает report selection в chart inputs: variant, trade id, entry time, selected bar, warnings. | `deriveSelectedVariant`, default trade selection, trade resolution, `selectTrade` side effects нужно разделить. | report, selected variant key, selected trade id, UI selection actions. | selected variant, selected trade entry time, warning, chart focus intent. | Не должен fetch-ить market/trace или применять viewport. | Может остаться мини-Workbench selection god-object, если туда перенести report loading. |
| `MarketViewIdentityResolver` | Строит `RunMarketView` и identity. | `intendedRunMarketView`, `expectedRunMarketViewIdentity`, identity refs. | report, variant, chart timeframe, reload token. | market view, identity, parse errors. | Не должен читать React state напрямую или менять cache. | Низкий; это чистая граница. |
| `MarketWindowController` | Управляет focus/coverage windows и reset semantics. | `marketFocusWindow`, `marketCoverageWindow`, keys, window refs, reset refs. | market view, selected trade entry time, coverage expansion intents. | focus/coverage windows and keys. | Не должен выполнять network fetch. | Может смешаться с pan controller и loader. |
| `MarketResourceLoader` | Загружает missing candles/EMA в resource caches с abort/dedupe/generation/status. | Market loading effect, `marketLoadGenRef`, `marketFetchInFlightKeysRef`, revisions. | market view, focus window, coverage window, IO gate. | status/error, ready identity, cache revision signals. | Не должен выбирать trade или slicing window. | Высокий, если внутрь попадет bundle composition and pan policy. |
| `MarketBundleComposer` | Читает market cache и возвращает stable display bundle/fallback/source/count/range. | `cachedBundle`, focus fallback logging, `cachedBundleCandlesRef`. | market view, focus/coverage windows, revisions, status. | bundle, source, full candle range, count/source. | Не должен запускать fetch-и. | Средний из-за temptation добавить loader fallback. |
| `ChartInteractionRuntime` | Принимает ChartPanel events, обновляет controllers, выдает commands/intents. | `dispatchChartInteraction`, `chartRuntimeRef.dispatchInteraction`, pointerdown cancellation. | chart interaction events, current candles snapshot. | viewport commands, pan samples, render-window state changes. | Не должен знать report API. | Высокий, если смешать с market loader and viewport executor. |
| `MarketPanPrefetchController` | Решает coverage expansion по visible range и report bounds. | `attemptMarketPanPrefetch`, log/expansion/sample refs. | visible range, coverage window, report bounds, timeframe, interaction state. | coverage expansion intent. | Не должен mutate resource cache. | Средний; важно не объединить с render-window shift policy. |
| `RenderWindowRuntime` | Управляет bounded render window, trade/tail init, shift commits. | `chartRuntimeRef.renderWindow`, `ChartDataWindowManager`, `applyRenderWindowForTrade`, `applyWindowCommit`. | bundle candles, selected trade entry, interaction events. | window indices/revision, sliced window intent, shift commits. | Не должен fetch trace/market напрямую; только intents. | Высокий из-за тесной связи с viewport/trace/pan. |
| `ViewportCommandRuntime` | Формирует `focusTrade` и `restoreAfterWindowSwap`, tracks seq/transactions/cancel/settle. | `emitChartViewportCommand`, command state, transaction refs, `settleWindowSwapCommit`. | viewport controller commands, user cancellation, ChartPanel ack. | command + seq + lifecycle callbacks. | Не должен исполнять Lightweight Charts operations. | Средний; executor должен остаться в ChartPanel. |
| `TraceBootstrapRuntime` | Проверяет ready conditions для trace window и строит request. | `evaluateSignalTraceBootstrap`, chartWindowKey, bounds keys, previous window key. | report/run/variant, market status/identity, render candles/bounds. | bootstrap ready/block reason, request/window key. | Не должен выполнять network или merge cache. | Низкий при чистой границе. |
| `TraceDisplayCacheRuntime` | Хранит normalized display cache, coverage/missing ranges, slicing events/HTF. | `signalTraceDisplayCacheRef`, display apply, stale retention, display revisions. | display chunks, render candles, trace status. | component events, HTF slice, display status, missing range, revisions. | Не должен владеть dense `signalTrace` diagnostics state. | Высокий, если туда попадет network orchestration. |
| `TraceNetworkRuntime` | Оркестрирует chart-events/dense signal-trace fetch, coordinator, session cache, fallback. | Main trace effect, request coordinator, session cache, network load helpers. | trace bootstrap, display cache coverage, IO gate, context overlay ref. | dense lanes state, display cache merge commits, errors/status. | Не должен знать marker toggles or ChartPanel. | Очень высокий; нужен строгий API and state machine. |
| `AuxOverlayRuntime` | Управляет BFF aux EMA and HTF overlays. | aux specs, context overlay ref validation/defaulting, BFF fetch, HTF slice/fallback/stale. | selected strategy spec, chart timeframe, context overlay selection, trace display state, report range. | aux overlays, display aux overlays, stale flag, context options. | Не должен reload report или выбирать trade. | Высокий из-за смешения UI selection and data loading. |
| `ChartViewModelComposer` | Собирает final renderer model. | `chartWindowSlice`, `chartView`, `buildChartViewModel`, compatibility chart fields. | sliced market window, overlays, events, stale flags, trace display status. | `ChartViewModel` and minimal compatibility output. | Не должен fetch/load/mutate. | Средний; может превратиться в dumping ground для всех chart fields. |
| `WorkbenchChartProviderAdapter` | Соединяет old provider API with new runtime output during migration. | `chartValue` and current `WorkbenchChartState` shape. | report/shell/selection inputs, runtime output. | `useWorkbenchChart()` compatible fields. | Не должен содержать policy except compatibility mapping. | Очень высокий: именно здесь можно оставить второй god-runtime рядом со старым. |

## 5. Что НЕ должно входить в новый chart runtime

Не являются chart/runtime pipeline и не должны переезжать в новый chart runtime:

- Composer config state: draft, config list, selected config, `reloadConfig()`, `selectConfig()`, `createNewConfig()`.
- Shell tab ownership: `activeTab` and `setActiveTab`. Runtime может принимать IO gate, но не владеть Workbench tabs.
- Runs list bootstrap: `fetchRunSummaries()`, default run selection and empty-runs error are Workbench/report concerns.
- Report fetch ownership: `fetchRunReport()` and report status/errors should remain upstream. Chart runtime should consume report readiness and data.
- Provider-level context splitting: shell/report/composer/chart context wiring is glue, not chart runtime.
- Full `useWorkbench()` compatibility hook should stay as provider glue.
- Strategy Composer refresh flow: `refreshRunsAndSelectRun()` is a Composer/report bridge, not chart runtime.
- Marker rendering into Lightweight Charts should remain in `ChartPanel` or a renderer-side presentation module. Provider currently supplies events/toggles, but actual marker construction is downstream.
- Lightweight Charts imperative execution: `executeViewportCommand()`, series creation, `setData`, marker plugin calls and programmatic range suppression are renderer responsibilities.
- Test-only invalidator API should not become a production runtime dependency; if retained, it should be an explicit test seam around trace display cache.

Borderline responsibilities that need explicit future decisions:

- Selected trade state belongs outside chart runtime, but chart runtime needs selected trade entry time and focus intent as inputs.
- Marker toggle preferences are UI state, not data runtime; however trace/component event data that feeds markers is chart runtime output.
- Context overlay selection is user/UI state, but it keys trace and HTF overlays. It should likely be owned outside the trace network module and passed as a stable input.

## 6. Риски будущего разрезания

Где легко создать двух активных владельцев:

- `chartRuntimeRef` currently owns both render-window and viewport controllers. A new runtime beside it can accidentally dispatch the same interactions twice.
- `marketCoverageWindow` can be updated by old pan prefetch and new pan prefetch simultaneously.
- `signalTraceDisplayCacheRef` and `signalTraceBundleSessionCacheRef` are mutable refs. Duplicating them creates divergent display cache and lanes trace state.
- `chartViewportCommand` must have one owner; otherwise `ChartPanel` may apply focus/restore commands from two sources.

Где можно сломать cold start:

- `chartHeavyIoEnabled` blocks market, aux EMA and trace fetches until Chart activation. If a new pipeline ignores this gate, it can flood BFF before the Chart tab is used.
- Report load resets market status, identity and revisions before setting new report. If runtime starts from old report during `loading`, trace bootstrap can bind to stale run.
- Initial render-window foundation requires focus candles and a non-empty cache slice. Starting trace before render-window init produces `no_bounds` or stale markers.

Где можно сломать selected trade navigation:

- `selectTrade()` currently does four things: computes entry time, dispatches viewport trade selection, mutates selectedTradeId, sets selected bar and may switch to Chart tab.
- `applyRenderWindowForTrade()` rebuilds the render window only when trade entry is outside or near the safe zone unless forced.
- Viewport focus is gated by `canEmitTradeFocus()` so trace-ready focus does not override user-owned viewport.
- Default trade selection fires on report/variant/run changes; wrong ordering can center old trade or leave selected trade not in selected variant.

Где можно сломать pan/edge loading:

- Market coverage expansion and render-window shifting are separate but coordinated. Expanding coverage without adjusting render window after prepending candles can shift the visible data under the user.
- `lastPanPrefetchExpansionKeyRef` and `lastVisiblePrefetchSampleRef` prevent repeated identical expansions. Losing them can create fetch storms.
- Programmatic viewport events from ChartPanel should not look like user pan. If suppression/dispatch order changes, restore commands can trigger edge prefetch.

Где можно сломать trace/events/markers:

- Trace bootstrap requires `runMarketViewIdentity === expectedRunMarketViewIdentity`. If new market identity changes string shape or timing, trace stays blocked.
- Display cache key includes run, variant and context overlay ref. Missing any part leaks markers/HTF overlays across variant or context changes.
- Chart-events display fetch and dense signal-trace lanes fetch have separate request keys under feature flag. Collapsing them can duplicate or suppress events.
- `shouldRetainPreviousTraceDisplay()` intentionally keeps stale component events/HTF overlays during loading. Removing this changes perceived chart stability.
- `ChartPanel` builds markers from `chartViewModel.componentEvents`, selected variant trade records and trade-management events. If model data and selected variant get out of sync, markers are wrong even if candles are correct.

Где можно получить fetch storm:

- Market loader effect depends on `marketCoverageWindowKey`, but revisions and focus changes also re-render; new code must avoid putting unstable objects in dependencies.
- Trace network effect depends on chart window key, render-window revision, bounds key, market identity and scheduling tick. Any unstable key can repeatedly fetch the same chunk.
- Request coordinators dedupe in-flight/merged/failed keys. Recreating coordinators too often removes dedupe; never resetting them leaks stale failures.
- Pan scheduling deliberately blocks trace network during active pan unless display cache covers the window. Removing that block can spawn trace fetches for transient windows.

Где можно оставить `WorkbenchContext` большим:

- If new modules return many tiny state setters instead of one runtime output, provider will still orchestrate everything.
- If `chartValue` keeps legacy fields as independently computed values instead of derived compatibility fields, old and new outputs will diverge.
- If report/selection/composer responsibilities are copied into chart modules, the new runtime becomes a second provider rather than a chart pipeline.
- If ChartPanel wiring is not reduced after switch, provider may keep old callbacks only for compatibility and never delete them.

## 7. Рекомендации для будущего OpenSpec

Будущий OpenSpec должен обязательно зафиксировать:

- Single-owner rule for each mutable runtime domain: market windows, market load status, render-window indices, viewport commands, trace display cache, dense lanes trace.
- Exact runtime inputs from Workbench: report readiness, selected run id, reload token, selected variant/trade entry, chart IO gate, context overlay selection.
- Exact runtime outputs to Chart tab: `ChartViewModel`, market status/error/count/source/range, trace status/error for lanes, viewport command stream, interaction dispatch.
- Compatibility plan for current `WorkbenchChartState`: which fields remain, which become derived adapters, which are deleted after ChartPanel switch.
- Cold-start contract: no heavy chart IO before chart activation, and deterministic first ready sequence from report -> market focus -> render window -> trace display.
- Selected-trade navigation contract: default selection, explicit trade selection, render-window rebuild, viewport focus command and warning behavior.
- Pan/edge contract: separate market coverage expansion from render-window shift, with dedupe and active-pan trace blocking.
- Trace/events contract: chart-events display path, dense trace fallback/lanes path, request key definitions, cache keys, session restore, stale display retention.
- Overlay contract: anchor-stack EMA from market cache, BFF aux EMA, HTF trace overlays and stale/frozen display behavior.
- Deletion criteria for old code in `WorkbenchContext.tsx`: after the new pipeline owns a responsibility, old state/effects/refs for that responsibility must be removed, not left dormant.
- Test plan around high-risk behavior: cold start, distant selected trade, user pan to both edges, chart-events enabled/disabled fallback, context overlay switch, run/variant switch, viewport restore cancellation.

The most important design constraint: the new pipeline should be a small number of cohesive state machines with explicit inputs/outputs, not a collection of hooks that still require `WorkbenchContext.tsx` to coordinate every side effect.

## 8. Public context/API surface

`WorkbenchContext.tsx` exports four focused hooks and one compatibility hook:

- `useWorkbenchShell()` returns shell/report gate controls.
- `useWorkbenchReport()` returns report/run/variant/trade selection state for non-chart panels.
- `useWorkbenchComposer()` returns Strategy Composer state and actions.
- `useWorkbenchChart()` returns the broad chart/runtime surface consumed by `ChartPanel`.
- `useWorkbench()` merges all four slices and is currently used by tests as compatibility surface.

### Shell Context Fields

| Field name | Current source в `WorkbenchContext.tsx` | Кто потребляет | Относится к chart runtime | Перейти в новый runtime | Остаться provider glue | Удалить после cutover | Риск при переносе |
|---|---|---|---|---|---|---|---|
| `activeTab` | `activeTab` state, initialized from `initialActiveTab` | `TabNav`, `App`, Composer through `setActiveTab` path | No, but gates chart IO indirectly | No | Yes | No | If moved into chart runtime, Composer/Reports navigation becomes chart-owned. |
| `setActiveTab` | React setter from `useState` | `TabNav`, `ComposerPanel` after backtest | No | No | Yes | No | Runtime could accidentally switch tabs from data events. |
| `reportLoadStatus` | report load effect state | `WorkbenchGate`, tests | Upstream dependency only | No | Yes | No | Chart runtime should not own report fetch status. |
| `reportError` | report load/bootstrap error state | `WorkbenchGate` | No | No | Yes | No | Mixing market errors with report errors would change gate behavior. |
| `reloadReport` | increments `reloadToken` | `WorkbenchGate` retry, tests | Upstream invalidation input only | No | Yes | No | Runtime-triggered reload could reset Composer/report state unexpectedly. |

### Report Context Fields

| Field name | Current source в `WorkbenchContext.tsx` | Кто потребляет | Относится к chart runtime | Перейти в новый runtime | Остаться provider glue | Удалить после cutover | Риск при переносе |
|---|---|---|---|---|---|---|---|
| `symbol` | `report?.symbol ?? "—"` | `ContextBar` | Runtime input/display metadata | No | Yes | No | New runtime should consume symbol via report, not own display context. |
| `timeframe` | constant chart timeframe | `ContextBar` | Chart metadata | Maybe as output metadata | Yes as compatibility | No | Confusing report timeframe vs chart timeframe can break warnings. |
| `report` | `fetchRunReport()` result | `ContextBar`, `ReportsPanel`, chart runtime input | Input only | No | Yes | No | Runtime owning report would duplicate report loader. |
| `runs` | `fetchRunSummaries()` result | `ContextBar` | No | No | Yes | No | Moving into runtime would couple run picker to chart. |
| `selectedRunId` | run selection state | `ContextBar`, tests, chart runtime input | Input only | No | Yes | No | Wrong owner can create stale report/run mismatch. |
| `setSelectedRunId` | wrapper around run selection state | `ContextBar` | No | No | Yes | No | Runtime should react to run changes, not select runs. |
| `selectedVariantKey` | variant key state | `ContextBar`, chart runtime input | Input only | No, except selected chart inputs | Yes | No | Dual variant owners can desync report table and chart markers. |
| `setSelectedVariantKey` | variant setter with default trade selection side effect | `ContextBar`, tests | Borderline selection input | Prefer outside runtime with explicit chart focus intent | Yes | Maybe refactor later, not cutover deletion | Current setter selects default trade; moving blindly can alter Reports behavior. |
| `selectedTradeId` | selected trade state | `ReportsPanel`, `ChartPanel`, tests | Chart focus input, but also report selection | Keep outside runtime; pass input | Yes | No | If chart runtime owns it, Reports row selection may stop highlighting. |
| `selectTrade` | callback mutating selection and chart viewport intent | `ReportsPanel`, `ChartPanel`, tests | Partly chart runtime side effect | Split: selection outside, focus intent into runtime | Yes adapter during cutover | Old mixed callback should be simplified after cutover | High: currently switches tab, sets bar, toggles trade-management markers and emits viewport command. |
| `selectedVariant` | `deriveSelectedVariant()` memo | `ReportsPanel`, `ChartPanel` | Input and marker source | No, derive upstream or adapter | Yes | No | Markers need same variant as chart model. |
| `candlesSource` | derived from `cachedBundle` and market status | `ContextBar`, `ChartPanel` | Yes, output status | Yes as runtime output | Compatibility adapter | Maybe keep if public UX still needs it | If old and new sources differ, UI can show market unavailable while chart has data. |

### Composer Context Fields

| Field name | Current source в `WorkbenchContext.tsx` | Кто потребляет | Относится к chart runtime | Перейти в новый runtime | Остаться provider glue | Удалить после cutover | Риск при переносе |
|---|---|---|---|---|---|---|---|
| `configDraft` | config state from `fetchConfigState()` / blank draft | `ComposerPanel` | No | No | Yes | No | Chart runtime should not depend on Composer draft. |
| `setConfigDraft` | React setter | `ComposerPanel` | No | No | Yes | No | Runtime could mutate unsaved Composer edits. |
| `configLoadStatus` | config fetch/apply status | `ComposerPanel` | No | No | Yes | No | No chart relevance. |
| `configLoadError` | config fetch/apply error | `ComposerPanel` | No | No | Yes | No | No chart relevance. |
| `configList` | saved config list | `ComposerPanel` | No | No | Yes | No | No chart relevance. |
| `selectedConfigPath` | selected config path | `ComposerPanel` | No | No | Yes | No | No chart relevance. |
| `reloadConfig` | calls `fetchConfigState()` | `ComposerPanel` | No | No | Yes | No | No chart relevance. |
| `selectConfig` | calls `selectSavedConfig()` | `ComposerPanel` | No | No | Yes | No | No chart relevance. |
| `createNewConfig` | creates blank draft | `ComposerPanel` | No | No | Yes | No | No chart relevance. |
| `refreshRunsAndSelectRun` | refreshes runs and selects backtest result run | `ComposerPanel` | Upstream report bootstrap only | No | Yes | No | Must continue to feed report loader, not chart runtime directly. |
| `setActiveTab` | shell setter exposed to Composer | `ComposerPanel` | No | No | Yes | No | Do not make chart runtime responsible for tab switching. |

### Chart Context Fields

| Field name | Current source в `WorkbenchContext.tsx` | Кто потребляет | Относится к chart runtime | Перейти в новый runtime | Остаться provider glue | Удалить после cutover | Риск при переносе |
|---|---|---|---|---|---|---|---|
| `marketLoadStatus` | market load effect | `ChartPanel`, tests | Yes | Yes | Adapter only | Old state yes | Wrong status ordering breaks cold start and trace bootstrap. |
| `marketError` | market load effect error | `ChartPanel` | Yes | Yes | Adapter only | Old state yes | Must not overwrite report errors. |
| `chartViewModel` | `buildChartViewModel()` memo | `ChartPanel`, tests | Yes | Yes | Adapter may keep shape | Old composition yes | Final renderer contract; divergence from compatibility fields is dangerous. |
| `chartCandles` | `chartView.candles` legacy field | Tests mainly; `ChartPanel` uses model candles | Yes, compatibility | Prefer derive from `chartViewModel.candles` | Yes temporarily | Yes when consumers migrate | Duplicate source can diverge from `chartViewModel`. |
| `chartEmaOverlays` | `chartView.emaOverlays` legacy field | Tests mainly; `ChartPanel` uses model overlays | Yes, compatibility | Derive from model | Yes temporarily | Yes when consumers migrate | Same divergence risk. |
| `chartAuxEmaOverlays` | `chartView.auxEmaOverlays` legacy field | Tests mainly | Yes, compatibility | Derive or drop | Yes temporarily | Yes when consumers migrate | Raw aux differs from display aux; naming can mislead. |
| `chartDisplayAuxEmaOverlays` | `chartDisplayAuxEmaOverlays` memo | Tests mainly; `ChartPanel` uses model display overlays | Yes | Runtime output via model | Yes temporarily | Maybe yes after model-only contract | HTF stale/frozen behavior depends on this exact projection. |
| `htfAuxEmaOverlayStale` | `htfAuxEmaOverlayStale` memo | `ChartPanel` banners/hint | Yes | Yes | Adapter | Old memo yes | Wrong stale flag hides or over-warns HTF lag. |
| `chartDisplayComponentEvents` | display cache apply state | Tests mainly; `ChartPanel` uses model events | Yes | Runtime output via model | Yes temporarily | Maybe yes after model-only contract | Events must match current run/variant/context/window. |
| `componentEventsStale` | trace display status + events memo | `ChartPanel` banners/hint | Yes | Yes | Adapter | Old memo yes | Stale markers can be presented as current. |
| `displayApplyRevision` | incremented when display state applied | `ChartPanel` marker rebuild deps | Yes, renderer invalidation signal | Yes or replaced by model revision | Adapter | Old state yes | Without a revision, markers may not rebuild after same-array retained display. |
| `renderWindowShiftSeq` | render-window commit state | `ChartPanel` viewport restore validation and markers deps | Yes | Yes | Adapter | Old state yes | Stale restore commands can apply to wrong window. |
| `chartShowEntryBlockMarkers` | marker UI preference state | `ChartPanel`, `ChartMarkerLegend` | UI preference, not runtime data | No, or separate chart UI prefs module | Provider/UI glue | No unless UI redesign | Moving to data runtime bloats it. |
| `setChartShowEntryBlockMarkers` | setter | `ChartPanel` | UI preference | No | Provider/UI glue | No | Same. |
| `chartShowExitSignalMarkers` | marker UI preference state | `ChartPanel` | UI preference | No | Provider/UI glue | No | Same. |
| `setChartShowExitSignalMarkers` | setter | `ChartPanel` | UI preference | No | Provider/UI glue | No | Same. |
| `chartShowSetupMarkers` | marker UI preference state | `ChartPanel` | UI preference | No | Provider/UI glue | No | Same. |
| `setChartShowSetupMarkers` | setter | `ChartPanel` | UI preference | No | Provider/UI glue | No | Same. |
| `chartShowTradeManagementPhaseMarkers` | marker UI preference state, auto-enabled on selected trade with management events | `ChartPanel` | UI preference with selection side effect | Prefer outside runtime | Provider/UI glue | No | Auto-enable behavior must survive split. |
| `setChartShowTradeManagementPhaseMarkers` | setter | `ChartPanel` | UI preference | No | Provider/UI glue | No | Same. |
| `chartShowTradeManagementExitMarkers` | marker UI preference state, auto-enabled on selected trade with management events | `ChartPanel` | UI preference with selection side effect | Prefer outside runtime | Provider/UI glue | No | Same. |
| `setChartShowTradeManagementExitMarkers` | setter | `ChartPanel` | UI preference | No | Provider/UI glue | No | Same. |
| `chartTimeframe` | `CHART_MARKET_TIMEFRAME` constant | `ChartPanel`, context bar via `timeframe` | Runtime metadata | Yes as config/output | Provider can pass constant | No | Must stay consistent with market cache keys. |
| `reportTimeframe` | `report?.timeframe` | `ChartPanel` warning | No, report metadata | No | Yes | No | Warning breaks if chart runtime hides report timeframe. |
| `timeframeMismatch` | derived report/chart timeframe compare | `ChartPanel` warning | UI metadata | No or adapter-derived | Yes | No | Incorrect warnings. |
| `chartViewMode` | `chartView.mode` | `ChartPanel` hint | Yes | Derive from model | Adapter | Maybe yes | Duplicate with `chartViewModel.viewMode`. |
| `chartViewCenterTimeSec` | `chartView.centerTimeSec` | `ChartPanel` hint | Yes | Derive from model | Adapter | Maybe yes | Duplicate with model. |
| `chartViewFirstTimeSec` | `chartView.firstTimeSec` | `ChartPanel` hint | Yes | Derive from model | Adapter | Maybe yes | Duplicate with model. |
| `chartViewLastTimeSec` | `chartView.lastTimeSec` | `ChartPanel` hint | Yes | Derive from model | Adapter | Maybe yes | Duplicate with model. |
| `chartViewCount` | `chartView.count` | Compatibility/tests | Yes | Derive from model | Adapter | Maybe yes | Duplicate with model. |
| `chartTradeFocusWarning` | selected trade resolution warning | `ChartPanel` | Selection adapter output | Maybe as upstream input-derived warning | Provider selection glue | No | If hidden, invalid selected trade UX degrades. |
| `marketCandlesCount` | `cachedBundle?.candles.length ?? 0` | `ChartPanel`, tests | Yes | Yes | Adapter | Old derived yes | Banners and smoke waits depend on it. |
| `fullCandleRange` | `candleRangeMs(cachedBundle.candles)` | `ChartPanel` range warning | Yes | Yes | Adapter | Old derived yes | Range warning can go false for selected distant trade. |
| `candlesSource` | derived market/unavailable | `ChartPanel`, `ContextBar` | Yes | Yes | Adapter | Maybe keep public UX | Ready signal and unavailable banner depend on it. |
| `selectedVariant` | report selection memo | `ChartPanel` markers/diagnostics | Input/renderer data | Keep upstream, pass to ChartPanel until renderer split | Provider glue | No | Must align with chart model window. |
| `selectedTradeId` | selection state | `ChartPanel` markers/nav/diagnostics | Input | Keep upstream | Provider glue | No | Marker highlight and focus nav break if duplicated. |
| `selectTrade` | mixed selection + viewport focus callback | `ChartPanel`, `ReportsPanel` | Partly runtime | Split; adapter during migration | Provider glue for selection | Mixed old callback should be deleted/refactored | High: side effects are broad. |
| `signalTrace` | dense trace state | Tests; `ChartPanel` uses `lanesSignalTrace` | Yes, legacy/diagnostics | Prefer not expose raw except lanes | Adapter temporarily | Maybe yes | Raw trace for wrong window can leak diagnostics. |
| `signalTraceStatus` | dense trace status | Tests | Yes, legacy | Prefer lanes-specific status | Adapter temporarily | Maybe yes | Can imply current window when it is not. |
| `lanesSignalTrace` | `signalTrace` only if chart window key matches | `ChartPanel` lanes/diagnostics/inspector | Yes | Yes | Adapter | Old derivation yes | Must not expose stale dense bundle. |
| `lanesSignalTraceStatus` | derived status scoped to current window | `ChartPanel` | Yes | Yes | Adapter | Old derivation yes | Loading/error banners can be wrong. |
| `lanesSignalTraceError` | derived error scoped to current window | `ChartPanel` | Yes | Yes | Adapter | Old derivation yes | Stale error from previous window/run can display. |
| `signalTraceError` | dense trace error state | Tests | Yes, legacy | Prefer scoped error | Adapter temporarily | Maybe yes | Same stale error risk. |
| `contextOverlayRef` | context overlay selection state | Compatibility/tests | UI selection key for trace/HTF | Likely upstream UI state, passed to runtime | Provider glue | No | Moving into runtime may hide selector state. |
| `setContextOverlayRef` | setter | `ChartPanel` context selector | UI selection | No; runtime consumes value | Provider glue | No | Selector must invalidate trace/HTF correctly. |
| `effectiveContextOverlayRef` | selected or default context overlay ref | `ChartPanel`, trace/runtime inputs | Runtime input key | Compute in adapter/upstream | Provider glue | No | Wrong default leaks events/overlays across context. |
| `contextOverlayRefOptions` | strategy context refs | `ChartPanel` selector | UI metadata | No | Provider glue | No | Selector options disappear. |
| `selectedBarTimeSec` | bar selection state | `ChartPanel`, lanes/inspector | UI/chart selection | Keep outside runtime or small selection module | Provider glue | No | Inspector and lanes selection break. |
| `selectBar` | setter callback | `ChartPanel` click/lanes/inspector | UI selection | No | Provider glue | No | Runtime should not own inspector selection. |
| `dispatchChartInteraction` | runtime interaction bridge | `ChartPanel`, tests | Yes | Yes | Adapter | Old callback yes | Dual dispatch causes pan/viewport bugs. |
| `chartViewportCommand` | viewport command state | `ChartPanel` | Yes | Yes | Adapter | Old state yes | Single-owner command stream required. |
| `chartViewportCommandSeq` | command sequence state | `ChartPanel` | Yes | Yes or replace with event stream | Adapter | Old state yes | Without seq, repeated same-shaped command may not apply. |
| `acknowledgeChartViewportCommand` | clears command | `ChartPanel` | Yes lifecycle | Yes | Adapter | Old callback yes | Command can repeat or be lost. |
| `isWindowSwapTransactionCancelled` | transaction guard | `ChartPanel` | Yes | Yes | Adapter | Old callback yes | Stale restore after user pan. |
| `settleWindowSwapCommit` | tells render runtime restore applied | `ChartPanel` | Yes | Yes | Adapter | Old callback yes | Render-window state can remain `applying_shift`. |

### Combined `useWorkbench()` Compatibility Fields

`useWorkbench()` returns the union of shell, report, composer and chart fields. It currently has no fields that are unique to the combined hook; it spreads `shell`, `report`, `composer`, and `chart` into one object.

| Compatibility surface | Current source | Кто потребляет | Chart runtime relevance | Future handling | Риск |
|---|---|---|---|---|---|
| All shell fields | `useWorkbenchShell()` | Tests | Mostly no | Keep as provider compatibility | Tests may mask accidental field removal. |
| All report fields | `useWorkbenchReport()` | Tests | Inputs only | Keep report provider as upstream source | New runtime should not require `useWorkbench()`. |
| All composer fields | `useWorkbenchComposer()` | Currently no production combined consumer | No | Keep separate | Avoid importing composer into chart runtime. |
| All chart fields | `useWorkbenchChart()` | Tests | Yes | Adapter during migration, shrink after cutover | If tests keep using combined fields, old API can survive too long. |

## 9. ChartPanel contract

`ChartPanel` is the renderer and imperative Lightweight Charts owner. It consumes `useWorkbenchChart()` but does not own market/trace fetching.

Fields currently received from `useWorkbenchChart()`:

- Primary renderer model: `chartViewModel`.
- Runtime/stale metadata: `htfAuxEmaOverlayStale`, `componentEventsStale`, `displayApplyRevision`, `renderWindowShiftSeq`.
- Marker UI preferences and setters: `chartShowEntryBlockMarkers`, `setChartShowEntryBlockMarkers`, `chartShowExitSignalMarkers`, `setChartShowExitSignalMarkers`, `chartShowSetupMarkers`, `setChartShowSetupMarkers`, `chartShowTradeManagementPhaseMarkers`, `setChartShowTradeManagementPhaseMarkers`, `chartShowTradeManagementExitMarkers`, `setChartShowTradeManagementExitMarkers`.
- Market/report metadata: `candlesSource`, `marketError`, `marketCandlesCount`, `timeframeMismatch`, `reportTimeframe`, `chartTimeframe`, `fullCandleRange`.
- Selection/report data: `selectedVariant`, `selectedTradeId`, `selectTrade`, `chartViewMode`, `chartViewCenterTimeSec`, `chartViewFirstTimeSec`, `chartViewLastTimeSec`, `chartTradeFocusWarning`, `selectedBarTimeSec`, `selectBar`.
- Trace/diagnostics data: `lanesSignalTrace`, `lanesSignalTraceStatus`, `lanesSignalTraceError`.
- Context overlay selector: `setContextOverlayRef`, `effectiveContextOverlayRef`, `contextOverlayRefOptions`.
- Interaction/viewport runtime contract: `dispatchChartInteraction`, `chartViewportCommand`, `chartViewportCommandSeq`, `acknowledgeChartViewportCommand`, `isWindowSwapTransactionCancelled`, `settleWindowSwapCommit`.

Callbacks `ChartPanel` calls:

- `selectBar(timeSec)` on chart click, SignalTimeline lane selection and inspector clear.
- `selectTrade(tradeId)` from trade focus navigation.
- `setContextOverlayRef(ref)` from the HTF overlay context selector.
- Marker toggle setters from `ChartMarkerLegend`.
- `dispatchChartInteraction(event)` through `createChartInteractionAdapter()` for pointer, wheel, programmatic viewport, visible logical range and resize events.
- `acknowledgeChartViewportCommand()` after applying or skipping a viewport command.
- `isWindowSwapTransactionCancelled()` before applying restore-after-shift.
- `settleWindowSwapCommit()` after a restore-after-shift command is applied.

Operations `ChartPanel` executes itself through Lightweight Charts:

- Creates and owns chart instance via `createChart()`.
- Creates candlestick series, anchor EMA line series, dynamic aux EMA line series and series markers plugin.
- Subscribes chart click and visible logical range change handlers.
- Registers pointer/wheel DOM listeners and `ResizeObserver`.
- Calls `series.setData()` for candles.
- Calls line series `setData()` and `applyOptions()` for anchor-stack EMA.
- Adds/removes aux EMA series and calls `setData()` for aux/HTF overlays.
- Executes viewport commands via `executeViewportCommand({ chart, command, candles })`.
- Suppresses programmatic viewport feedback with local refs.
- Builds markers with `buildTradeMarkersForView()`, `buildComponentEventsForView()` and `buildTradeManagementEventsForView()`, then calls `markersPlugin.setMarkers()`.
- Creates/removes trade price lines with `series.createPriceLine()` / `removePriceLine()`.
- Renders banners, hint text, marker legend, timeline lanes, trade nav, diagnostics and bar inspector.

Operations that must not move into chart runtime:

- Creating/destroying Lightweight Charts instances and series.
- `setData()` calls and series/marker/price-line imperative APIs.
- DOM event listener registration, `ResizeObserver`, layout split handles and aside sizing.
- Renderer-only suppression timers around programmatic viewport application.
- Presentation marker construction if the future runtime remains data-oriented; at most runtime should output normalized marker data, not own plugin calls.
- Banners, hints, legends, diagnostics panels and inspector UI.

Minimal `ChartRuntimeOutput` needed to replace old chart pipeline:

```ts
type ChartRuntimeOutput = {
  chartViewModel: ChartViewModel;
  market: {
    status: MarketLoadStatus;
    error: string | null;
    candlesSource: CandlesSource;
    candlesCount: number;
    fullCandleRange: { min: number; max: number } | null;
  };
  trace: {
    lanesSignalTrace: SignalTraceBundle | null;
    lanesSignalTraceStatus: SignalTraceLoadStatus;
    lanesSignalTraceError: string | null;
  };
  overlays: {
    htfAuxEmaOverlayStale: boolean;
  };
  display: {
    componentEventsStale: boolean;
    displayApplyRevision: number;
    renderWindowShiftSeq: number;
  };
  viewport: {
    command: ViewportCommand | null;
    commandSeq: number;
    acknowledge(): void;
    isWindowSwapTransactionCancelled(id: number): boolean;
    settleWindowSwapCommit(shiftSeq: number, swapTransactionId: number): void;
  };
  interaction: {
    dispatch(event: ChartInteractionEvent): void;
  };
};
```

Inputs that should remain outside this output: selected variant/trade/bar, marker preferences, report timeframe mismatch, context overlay selector state. They can be passed alongside runtime output by provider glue.

Compatibility fields that can temporarily be adapter-derived:

- `chartCandles`, `chartEmaOverlays`, `chartAuxEmaOverlays`, `chartDisplayAuxEmaOverlays` from `chartViewModel`.
- `chartViewMode`, `chartViewCenterTimeSec`, `chartViewFirstTimeSec`, `chartViewLastTimeSec`, `chartViewCount` from `chartViewModel`.
- `signalTrace`, `signalTraceStatus`, `signalTraceError` only for tests/legacy, preferably replaced by lanes-scoped fields.
- `candlesSource`, `marketCandlesCount`, `fullCandleRange` from runtime market output.

## 10. Existing helper/runtime module inventory

| Module | Current role | Who owns state today | Pure/helper or stateful runtime | Можно reuse | Нужно wrap | Нужно replace | Нельзя дублировать новым кодом | Risk |
|---|---|---|---|---|---|---|---|---|
| `workbenchMarketLoad` | Resolves target market window, evaluates pan prefetch expansion, executes candles/EMA window loads. | `WorkbenchContext.tsx` owns React state, refs and lifecycle; helper owns no React state. | Mostly helper with async side effects into cache. | Yes | Yes, wrap lifecycle/status around it | No | Do not duplicate pan expansion math or load planning. | Wrong wrapper can call `executeMarketWindowLoad()` too often. |
| `runMarketView` | Builds market view/cache refs/identity and composes market bundles from cache. | `WorkbenchContext.tsx` owns selected report/variant and readiness identity. | Pure/cache reader helper. | Yes | Thin wrapper for identity lifecycle | No | Do not duplicate identity string shape during migration. | Different identity breaks trace bootstrap and cache reuse. |
| `marketResourceCache` | Module-level candles/overlay interval caches, keys, merge/slice/coverage helpers. | Module-level maps own stores; `WorkbenchContext.tsx` owns revision counters and write timing. | Stateful module cache. | Yes | Yes, through one loader owner | No | Absolutely do not create a second cache implementation. | Dual cache writes/reads create invisible misses and stale chart data. |
| `chartRuntime` | Combines render-window controller and viewport controller; dispatches interactions. | `WorkbenchContext.tsx` owns `chartRuntimeRef` instance and command state. | Stateful runtime factory. | Maybe | Yes, as internal runtime component | Maybe not replace initially | Do not instantiate old and new runtimes for same ChartPanel events. | Dual dispatch or two viewport controllers causes teleport/pan bugs. |
| `renderWindowController` | Tracks interaction state, pending shift, idle debounce, shift commits and manager. | `chartRuntimeRef` in provider. | Stateful runtime. | Yes | Yes | No initially | Do not reimplement boundary state machine without tests. | Applying shift state can get stuck or commit during programmatic viewport. |
| `viewportController` | Tracks viewport owner/focus intent and emits focus/restore commands. | `chartRuntimeRef` in provider plus provider command state. | Stateful runtime. | Yes | Yes | No initially | Do not create parallel focus-intent owner. | User pan vs trade focus ownership is fragile. |
| `chartViewModel` | Pure final renderer model projection with `seriesKey`. | Provider owns inputs and memo. | Pure helper. | Yes | No | No | Do not build a second incompatible model key. | `seriesKey` changes drive `ChartPanel` setData behavior. |
| `chartViewWindow` | Constants, time/index helpers, legacy window slicing helpers. | Provider/render manager owns actual window. | Pure helper. | Yes | No | No | Do not duplicate `CHART_RENDER_WINDOW_SIZE` / safe zone constants. | Unit mismatch in window size breaks perf and pan. |
| `chartRenderWindowDisplay` | Candle bounds, display/frozen aux overlay projection, stable array refs and keys. | Provider owns refs and memo lifecycle. | Pure helper. | Yes | Maybe for display projector | No | Do not duplicate stale/frozen HTF behavior. | Overlay flicker/stale display regressions. |
| `signalTraceDisplayCache` | Normalized display cache for events/HTF with chunk coverage and merge helpers. | Provider owns cache instance ref and reset/version lifecycle. | Stateful cache factory + pure helpers. | Yes | Yes | No | Do not create a second display cache under new runtime. | Markers/HTF can leak across context or miss windows. |
| `signalTraceBundleSessionCache` | Per-session dense trace bundle cache keyed by runtime identity and chart window. | Provider owns instance ref and reset identity. | Stateful cache factory. | Yes | Yes | No | Do not maintain separate session caches in old/new runtimes. | Stale lanes restore across run/variant/context. |
| `traceDisplayOrchestrator` | Active pan blocking, coalesced trace fetch intent, display load planning. | Module owns global pending fetch intent; provider owns scheduling effect. | Mixed: pure policy + module-level coalescer. | Yes, but carefully | Yes | Maybe replace global coalescer later | Do not use two coalescers. | Module-level pending intent can cross runtimes if both active. |
| `traceDisplayChunkScheduling` | Builds display chunk keys and plans missing normalized chunks. | Provider owns cache/candles inputs. | Pure helper. | Yes | No | No | Do not duplicate chunk key/range planning. | Duplicate chunk shape can defeat coordinator dedupe. |
| `workbenchTraceNetworkLoad` | Performs chart-events fetch, dense signal-trace fetch, fallback merge and lanes decisions. | Provider owns AbortController, generation, state setters, cache refs. | Async helper with network/cache side effects via context. | Yes | Yes, behind trace runtime | No initially | Do not duplicate fallback/lanes decision matrix. | Chart-events/dense fallback regressions are high impact. |
| `signalTraceRequestCoordinator` | Dedupe ledger for trace request keys: in-flight, merged, failed. | Provider owns coordinator instance ref and reset timing. | Stateful runtime factory. | Yes | Yes | No | Do not instantiate two coordinators for same network path. | Fetch storm or permanent failed-key suppression. |
| `chartEventsLoad` | Feature flag, display request key selection, fallback reason mapping. | Module owns flag-disabled noted bit; provider/network helper uses functions. | Pure helpers + module-level note flag. | Yes | Thin wrapper | No | Do not create alternate flag/key behavior. | Display request key can collide with dense trace key. |
| `strategySpecAuxEma` | Derives aux EMA specs and HTF overlays from strategy/trace. | Provider owns aux overlay state and fetch lifecycle. | Pure helper. | Yes | No | No | Do not duplicate spec extraction. | Aux overlays can mismatch strategy spec or context. |
| `strategyContexts` | Reads context refs/default context from strategy spec. | Provider owns selected `contextOverlayRef`. | Pure helper. | Yes | No | No | Do not duplicate default context selection. | Trace/cache keys can switch unexpectedly. |
| `tradeLookup` | Trade id comparison, variant derivation, default trade selection and navigation helpers. | Provider owns selected variant/trade state. | Pure helper. | Yes | No | No | Do not duplicate string/number id comparison. | Managed string trade ids and legacy numeric ids regress. |

## 11. Lifecycle / effect ordering timeline

| Step | Triggering state/effect | Required inputs | Produced outputs | Reset conditions | Stale/abort protection | Debug step | What breaks if reordered |
|---|---|---|---|---|---|---|---|
| 1. App/provider mount | `WorkbenchProvider` initial render; config/runs effects mount | `initialActiveTab` | initial shell/config/report/chart states, refs, runtime instance | Unmount/remount | React cleanup only | none | Creating runtime after ChartPanel events would drop first interactions. |
| 2. Runs load | runs bootstrap effect on `reloadToken` | Research API reachable | `runs`, default `selectedRunId`, or report error | `reloadToken` | local `cancelled` flag | none | Report load cannot start without selected run; empty runs should gate UI. |
| 3. Selected run | `setSelectedRunIdState()` from bootstrap/user/Composer | run id exists in list usually | `selectedRunId` | user switches run or Composer selects new run | none | none | If report fetch starts for wrong run, all downstream identity is stale. |
| 4. Report load | report effect on `selectedRunId`, `reloadToken` | selected run id | `report`, `reportLoadStatus`, `reportError`; resets market status/identity/revisions | run/reload change | local `cancelled` flag | `wb.load.report_ready` after ready | Market/trace must not run against previous report during loading. |
| 5. Variant/trade default selection | report/variant effects and layout validation | report variants, previous variant key, selected trade id | normalized `selectedVariantKey`, `selectedVariant`, default `selectedTradeId`, `selectedBarTimeSec` | report/run/variant change, invalid selected trade | refs prevent repeated bootstrap | none | Trade focus can target old variant or no valid entry. |
| 6. Market view identity | memos from report/variant/chart timeframe/reload | selected variant, report data range, strategy anchor stack | `intendedRunMarketView`, `expectedRunMarketViewIdentity` | report/variant/reload/timeframe | try/catch for anchor stack parse | none | Trace bootstrap blocks or cache keys change unexpectedly. |
| 7. Focus/coverage window reset | effect on intended market view and selected trade entry | market view, selected trade entry time | `marketFocusWindow`, `marketCoverageWindow`, reset prefetch/fallback refs | no market view, focus window changes | equality checks avoid redundant state | none | Coverage can survive wrong run/trade or ready key can stay stale. |
| 8. Market fetch/cache | market load effect on coverage key/gate/report | report ready, chart IO gate, variant, focus/coverage windows | cache writes, `marketLoadStatus`, `marketError`, ready identity, revisions | effect cleanup, run/report/window change | `AbortController`, `marketLoadGenRef`, identity check, in-flight keys | `wb.market_fetch.*`, `wb.market_candles_decision`, `wb.market_ema_decision`, `wb.chart_heavy_io.blocked_until_activation` | Ready status before focus candles breaks chart; late stale error can blank new run. |
| 9. Bundle composition | `cachedBundle` memo on view/window/revisions/status | market cache coverage, focus/coverage windows | display bundle, compose source, candle count/range/source | market error or missing focus candles | focus fallback while coverage loading | `wb.load.market_bundle_ready`, `wb.market_compose_focus_fallback` | Chart can blink empty or render stale coverage. |
| 10. Render window init | effect on `renderWindowFoundationKey` and market ready | focus/coverage candles, selected trade entry | manager reset, tail or around-trade window, `renderWindowRevision` | market error, run/variant/foundation change | manager reset; forced trade rebuild | `wb.render_window.init`, `wb.render_window.trade_select` | Trace can bootstrap before candles; selected trade may be outside slice. |
| 11. Chart model composition | `chartWindowSlice`, `chartView`, `chartViewModel` memos | cached bundle, render window indices, aux/events/stale state | final `chartViewModel`, legacy fields | bundle/status/revision/aux/events changes | stable refs by bounds keys | `wb.chart_window_slice` | Renderer can redraw too often or display inconsistent arrays. |
| 12. ChartPanel setData | `ChartPanel` layout effects on model series key/arrays | chart instance, selected variant, model candles/overlays | Lightweight Charts series data and aux series | chart unmount, empty selected variant | atomic shift key suppresses duplicate setData | `chart.setData.candles`, `chart.setData.anchor_ema`, `chart.setData.aux_htf` | Viewport restore can apply to data not yet set. |
| 13. Trace bootstrap | main trace effect after render bounds/model/market identity | report ready, market ready, expected identity, chart window key, candles | bootstrap request/window key or idle status | no gate, report/run/window mismatch | bootstrap block reasons, previous window key reset | `wb.signal_trace.bootstrap_ready`, `wb.signal_trace.bootstrap_blocked` | Trace fetch for wrong window/run produces stale markers. |
| 14. Trace/events load | trace plan/coordinator/network inside main trace effect | bootstrap, display cache coverage, request keys, context overlay, IO gate | display cache chunks, dense lanes trace, status/error | cleanup on deps, cache key reset, session identity reset | AbortController, generation, coordinator `isResponseCurrent`, in-flight ledgers | `wb.trace_display.*`, `wb.signal_trace.*`, `wb.chart_events_*`, `wb.lanes_trace_*` | Fetch storms, lost fallback, stale errors or marker leaks. |
| 15. Markers/events render | `ChartPanel` marker layout effect | model events, selected variant/trade, toggles, candles | marker plugin markers | chart unmount, no candles/variant | view filtering by candle range | `chart.markers.rebuild` | Markers can show for wrong run/window or not update after retained display. |
| 16. User pan | ChartPanel DOM/range events through adapter | pointer/wheel/visible logical range, current candles | runtime interaction state, possible coverage prefetch sample | pointerup, programmatic suppression | suppression refs in ChartPanel; interaction state in runtime | `wb.pan.suppressed_programmatic`, `wb.market_pan_prefetch_decision` | Programmatic viewport can be mistaken for user pan. |
| 17. Render-window shift | render-window boundary intent on visible range, commit on pointerup/idle | current render window, visible range near safe zone | shifted manager bounds, shift seq, restore command, trace fetch intent | settle/cancel/reset | transaction id, applying shift state, idle timer cleanup | `wb.render_window.shift_applied`, `wb.render_window.shift_settled`, `wb.render_window.shift_restore_cancelled` | User sees jump/teleport or runtime stuck in applying shift. |
| 18. Coverage expansion | `attemptMarketPanPrefetch()` from visible range or window commit | coverage window, report bounds, timeframe, user-pan state | expanded `marketCoverageWindow` | focus reset, identical expansion key | sample/expansion dedupe refs | `wb.market_pan_prefetch_decision` | Repeated expansion can flood market APIs; missing expansion stops edge pan. |
| 19. Viewport restore | ChartPanel effect on viewport command/seq | command, current candles, shift seq, transaction id | Lightweight Charts visible range change, command ack, shift settle | command ack, pointerdown cancellation | cancellation check, stale shift seq check, programmatic suppression | `chart.viewport.apply`, `chart.viewport.apply_trade_focus`, `chart.viewport.restore_after_shift`, stale/cancel debug steps | Restore can apply after user pan or before data is ready. |

## 12. Keys, cache and request identity map

| Key / identity | Кто строит | Inputs | Где хранится | Когда сбрасывается | Кто сравнивает | Bugs при неверном key |
|---|---|---|---|---|---|---|
| `runMarketViewIdentity` | `buildRunMarketViewIdentity()` in `runMarketView` | run id, variant, candles key, overlay keys, reload token | state `runMarketViewIdentity`, refs/memos | report load reset, market error, new ready view | trace bootstrap compares with expected identity | Trace blocked forever or stale trace allowed for wrong market cache. |
| Candles market cache key | `buildCandlesCacheKey()` | symbol, chart timeframe, reload token | module-level `marketResourceCache` maps, `RunMarketView.candlesKey` | effectively by reload token/key; stores persist per key | market planner/cache readers | Cross-run cache pollution or missed cache reuse. |
| Overlay market cache key | `buildOverlayCacheKey()` | symbol, timeframe, source, EMA role, period, reload token | module-level overlay cache maps, `RunMarketView.overlayRefs` | by reload token/key | market planner/cache readers | Wrong EMA periods displayed or refetched unnecessarily. |
| Focus window key | `buildMarketTargetWindowKey()` | market view identity + focus from/to/toOpen | memo `marketFocusWindowKey`, `marketReadyTargetKeyRef` | focus window/view reset | market load readiness | Market status can say ready for wrong focus. |
| Coverage window key | `buildMarketTargetWindowKey()` | market view identity + coverage from/to/toOpen | memo `marketCoverageWindowKey` | coverage/focus/view reset | market load effect deps, fallback logs | Coverage expansion may not fetch or may fetch repeatedly. |
| Render window foundation key | local memo | focus key + focus candle count | memo `renderWindowFoundationKey` | focus/view/status/candle revision change | render-window init effect | Render window re-inits too often or misses first init. |
| Chart window key | local memo | selected run, selected variant key, first candle sec, last candle sec, effective context overlay ref | memo `chartWindowKey` | render window/context/run/variant changes | trace bootstrap, lanes status/error derivation | Trace/events/lanes can bind to wrong window or context. |
| Trace display cache key | `buildTraceDisplayCacheKey()` | selected run, variant, context overlay ref | memo, display cache internal identity | traceDisplayCacheKey or reload token change | display cache reset effect | Component events/HTF leak across variant/context. |
| Dense trace request key | `buildTraceRequestKey()` | run id, variant, from ms, to open ms, context overlay ref | local `lanesRequestKey`, coordinator ledger | coordinator reset on run/cache key/test invalidation | coordinator evaluate/in-flight/current checks | Duplicate dense fetch or stale dense response accepted. |
| Display trace request key | `buildDisplayTraceRequestKey()` | same trace params; chart-events key when flag enabled | local `displayRequestKey`, coordinator ledger | coordinator reset | coordinator evaluate and network helper | Chart-events and dense fallback collide or fail to dedupe. |
| Display chunk key | `buildTraceDisplayChunkKey()` | run, variant, context ref, chart timeframe, normalized from/to seconds | local debug/planning key | per chunk plan | debug/coordinator metadata | Hard to diagnose misses; duplicate chunks if bounds differ. |
| Session cache identity | `buildSessionCacheIdentity()` | run, variant, context ref, reload token, market identity/cache key | session cache internal identity | effect on identity change | session cache reset/has/get/set | Dense lanes restored across wrong run/market identity. |
| Market in-flight fetch keys | `buildCandlesWindowInFlightKey()`, `buildEmaWindowInFlightKey()` | candles/overlay cache key + missing range | `marketFetchInFlightKeysRef` | deleted in finally; ref persists | `executeMarketWindowLoad()` | Parallel duplicate market requests or stuck skip. |
| Trace coordinator keys | display or dense request keys | request params + chart-events flag | coordinator in-flight/merged/failed maps | coordinator reset on run/cache identity/test invalidation | `evaluate()`, `mark*()`, `isResponseCurrent()` | Fetch storm, permanent failed suppression, stale response commit. |
| Viewport command seq | provider increments in `emitChartViewportCommand()` | command emission count | state `chartViewportCommandSeq` | never reset explicitly | ChartPanel effect deps | Same-shaped command may not re-run if seq missing. |
| Window swap transaction id | provider increments on window swap commit | commit event | `windowSwapTransactionIdRef`, command payload | pointerdown cancels through current id | ChartPanel cancellation check | Restore applies after user cancellation. |

## 13. Time/range units and invariants

Time/range units:

- Report data range uses Unix milliseconds from report fields such as `data_range.from_open_time_ms` and `data_range.to_open_time_ms`.
- Market API windows use milliseconds. `fromMs` is inclusive. `toMs` is treated as exclusive for cache slicing. `toOpenTimeMs` is the last requested/open candle timestamp, inclusive as an open time.
- Chart candles use seconds in `ChartBar.time`, matching Lightweight Charts time values used by series data and markers.
- Trace/chart-events request params use milliseconds: `fromMs` and `toOpenTimeMs`, derived from current render-window first/last candle seconds.
- Trace display cache coverage uses seconds: `fromSec` and `toSec`, inclusive over the displayed bar grid.
- Lightweight Charts visible logical range uses floating logical indices relative to the currently rendered series, not timestamps.
- Render-window manager uses integer candle indices into the current cached bundle, with `windowStartIndex` inclusive and `windowEndIndex` exclusive.
- Marker filtering uses candle seconds inclusive: marker time must be `>= first candle time` and `<= last candle time`.

Required invariants:

- Focus window must be inside report range.
- Coverage window must cover focus window.
- Coverage expansion must be clamped to report range.
- Market `ready` must mean focus candles are present for the current intended market identity.
- Display bundle must not be empty when market status is ready and `candlesSource === "market"`.
- Coverage fallback must keep focus bundle visible while expanded coverage is still loading.
- Render window indices must be inside the current cached bundle length.
- If prepending candles changes the first bundle candle, render-window start must be offset to preserve the visible data.
- Chart model candle range must match the render-window slice and `seriesKey`.
- Anchor EMA and aux overlay points must be sliced to the chart model candle range.
- Viewport `focusTrade` must target a candle inside the current render window or be preceded by a render-window rebuild around that trade.
- `restoreAfterWindowSwap` must apply only to the matching `renderWindowShiftSeq` and non-cancelled transaction id.
- Trace window key must match current run, variant, render-window candle bounds and effective context overlay ref.
- Dense lanes trace must be exposed only when `loadedSignalTraceWindowKey === chartWindowKey`.
- Component events and HTF overlays must not outlive the wrong run/variant/context key.
- Marker rebuild must use the same selected variant/trade state as the chart model candle window.
- Programmatic viewport changes must not be treated as user pan for pan prefetch or focus-intent clearing.

## 14. Baseline smoke and debug contract

Enable debug with `VITE_EMA_PIPELINE_DEBUG=true` and capture `__pipelineDebugExport()` after each scenario when needed.

| Scenario | Manual steps | Expected visible behavior | Expected key debug steps | Forbidden symptoms | Minimum debug snapshot data |
|---|---|---|---|---|---|
| Cold chart open | Start app with Chart as initial tab and API available. | Chart shows market candles, EMA stack, default closed trade focus or tail; no unavailable banner. | `wb.load.report_ready`, `wb.market_fetch.start/end`, `wb.load.market_bundle_ready`, `wb.render_window.init`, `chart.setData.candles`, trace bootstrap/apply steps. | Empty chart after ready, repeated report fetch, market status stuck loading. | run id, variant, market keys, focus/coverage window, bar count, chart series key. |
| Tab switch to Chart | Start on Composer or Reports, then open Chart. | Heavy chart IO starts only after activation; chart eventually appears. | Before activation: `wb.chart_heavy_io.blocked_until_activation`; after activation market/trace fetch steps. | Market/trace fetch before Chart activation, or never starts after switch. | active tab, `hasChartEverActivated`, blocked source, first market fetch key. |
| Selected distant trade navigation | Use Reports row or Chart trade nav to select a trade far from current view. | Chart switches/focuses around selected trade, marker highlighted, no flicker to empty. | `wb.render_window.trade_select`, `chart.viewport.apply_trade_focus`, trace bootstrap for new window. | Trade selected but marker not in view; viewport stays at old range; old events remain as current. | selected trade id, entry time, chart window key, render bounds, selected marker in view flag. |
| Pan left boundary | Drag/wheel toward left edge until render window/coverage shifts. | Visible range continues smoothly; older candles load if within report range; restore after shift preserves anchor. | `wb.market_pan_prefetch_decision` with left expansion or clamp, `wb.render_window.shift_applied`, `chart.viewport.restore_after_shift`. | Fetch storm, jump/teleport, chart blanks during coverage prefetch. | visible logical range, sampled candle times, coverage before/after, shift seq, transaction id. |
| Pan right boundary | Drag/wheel toward right edge. | Newer candles load if not at report end; clamped at right boundary; restore remains stable. | right-side `wb.market_pan_prefetch_decision`, market fetch/cache or clamp, render shift/restore. | Infinite expansion at report end, repeated identical fetches, range snaps back to trade. | same as left plus report `toOpenTimeMs`. |
| Variant switch | Change Instance in context bar. | Variant selection updates default trade; market cache may reuse candles; EMA overlays update by periods; report not refetched. | no report fetch for variant change; market cache hit/fetch depending periods; render init; trace cache reset. | Report refetch, old variant markers/events, wrong EMA periods. | previous/next variant, anchor periods, candles key, overlay keys, chart window key. |
| Context overlay switch | Use HTF overlay selector when options exist. | Trace/events/HTF overlays reload for selected context; candles remain stable. | trace display cache reset, signal trace decision/fetch, `wb.trace_display.apply_current_window`, aux/HTF setData. | Market refetch just for context switch, old context events shown as current, HTF overlay stale forever. | context ref old/new, trace display cache key, display request key, HTF overlay counts. |
| Chart-events enabled fallback | Set `VITE_CHART_EVENTS_API=1`; force chart-events success or failure. | On success, component events appear before dense trace can finish; on failure, dense fallback still fills display if possible. | success: `wb.chart_events_merge`; failure: `wb.chart_events_fetch_fail`, `wb.chart_events_fallback`, dense fetch/merge. | Dense failure hides chart-events display, duplicate markers, stale 404 from old run shown. | feature flag, display request key, lanes request key, merge source, event count. |
| Chart-events disabled | Run with flag off. | Single combined dense signal-trace path; events/HTF load via dense fallback. | `wb.chart_events_fallback` reason `flag_disabled`, dense `wb.signal_trace.fetch_start/end`, display merge. | Attempts `/chart-events`, duplicate dense fetches. | flag, trace request key, coordinator decision, display load outcome. |

## 15. Old runtime deletion inventory

| Group | Current symbols/state/refs/effects/functions | Target new owner | Static guard idea | Deletion phase | Acceptance proof |
|---|---|---|---|---|---|
| Market identity/windows | `runMarketViewIdentity`, `intendedRunMarketView`, `expectedRunMarketViewIdentity`, `marketFocusWindow`, `marketCoverageWindow`, window refs/keys/reset effect | `MarketViewIdentityResolver`, `MarketWindowController` | No `marketFocusWindow`/`marketCoverageWindow` state in `WorkbenchContext.tsx` | After new runtime drives market output behind adapter | Context only passes report/selection inputs; tests pass variant/run switch and distant trade. |
| Market load/cache | `marketLoadStatus`, `marketError`, revisions, `marketLoadGenRef`, `marketFetchInFlightKeysRef`, market load effect | `MarketResourceLoader` | No direct `executeMarketWindowLoad()` call in provider | After new loader owns status and revisions | Cold open and pan prefetch tests pass; no duplicate network calls. |
| Bundle composition | `cachedBundle`, `cachedBundleCandlesRef`, compose source/fallback refs/effects, `fullCandleRange`, `marketCandlesCount`, `candlesSource` | `MarketBundleComposer` | Provider cannot import `composeDisplayMarketWindowBundle()` | After runtime output includes market bundle/model inputs | Focus fallback smoke shows no blank chart. |
| Pan/edge | `attemptMarketPanPrefetch`, pan log/expansion/sample refs | `MarketPanPrefetchController` | Provider cannot import `evaluateMarketPanPrefetchExpansion()` except tests | After interaction runtime emits coverage expansion intents | Left/right pan smoke and dedupe tests pass. |
| Render window | `chartRuntimeRef.renderWindow`, `renderWindowRevision`, `renderWindowShiftSeq`, `applyRenderWindowForTrade`, init/shift effects | `RenderWindowRuntime` | Provider cannot call `renderWindowManager()` | After runtime owns slicing window and shift seq | Distant trade, shift restore and render-window controller tests pass. |
| Viewport command | `chartViewportCommand`, seq, `emitChartViewportCommand`, acknowledge/cancel/settle callbacks, transaction refs | `ViewportCommandRuntime` | Single exported viewport command stream from runtime | After ChartPanel consumes adapter output | Pointerdown cancellation and restore smoke pass. |
| Trace bootstrap/network/cache | `signalTrace*` states/refs, `loadedSignalTraceWindowKey`, coordinator ref, session cache ref, trace effect, cache key effects | `TraceRuntimeOrchestrator` and `TraceNetworkRuntime` | Provider cannot import trace network/coordinator modules | After runtime owns trace output | Chart-events enabled/disabled and run switch tests pass. |
| Chart events/component events | `chartDisplayComponentEvents`, refs, display apply revision, component stale logic | `TraceDisplayCacheRuntime` / `ChartEventsDisplayRuntime` | Provider cannot set component events directly | After model includes component events from runtime | Marker event tests pass; stale retention behavior preserved. |
| Aux/HTF overlays | `auxEmaOverlays`, context overlay default/validation, aux specs, BFF aux EMA effect, HTF fallback effects | `AuxOverlayRuntime` plus UI context selector glue | Provider cannot fetch `fetchChartOverlayEma()` for chart overlays | After runtime emits display aux overlays and stale flag | HTF overlay/context switch tests pass. |
| Chart window slicing | chart slice caches, `chartWindowSlice`, `chartView`, candle refs | `ChartWindowProjector` | Provider cannot call manager slice methods | After runtime emits `ChartViewModel` | `seriesKey` and setData behavior stable. |
| Chart view model composition | `chartViewModel` memo and legacy field duplication | `ChartViewModelComposer` | Provider derives legacy fields only from runtime output | During adapter phase, then shrink API | ChartPanel works from runtime model only. |
| Chart context compatibility fields | broad `chartValue` construction | `WorkbenchChartProviderAdapter` | Type test that adapter has no side effects/imports of loaders | Last phase after ChartPanel contract stabilized | `WorkbenchContext.tsx` loses chart runtime refs/effects and only wires contexts. |

## 16. Single-owner matrix

| Mutable domain | Current owner | Temporary owner during build-beside phase | Owner after cutover | Forbidden dual-owner situation | How to detect violation |
|---|---|---|---|---|---|
| Selected chart focus intent | `selectTrade()` + viewport controller in provider | Provider selection remains owner; new runtime consumes explicit focus intent shadow only | Selection provider + `ViewportCommandRuntime` for viewport intent | Old and new callbacks both dispatch `trade_selected` | Duplicate `focusTrade` commands or two `chart.viewport.apply_trade_focus` marks per selection. |
| Market focus/coverage windows | Provider state/effects | Old provider until switch; new runtime can compute in shadow without fetching | `MarketWindowController` | Both update coverage and trigger fetch | More than one market fetch for same expansion key; coverage windows differ in debug snapshot. |
| Market load status | Provider market effect | Old provider visible; new runtime status hidden/shadow | `MarketResourceLoader` | Two statuses exposed or old status drives ChartPanel while new data drives model | UI status disagrees with candle data/source. |
| Market resource cache writes | `executeMarketWindowLoad()` called by provider | Only old provider writes until cutover, or new runtime in isolated tests | `MarketResourceLoader` | Old and new loaders write same module cache concurrently | Duplicate `/market/*-window` requests with same in-flight key. |
| Render-window indices | `ChartDataWindowManager` inside provider `chartRuntimeRef` | Old runtime visible; new runtime must not receive ChartPanel dispatch live | `RenderWindowRuntime` | Same interaction event sent to two managers | Two different `seriesKey`/window bounds for same visible event. |
| Viewport command stream | Provider command state and viewport controller | Old stream visible; new stream shadow only | `ViewportCommandRuntime` | ChartPanel applies commands from both streams | Repeated ack/apply logs or restore after cancelled transaction. |
| Trace display cache | Provider `signalTraceDisplayCacheRef` | Old cache visible; new cache isolated/shadow | `TraceDisplayCacheRuntime` | Both merge chunks and expose events | Duplicate component events, different coverage for same chart window. |
| Dense lanes trace | Provider `signalTrace` + session cache | Old visible; new shadow only | `TraceNetworkRuntime` | Both fetch dense trace for same window | Duplicate `/signal-trace` requests or stale lanes visible. |
| Chart events/component events | Provider display apply state | Old visible; new shadow only | `ChartEventsDisplayRuntime` / trace display runtime | Old chart-events and new chart-events both merge/display | Event counts double or old events survive context switch. |
| Aux/HTF overlays | Provider `auxEmaOverlays` and `lastSlicedHtfOverlaysRef` | Old visible; new shadow only | `AuxOverlayRuntime` | Two BFF aux fetchers and two HTF frozen stores | Duplicate aux series ids, stale HTF banner inconsistent. |
| Final chart model | Provider `buildChartViewModel()` memo | Exactly one model passed to ChartPanel; new model can be logged/tested separately | `ChartViewModelComposer` | ChartPanel gets old model but status from new runtime, or vice versa | Model candle count disagrees with market count/source and debug keys. |

## 17. Test inventory and gaps

| File | What it covers | What it does not cover | Reuse for new runtime | New tests required before cutover |
|---|---|---|---|---|
| `frontend/src/shared/context/workbenchLoad.test.tsx` | Provider integration: report-load invariants, lazy chart IO, HTF context overlays, trace scheduling, split market cache, abort/dedupe, pan prefetch, stable slices. | New runtime API shape and adapter deletion; real ChartPanel DOM execution. | High; adapt to new provider adapter and compare behavior. | Shadow-vs-active single-owner checks; `ChartRuntimeOutput` contract tests. |
| `frontend/src/shared/context/chartEventsRunSwitch.test.tsx` | Chart-events bootstrap after run switch and stale 404 handling. | New runtime cutover path and old trace effect deletion. | High. | Assert no old provider trace effect/network imports remain active. |
| `frontend/src/shared/context/chartEventsDistantTradeDisplay.test.tsx` | Distant trade selected marker after deferred chart-events merge. | Full Lightweight Charts viewport behavior. | High. | New runtime selected trade focus intent and display merge integration. |
| `frontend/src/shared/context/chartEventsDisplayLoad.test.tsx` | Chart-events display success before dense trace, dense failure fallback, flag-off combined path, lazy dense lanes. | Pan + chart-events interaction in real renderer. | High. | Adapter compatibility fields derived from runtime output. |
| `frontend/src/features/chart/workbenchMarketLoad.test.ts` | Market window load ordering, cache skip, pan prefetch expansion decisions. | React lifecycle/status ownership. | High. | New `MarketResourceLoader` wrapper lifecycle tests. |
| `frontend/src/features/chart/runMarketView.test.ts` | Market view cache reuse, seeding, fetch key, window compose and focus fallback. | Provider reset order. | High. | Identity compatibility test between old and new resolver. |
| `frontend/src/features/chart/marketWindowPlanner.test.ts` | Target display windows, timeframe span, missing candles/EMA plans, distant gaps. | Pan interaction and loader status. | High. | Controller-level test that coverage covers focus and clamps to report. |
| `frontend/src/features/chart/marketResourceCache.test.ts` | Cache key shape, interval coverage, half-open slicing, seeding, dedupe, eviction. | Multi-runtime write ownership. | High. | Guard test that only one loader writes cache in cutover integration. |
| `frontend/src/features/chart/marketIntervalCoverage.test.ts` | Missing market range gap logic. | Runtime integration. | High. | None beyond wrapper tests. |
| `frontend/src/features/chart/chartTimeframeMs.test.ts` | Timeframe to ms mapping. | Runtime use of timeframe in keys. | High. | Key invariant test using chart timeframe. |
| `frontend/src/features/chart/signalTraceDisplayCache.test.ts` | Trace/chart-events chunk bounds, display cache coverage, dedupe, HTF slicing, eviction. | React display apply lifecycle. | High. | New display cache runtime reset by run/variant/context. |
| `frontend/src/features/chart/traceDisplayApplyLifecycle.test.ts` | Display apply state, partial/loading/stale retention. | Network orchestration. | High. | Runtime output revision test for retained display. |
| `frontend/src/features/chart/runtime/workbenchTraceNetworkLoad.test.ts` | Chart-events fetch/merge/fallback, dense lanes fetch, display fallback, lanes decisions. | Provider lifecycle and AbortController dependency ordering. | High. | New `TraceNetworkRuntime` integration with coordinator/cache ownership. |
| `frontend/src/features/chart/runtime/signalTraceRequestCoordinator.test.ts` | Trace key shape, chart-events key shape, in-flight/merged/failed dedupe. | Multiple runtime instances. | High. | Single coordinator owner violation test. |
| `frontend/src/features/chart/runtime/traceDisplayChunkScheduling.test.ts` | Display chunk key and missing chunk planning. | Runtime scheduling during pan. | High. | Integration test for active-pan block with missing range. |
| `frontend/src/features/chart/runtime/traceDisplayOrchestrator.test.ts` | Pan block policy, display load planning, no viewport side effects. | Provider coalescer global collision. | Medium/high. | Test that new runtime does not share global coalescer with old active runtime. |
| `frontend/src/features/chart/runtime/renderWindowController.test.ts` | Pending shift, pointerup commit, idle fallback, applying shift settle/cancel. | Market coverage interaction. | High. | Runtime integration test from visible range to output shift seq. |
| `frontend/src/features/chart/runtime/viewportController.test.ts` | Trade focus intent, user pan clearing, restore-after-window-swap, resize no refocus. | ChartPanel execution of commands. | High. | Command stream adapter test with ack/cancel/settle. |
| `frontend/src/features/chart/runtime/chartViewModel.test.ts` | Stable `seriesKey` from bounds/mode. | Full model field consistency. | High. | Contract test for minimal `ChartRuntimeOutput`. |
| `frontend/src/features/chart/chartDataWindowManager.test.ts` | Window manager indices/slicing/near-boundary behavior. | Controller debounce and viewport restore. | High. | New runtime projector uses same manager invariants. |
| `frontend/src/features/chart/chartRenderWindowDisplay.test.ts` | Stable display keys and frozen HTF overlay projection. | Provider trace/cache lifecycle. | High. | Aux runtime stale/frozen integration test. |
| `frontend/src/features/chart/chartViewWindow.test.ts` | Legacy slicing helpers and constants. | New render-window manager path. | Medium. | Ensure no new code reverts to legacy full-array slicing unexpectedly. |
| `frontend/src/features/chart/chartViewport.test.ts` | Viewport helper/suppression behavior. | End-to-end ChartPanel command application. | Medium/high. | Programmatic viewport does not trigger pan prefetch in new runtime. |
| `frontend/src/features/chart/chartMarkers.test.ts` and `chartMarkers.breakEven.test.ts` | Trade marker generation and break-even labels. | Provider selected variant/model sync. | High for renderer. | Integration marker sync after new model cutover. |
| `frontend/src/features/chart/chartComponentEvents.test.ts` | Component event markers/filtering/tooltips. | Trace cache lifecycle. | High for renderer. | Marker stale/current integration after runtime switch. |
| `frontend/src/features/chart/tradeManagementChartEvents.test.ts` | Trade-management marker generation/toggles/selected trade filtering. | Auto-enable toggles in `selectTrade()`. | High for renderer. | Preserve auto-enable behavior or explicitly relocate it. |
| `frontend/src/features/chart/tradeLookup.test.ts` | Trade id equality, variant derivation, default closed trade, navigation/display ids. | Runtime side effects from selection. | High. | Split selection vs focus intent tests. |
| `frontend/src/features/chart/ChartTradeFocusNav.test.tsx` | Trade nav UI stepping/manual input. | Runtime viewport focus after nav. | Medium. | Integration with new `selectTrade` adapter. |
| `frontend/src/features/chart/ChartMarkerLegend.test.tsx` | Marker toggle UI. | Runtime data ownership. | Medium. | Ensure toggles remain UI/provider state after runtime extraction. |
| `frontend/src/features/chart/ChartTradeDiagnostics.test.tsx` | Diagnostics rendering. | Runtime trace/model ownership. | Medium. | Ensure lanes trace and overlays still feed diagnostics. |
| `frontend/src/features/chart/chartTradePriceLines.test.ts` | Price line spec generation. | ChartPanel imperative lifecycle. | Medium. | Smoke that selected trade price lines update after runtime cutover. |
| `frontend/src/features/chart/chartPanelSplit.test.ts` and `chartAsideStackSplit.test.ts` | Layout split calculations. | Runtime data. | Low. | None for runtime cutover. |
| `frontend/src/features/chart/chartDataKey.test.ts` | Chart data key behavior if still present. | Current `chartViewModel.seriesKey` full contract. | Medium. | Confirm whether obsolete after model contract. |

Important current gaps:

- No dedicated test that `WorkbenchContext.tsx` no longer imports old chart runtime helpers after cutover.
- No single-owner violation test that fails on duplicate market/trace fetch for identical keys when old and new paths are both wired.
- Limited real `ChartPanel` + Lightweight Charts integration coverage; most renderer contract is tested by helper units and provider tests.
- No explicit public API contract test for a minimal `ChartRuntimeOutput` replacing the broad `WorkbenchChartState`.
