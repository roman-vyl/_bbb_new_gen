# Research Workbench — мастер-план (Chart · Composer · Reports)

Этот документ — **вторая линия планирования** рядом с осторожным планом в [`frontend_master_plan.md`](frontend_master_plan.md).  
Тот файл **не заменяется**: при расхождении трактовок смотрите оба плана и выберите активную линию для спринтов.

**Research Workbench** — рабочее место исследователя (не frontend-витрина и не «страничка»). Четыре зоны продукта: **Chart**, **Strategy Composer**, **Reports**, плюс выбор прогона в **context bar** (отдельной вкладки Runs нет).

---

## Цель

Сразу строить **вертикальные срезы** от fixture к API: свечной график, schema-driven композер **draft config**, просмотр JSON-отчётов с оверлеями сделок на графике. BFF (`research_api/`) и contracts **фиксируют границу**; UI не лезет в research Python, файлы и Data Engine напрямую.

```text
Data Engine отдаёт чистые данные (read).
Research создаёт экземпляры стратегий, валидирует конфиги и артефакты результатов.
Research Workbench показывает данные и редактирует только draft config до валидации на бэкенде;
исполнение бэктеста и каноническое состояние — на стороне research.
```

Граница вызовов:

```text
Workbench (browser) → research_api/ (FastAPI BFF) → research layer | data read adapter

Запрещено: Workbench → import Python / SQLite / прямое редактирование research/
```

---

## Принцип планирования

- **Вертикальные срезы (фазы 0–5)**: одна фаза = один релизопригодный сценарий + минимальный API-slice. Следующая фаза **не начинается**, пока не закрыт DoD предыдущей. Не строить параллельные «дорожки» из полуготовых подсистем.
- **Схема важнее формы API**: экраны и сериализация привязаны к **OpenAPI / JSON Schema**; эндпоинты догоняют по фазам.
- **Конфиг из UI = draft** до `POST /validate`; persist и backtest — только после `ok` на бэкенде.
- График и оверлеи сделок **не откладываются** «на потом» (фаза 0 — fixtures с маркерами).

Сквозные **опоры** (ниже) задают направление; **реализация идёт по фазам 0–5**, не параллельно по трём столбцам.

---

## UI: вкладки и context bar

### Три вкладки (с фазы 0)

| Вкладка | Содержание |
|---------|------------|
| **Chart** | Свечи, EMA overlays (фаза 2), entry/exit markers, highlight сделки; **фаза 5:** Bar Inspector (клик по свече), signal timeline-ленты |
| **Strategy Composer** | Instances, sections, component slots, params, validate, draft JSON / serialize preview |
| **Reports** | Summary, variants, trade table, filters, selected trade details |

### Context bar (shared layout)

Всегда виден (верхний или левый):

- `symbol` — MVP: **BTCUSDT**
- `timeframe` — MVP: **5m** (минимальный execution/research TF; lower-TF policy отложена)
- `selected run`
- `selected strategy instance` (variant / instance)

### Структура кода (фаза 0)

Vite/React: всё приложение внутри `src/`; фичи — в `features/`, не в корне `frontend/`.

```text
frontend/
  src/
    features/
      chart/              # вкладка Chart, серия OHLC, markers
      composer/           # вкладка Strategy Composer, draft state
      reports/            # вкладка Reports, таблица сделок
    shared/               # layout, context bar, routing, UI primitives
    api/
      types.ts            # централизованные TS-типы (не в компонентах)
      client.ts           # fetch-обёртки — с фазы 1+
    fixtures/
      candles.json
      report.json
      config_draft.json   # draft JSON, не боевой YAML
  package.json
  vite.config.ts
  ...
```

Импорты: `@/features/chart`, `@/shared/...`, `@/api/types` (alias `@` → `src/` в Vite).

Технология графика: **Lightweight Charts** (TradingView) или эквивалент (OHLC, zoom, markers).

**Chart — фаза 5 (signal explanation):** per-bar trace entry-пайплайна (gates + internals компонентов); Bar Inspector + timeline под графиком. Данные с `GET /api/research/runs/{run_id}/signal-trace`, расчёт в research (не в браузере).

**Chart — позже:** SL/TP levels, entry/exit price lines на графике.

---

## `research_api/` — Backend-for-Frontend

Отдельный **top-level** пакет `research_api/` (не вложенный в `research/`): тонкий FastAPI-адаптер под экраны Workbench. Не Data Engine, не research core (runner, vectorbt, strategy families).

- **Стек**: FastAPI + Pydantic v2; OpenAPI/Swagger из коробки.
- **Зависимости**: optional extra в `pyproject.toml` (например `workbench-api`: `fastapi`, `uvicorn`).

### Префиксы API

| Префикс | Назначение |
|---------|------------|
| `/api/research/...` | Runs, reports, component catalog, config, backtests |
| `/api/market/...` | Candles, indicators (view models для Chart) |

### Contracts

