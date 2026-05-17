# Research Workbench — план внедрения

Документ детализирует внедрение по мастер-плану:
[`frontend_master_plan_alternative_chart_composer_reports.md`](frontend_master_plan_alternative_chart_composer_reports.md).

Осторожная линия (read-only dashboard) — в [`frontend_master_plan.md`](frontend_master_plan.md).
При расхождении трактовок выбирайте активную линию для спринтов.

---

## Цель

Вертикальные срезы **фазы 0 → 4**: fixture → API → реальные отчёты → свечи → Composer → backtest.
Граница: `Workbench (browser) → research_api/ (BFF) → research | data read`.

**Запрещено:** Workbench → Python / SQLite / прямое редактирование `research/`.

---

## Текущее состояние репозитория

| Компонент | Статус |
|-----------|--------|
| `frontend/` | нет |
| `research_api/` | нет |
| `research/results/*.json` | каталог есть; артефакты для dev — после локального прогона |
| JSON report schema v3 + `exit_reason` | есть в research (`results.py`, Step 16) |
| `pyproject.toml` extra `workbench-api` | нет |
| Data Engine `Candle` | есть — основа для `ChartBar` |

---

## Целевая архитектура

```text
Workbench (React/Vite)
    ↓ HTTP (contracts)
research_api/ (FastAPI BFF)
    ↓                    ↓
research layer      data_engine read (candles)
```

### Guardrails (кратко)

**Workbench:** только API; draft config до validate; не считает EMA/metrics; не пишет YAML в repo.

**research_api:** не меняет схему Data Engine; backtest = research run; validate/save делегируют в research.

---

## Сквозные работы (до и между фазами)

### Репозиторий и CI

- `frontend/` — Vite + React + TS, alias `@` → `src/`.
- `research_api/` — top-level пакет (расширить `pyproject` packages: `research_api*`).
- Optional extra: `workbench-api = ["fastapi", "uvicorn"]`.
- CI: `npm run build` (фаза 0+); BFF pytest: `pip install -e ".[dev,workbench-api]"` && `pytest tests/test_research_api_runs.py tests/test_research_api_market.py -q`.

### Contracts-first

1. Pydantic: `research_api/contracts/` (`chart.py`, `runs.py`, `config.py`, `catalog.py`).
2. Routers: `research_api/routers/`.
3. Зеркало: `frontend/src/api/types.ts` (MVP вручную).
4. `frontend/src/api/client.ts` — с фазы 1.

UI читает `report_schema_version` из payload; неподдерживаемая версия — явная ошибка (ориентир: **v3**).

### Dev-данные

- Локальный прогон: `research/strategies/ema_pullback/run.py --config ...` → `latest.json`, `runs/<run_id>.json`.
- Фаза 0: `frontend/src/fixtures/` (`candles.json`, `report.json`, `config_draft.json`).

### Зависимости от research

| Зависимость | Workbench |
|-------------|-----------|
| Step 16 `exit_reason` | фильтры Reports |
| Step 14 external config | validate/save в фазе 3–4 |
| Component catalog (stub OK) | GET catalog в фазе 3 |

---

## Фаза 0 — App Shell + fixtures

**Цель:** 3 вкладки, график на фикстурах. **Без** `research_api`, Data Engine, backtest.

### Структура

```text
frontend/
  src/
    features/chart/
    features/composer/
    features/reports/
    shared/          # layout, context bar, tabs
    api/types.ts
    fixtures/
  package.json
  vite.config.ts
```

### Задачи

| # | Задача |
|---|--------|
| 0.1 | Scaffold Vite/React/TS, scripts `dev`, `build`, `preview` |
| 0.2 | Shared layout: context bar (`BTCUSDT`, `5m`, run, instance) |
| 0.3 | Вкладки Chart \| Strategy Composer \| Reports |
| 0.4 | Fixtures по форме будущих contracts |
| 0.5 | Chart: Lightweight Charts, OHLC, фиктивные entry/exit markers |
| 0.6 | Reports: таблица сделок; click → highlight на Chart |
| 0.7 | Composer: draft state → JSON preview (не YAML в repo) |
| 0.8 | Типы только в `api/types.ts` |
| 0.9 | Update root `.gitignore`: `frontend/node_modules/`, `frontend/dist/`, `frontend/.vite/` |

### DoD

- [ ] `npm run build` проходит
- [ ] Chart: свечи + markers
- [ ] Reports: таблица + click → chart focus
- [ ] Composer: draft → JSON preview
- [ ] Context bar на всех вкладках
- [ ] `.gitignore` игнорирует `frontend/node_modules/`, `frontend/dist/`, `frontend/.vite/` (после `npm install` / `npm run build` — чистый `git status`)

**Оценка:** ~1 спринт.

---

## Фаза 1 — Reports + real JSON

**Цель:** `research/results/*.json` через BFF. Candles могут оставаться fixture/stub.

### API

| Method | Path |
|--------|------|
| GET | `/api/research/runs` |
| GET | `/api/research/runs/latest` |
| GET | `/api/research/runs/{run_id}` |

### Backend

| # | Задача |
|---|--------|
| 1.1 | FastAPI: `main.py`, CORS, `/health` |
| 1.2 | `contracts/runs.py`: `RunSummary`, `RunReport`, trade overlay |
| 1.3 | Чтение `research/results/`, mapping в contracts |
| 1.4 | Whitelist `report_schema_version` (напр. `[3]`) |
| 1.5 | Trade → overlay fields для Chart |

### Frontend

