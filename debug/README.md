# Pipeline debug

Артефакты — в **`debug/reports/`**.

## Python (research backtest + signal trace)

```bat
debug\run-pipeline-debug.bat
```

→ `reports/pipeline_*.log` (автоматически).

---

## Workbench (frontend) — модель по слоям

### Слой 1 — Frontend debug module

`frontend/src/shared/diagnostics/pipelineDebug.ts`

| API | Назначение |
|-----|------------|
| `dbgMark` | мгновенная отметка (policy, pan decision, cache hit) |
| `dbgTimed` | async span (API fetch) |
| `dbgTimedSync` | sync span (slice, setData, markers) |
| `dbgFlush` | таблица в console |
| `dbgExport` | JSON-строки для сохранения |
| `dbgReset` | сброс счётчиков перед сценарием |

Включение (один из вариантов):

- **`scripts\dev-workbench-debug-mode.bat`** — как `dev-workbench.bat`, но Vite с `VITE_EMA_PIPELINE_DEBUG=true` (рекомендуется)
- или `VITE_EMA_PIPELINE_DEBUG=true` в `frontend/.env.local` + restart Vite

Без флага — **no-op** (нет `performance.now()`, console, meta).

Хуки только в **WorkbenchContext** / **ChartPanel** (call-site), не в pure utils.

Window hooks (dev only): `__pipelineDebugFlush`, `__pipelineDebugExport`, `__pipelineDebugReset`, `__pipelineDebugHelp` (FAQ в консоли).

---

### Запуск стека

```bat
scripts\dev-workbench-debug-mode.bat
```

BFF `:8000` + Vite `:5173` в отдельных окнах (как `dev-workbench.bat`). Остановка: `scripts\stop-workbench.bat`.

---

### Слой 2 — Browser console (основной UI)

Пользователь сам выполняет сценарий в Workbench, затем:

```js
window.__pipelineDebugReset()              // опционально, перед сценарием

// … UI: select trade, pan safe, pan shift, pan back to cached trace …

window.__pipelineDebugFlush("scenario-name")
```

В консоли — группа `=== PIPELINE_DEBUG [scenario-name] ===` и таблица:

```
step                         count  total_ms  avg_ms  max_ms  last_meta
chart.setData.candles            1     180.0   180.0   180.0  { barCount: 50000 }
wb.trace_display.cache_hit       1       0.2     0.2     0.2  { windowKey: "…" }
chart.markers.rebuild            2      35.0    17.5    22.0  { tradeMarkerCount: 3, … }
```

По ходу сценария — отдельные строки `[pipeline]` (фильтр в DevTools).  
При загрузке страницы в консоли появляется свёрнутый блок **FAQ**; снова: `__pipelineDebugHelp()`.

Примеры имён сценариев:

| `scenario-name` | Действие |
|-----------------|----------|
| `select-trade` | выбор trade |
| `pan-safe-zone` | pan без `wb.render_window.shift` |
| `pan-window-shift` | pan с `wb.render_window.shift` |
| `pan-cached-trace` | pan обратно в зону с display cache hit |
| `load-chart` | run → Chart, свечи готовы |

---

### Слой 3 — Экспорт вручную

```js
copy(JSON.stringify(window.__pipelineDebugExport(), null, 2))
```

Сохранить вставку в файл, например:

- `debug/reports/workbench-select-trade.json`
- `debug/reports/workbench-pan-window-shift.json`

**Автоматической записи в файл нет** — только ручное сохранение из буфера.

`dbgExport()` возвращает массив `{ step, count, total_ms, avg_ms, max_ms, last_meta? }`.

---

## Справка: step ids

| step | Слой |
|------|------|
| `api.fetchRunReport` / `api.fetchChartMarketBundle` / `api.fetchSignalTrace` | network |
| `wb.load.*` / `wb.render_window.*` / `wb.chart_window_slice` | WorkbenchContext |
| `wb.trace_display.*` / `wb.pan.*` | cache / pan policy |
| `chart.setData.*` / `chart.markers.*` / `chart.viewport.*` | ChartPanel |

---

## Общее

- `debug/reports/` ≠ `research/results/runs/*.json`.
- Python: `=== PIPELINE_DEBUG [bff.backtest] ===`, **`REPEAT`** = повтор в одном прогоне.

[`research/diagnostics/README.md`](../research/diagnostics/README.md)