```text
research_api/contracts/          # Pydantic — источник правды для HTTP
  chart.py                       # ChartBar, IndicatorPoint, TradeOverlay
  runs.py                        # RunSummary, RunReport
  config.py                      # StrategyConfigDraft, ValidationResult
  catalog.py                     # ComponentCatalog, ComponentSchema

frontend/src/api/types.ts        # TS-зеркало (MVP: вручную; цель: codegen из OpenAPI)
frontend/src/api/client.ts       # см. дерево в разделе «Структура кода»
```

**Mapping** (не дублировать домен):

| API model | Источник |
|-----------|----------|
| `ChartBar` | View-model поверх `data_engine.contracts.Candle` + правило `time` для графика |
| `RunReport`, trades | JSON-артефакты в `research/results/`; версия схемы — из поля **`report_schema_version`** в payload (не хардкодить в UI/plan). При неподдерживаемой версии — явная ошибка, не тихий парсинг |
| `StrategyConfigDraft` | UI draft; валидация делегируется research (`EmaPullbackStrategySpec` и др. — внутри research) |
| `ComponentCatalog` | Registry / component builders (stub допустим до Step 17) |

**Правило для реализации:** не объявлять типы Chart/Report/Config внутри React-компонентов.

---

## Draft config (Composer)

Composer **не редактирует боевой** experiment YAML в репозитории. Рабочая сущность UI — **draft config** (`StrategyConfigDraft`).

### Канонический поток

```text
UI draft state
  ↓
POST /api/research/config/validate  →  ValidationResult
  ↓ (если ok)
POST /api/research/config/save      →  research/experiments/...  (только server)
  и/или
POST /api/research/backtests        →  research run (фаза 4)
```

| Endpoint | Назначение |
|----------|------------|
| `POST .../config/validate` | Research проверяет draft |
| `POST .../config/serialize` | Draft → **preview** канонического YAML/JSON для UI; **без** записи на диск |
| `POST .../config/save` | После `ok`: persist канонического config — **только** `research_api` |

### Запрещено

- React **напрямую пишет YAML** в repo.
- React **сам решает**, что config валидный (client-side hints допустимы; истина — только ответ API).
- Composer как текстовый редактор production YAML.

---

## Guardrails

### Research Workbench (`frontend/`)

- Workbench **не импортирует** research Python logic.
- Workbench **не знает** vectorbt.
- Workbench **не считает** metrics (только из report/API).
- Workbench **не считает EMA** как canonical source (только отображает series с API).
- Workbench **не редактирует files** напрямую (ни YAML, ни JSON в `research/`).
- Workbench работает **только через API contracts** (`src/api/types.ts`, `src/api/client.ts`).
- Конфиг из UI = **draft** до `POST /validate`; save и backtest — после `ok` на бэкенде.
- Не запускает живую торговлю и не отправляет ордера.
- Не меняет Data Engine напрямую.
- Не считает бэктест на клиенте источником правды по метрикам.

### Research API (`research_api/`)

- Research API **не меняет** data_engine schema / operational store Data Engine.
- Research API **не запускает** live trading.
- Backtest из UI = **только research run** (`run.py` / runner), **не** exchange execution.
- Validate / save / backtest делегируют в research layer; HTTP handler без vectorbt и торговой логики.

### Фаза 4 (backtest)

- Без Celery, Redis, docker-compose, Postgres, WebSocket на первом заходе.
- Сначала **синхронный** `POST /backtests` → report; позже optional `job_id` + poll.
- Локально: subprocess / in-process runner; не enterprise-очередь.

---

## Сквозные опоры

### Опора 1 — Свечной график

- Контракт бара для UI: `{ time, open, high, low, close, volume? }` (`ChartBar`).
- MVP market: **BTCUSDT**, **5m**.
- EMA и прочие series — только с `/api/market/...`, не расчёт в браузере.

### Опора 2 — Strategy Composer

- Schema-driven формы из `component-catalog` (`params_schema`).
- Несколько instances: `+` / duplicate / delete; секции direction, setup, trigger, blockers, exits, risk; sides long / short / both.
- Drag-and-drop — опционально после стабилизации; не в DoD фазы 3.
- Риск: возможные переделки при эволюции `StrategySpec`; смягчение — `config_version` в draft + catalog из схемы.

### Опора 3 — Reports + график

- Источник: API (`research/results` через BFF); локальная загрузка `.json` — только dev-исключение.
- Фильтры `exit_reason` по [Step 16](../research/16_exit_reason_attribution_plan.md): `open`, `unknown`, `stop_loss:<id>`, `take_profit:<id>`, `signal:<id>`.
- Клик по сделке → focus/highlight на Chart.
- Расхождение TF отчёта и графика — предупреждение в UI.

---

## Фазы (вертикальные срезы)

### Фаза 0 — App Shell + fixtures

**Цель:** приложение открывается, **3 вкладки**, график живой на фикстурах.

**Без:** `research_api`, Data Engine, backtest.

**DoD:**