| # | Задача |
|---|--------|
| 1.6 | `api/client.ts`, выбор run в context bar |
| 1.7 | Reports: summary, variants, trade table |
| 1.8 | Фильтры `exit_reason`: `open`, `unknown`, `stop_loss:*`, `take_profit:*`, `signal:*` |
| 1.9 | Chart: markers из JSON |
| 1.10 | **Banner** (пока нет market API): `Report loaded. Candles are fixture/stub until market API is connected.` |
| 1.11 | Если `entry_time_ms` вне диапазона stub candles — предупреждение |

### DoD

- [ ] Один реальный run end-to-end
- [ ] Фильтры exit_reason
- [ ] Banner виден на Chart
- [ ] Неподдерживаемая schema version → ошибка в UI

**Предусловие:** хотя бы один JSON-артефакт после локального прогона.

**Оценка:** ~1–1.5 спринта.

---

## Фаза 2 — Candles + Indicators API

**Цель:** реальные свечи и EMA; **снять** banner фазы 1.

### API

| Method | Path |
|--------|------|
| GET | `/api/market/candles?symbol=BTCUSDT&timeframe=5m&from=&to=` |
| GET | `/api/market/indicators/ema?symbol=...&timeframe=...&period=...` |

### Задачи

| # | Задача |
|---|--------|
| 2.1 | `contracts/chart.py`: `ChartBar` (`time` из `Candle.open_time_ms` — зафиксировать единицы) |
| 2.2 | Candles: read-only адаптер к Data Engine (store / существующий read-слой); **имя внутреннего метода в плане не фиксировать** — при реализации взять актуальный public API репозитория |
| 2.3 | EMA на сервере (не в браузере) |
| 2.4 | Chart: OHLC + EMA с API |
| 2.5 | Убрать fixture banner |
| 2.6 | Предупреждение: TF отчёта ≠ TF графика |
| 2.7 | Trade click → focus сохранён |

### DoD

- [ ] OHLC + EMA с API
- [ ] Banner stub снят
- [ ] TF mismatch warning
- [ ] Reports ↔ Chart не сломаны

**Оценка:** ~1 спринт.

---

## Фаза 3 — Component Catalog + Composer

**Цель:** schema-driven Composer; validate → serialize preview → save. **Без** backtest.

### API

| Method | Path |
|--------|------|
| GET | `/api/research/component-catalog` |
| POST | `/api/research/config/validate` |
| POST | `/api/research/config/serialize` |
| POST | `/api/research/config/save` |

### Задачи

| # | Задача |
|---|--------|
| 3.1 | `contracts/config.py`, `catalog.py` |
| 3.2 | Catalog: stub или registry |
| 3.3 | Validate → `research/experiments/config_loader` |
| 3.4 | Serialize — preview без записи |
| 3.5 | Save — только server-side после `ok` |
| 3.6 | UI: instances +/-, sections, params from `params_schema` |
| 3.7 | Validate errors у блоков; Save disabled until ok |
| 3.8 | Draft JSON + serialize preview (YAML tab опционально) |

### DoD

- [ ] `+ instance` / duplicate / delete; sections; components
- [ ] Validate → errors; Save только через API
- [ ] Backtest в UI **нет**

**Оценка:** ~2–3 спринта.

---

## Фаза 4 — Run Backtest from UI

**Цель:** прогон после validate; новый run в Reports + Chart.

### API

| Method | Path |
|--------|------|
| POST | `/api/research/backtests` |
| GET | `/api/research/runs/{run_id}` |

Позже (не в первом заходе): `GET /api/research/backtests/{job_id}`.

### Задачи

| # | Задача |
|---|--------|
| 4.1 | Sync POST: subprocess / in-process runner |
| 4.2 | Только после успешного validate (server-side) |
| 4.3 | UI: Run backtest, loading, auto-select new run |
| 4.4 | Без Celery, Redis, WebSocket на первом заходе |

### DoD

- [ ] Backtest только после validate
- [ ] Новый артефакт виден в Reports + Chart

**Оценка:** ~1–1.5 спринта.

---

## Сводка фаз

| Фаза | Срез | API | Спринты (оценка) |
|------|------|-----|------------------|
| 0 | 3 вкладки + fixtures | — | 1 |
| 1 | Real reports + trade↔chart | `GET /api/research/runs*` | 1–1.5 |
| 2 | Real candles + EMA | `GET /api/market/*` | 1 |
| 3 | Composer + validate/save | catalog, config | 2–3 |
| 4 | Backtest from UI | `POST /backtests` | 1–1.5 |
| **Итого** | | | **~6–8** |

---

## Рекомендуемый порядок спринтов

```text
Спринт 1:  фаза 0 целиком
Спринт 2:  research_api skeleton + runs (фаза 1 backend)
Спринт 3:  фаза 1 frontend (Reports, banner, filters)
Спринт 4:  фаза 2 market API + Chart
Спринт 5–6: фаза 3 catalog + validate + Composer
Спринт 7:  фаза 3 save + polish
Спринт 8:  фаза 4 backtest sync
```

**Не начинать следующую фазу**, пока не закрыт DoD предыдущей.
**Не параллелить** полноценный Composer и market API в одном «полуготовом» релизе.

---

## MVP — критерии готовности

1. Выбор run → variants, metrics, trades.
2. Клик по сделке → highlight на графике BTCUSDT 5m.
3. Фильтры по `exit_reason`.
4. Draft в Composer → validate → save (без ручного YAML в repo).
5. Backtest из UI → новый run в том же интерфейсе.

---

## Опционально: чеклисты по фазам

При необходимости спринтов — отдельные файлы:

`frontend_master_plan_alternative_chart_composer_reports_phase_N.md` (N = 0…4).

См. конец мастер-плана.