- [ ] `npm run build` проходит
- [ ] Chart: свечи из fixture; фиктивные entry/exit markers
- [ ] Reports: таблица фиктивных сделок
- [ ] Composer: **draft config** → JSON preview (не YAML в repo)
- [ ] Click trade → marker focus на Chart

---

### Фаза 1 — Reports + real JSON

**Цель:** реальные `research/results/*.json` через BFF; отчёт ↔ график.

**API:**

| Method | Path |
|--------|------|
| GET | `/api/research/runs` |
| GET | `/api/research/runs/latest` |
| GET | `/api/research/runs/{run_id}` |

**UI:** выбор run (context bar); summary; variants; trade table; exit_reason filters; click trade → chart focus.

**Candles на фазе 1 (допустимо, но явно):** до фазы 2 Chart может оставаться на **fixture/stub candles**, если бары покрывают `entry_time_ms` сделок; иначе — минимальный overlap. Рассинхрон report vs candles **не замалчивать**.

**Обязательный banner в UI** (пока нет `/api/market/candles`):

```text
Report loaded. Candles are fixture/stub until market API is connected.
```

Banner виден на вкладке Chart (и при необходимости в context bar), пока источник свечей ≠ market API. Снять banner — критерий готовности **фазы 2**, не «тихо подменить данные».

**DoD:**

- [ ] один реальный run end-to-end; фильтры exit_reason; оверлеи сделок из JSON
- [ ] при fixture/stub candles — banner всегда отображается
- [ ] `report_schema_version` читается из ответа API; неподдерживаемая версия — сообщение пользователю

---

### Фаза 2 — Candles + Indicators API

**Цель:** реальные свечи и EMA на графике.

**API:**

| Method | Path |
|--------|------|
| GET | `/api/market/candles?symbol=BTCUSDT&timeframe=5m&from=&to=` |
| GET | `/api/market/indicators/ema?symbol=BTCUSDT&timeframe=5m&period=...` |

**DoD:** OHLC + EMA с сервера; связь Reports ↔ Chart сохранена; **banner fixture/stub снят**; предупреждение при расхождении TF отчёта и графика (отдельно от banner фазы 1).

---

### Фаза 3 — Component Catalog + Composer + draft pipeline

**Цель:** schema-driven Composer; draft → validate → serialize preview → save.

**API:**

| Method | Path |
|--------|------|
| GET | `/api/research/component-catalog` |
| POST | `/api/research/config/validate` |
| POST | `/api/research/config/serialize` |
| POST | `/api/research/config/save` |

**Пример элемента catalog** (не Python-классы):

```json
{
  "component_id": "ema_trend_filter",
  "role": "blocker",
  "label": "EMA trend filter",
  "params_schema": {
    "ema_period": { "type": "integer", "min": 1 },
    "timeframe": { "type": "string", "enum": ["5m", "15m", "1h"] }
  }
}
```

**DoD:**

- [ ] `+ instance` / duplicate / delete; sections; add/remove components; params from schema
- [ ] Draft JSON preview; serialize preview (опционально YAML tab) без записи в repo
- [ ] Validate → errors near block; Save disabled until `ok`; Save только через API
- [ ] Backtest — **не** в этой фазе

---

### Фаза 4 — Run Backtest from UI

**Цель:** запуск прогона из Workbench после validate.

**API:**

| Method | Path |
|--------|------|
| POST | `/api/research/backtests` |
| GET | `/api/research/backtests/{job_id}` (когда async) |
| GET | `/api/research/runs/{run_id}` |

**DoD:** backtest только после успешного validate; новый run в Reports + Chart.

**Не делать:** невалидированный draft; vectorbt в HTTP handler; Celery/Redis/… на первом заходе.

---

## Сводная таблица фаз

| Фаза | Пользовательский срез | API |
|------|----------------------|-----|
| **0** | 3 вкладки + fixtures | — |
| **1** | Real reports + trade↔chart | GET `/api/research/runs*` |
| **2** | Real candles + EMA | GET `/api/market/*` |
| **3** | Draft composer → validate → save | catalog, validate, serialize, save |
| **4** | Backtest from UI | POST backtests (+ optional job poll) |
| **5** | Signal explanation on Chart | GET `.../signal-trace` (Bar Inspector + timeline) |

Фаза 5 — естественное продолжение после цикла «прогнал → смотрю сделки на графике»: ответ на *почему* стратегия молчала или вошла на конкретном баре. Детали: [`implementation_plan.md`](implementation_plan.md) § Фаза 5.

---

## Когда выбирать какую линию

- **`frontend_master_plan.md`** — API-first, read-only дашборд, минимум расхождения со сменяющимся `StrategySpec`, мало переделок UI.
- **Этот документ (Research Workbench)** — вертикальные срезы: цикл «график → draft config → отчёт снова на графике»; `research_api/` + contracts; больше сопровождения схемы при эволюции модели.

Детальные чеклисты по фазам (опционально): `frontend_master_plan_alternative_chart_composer_reports_phase_N.md` — по одному файлу на фазу, когда понадобятся спринты.
