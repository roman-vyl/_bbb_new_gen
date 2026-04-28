# Phase 4 — Simple Research Smoke (phase card / заглушка)

> Короткая phase card. Расширить до детального ТЗ — только когда стартует Phase 4.
> **Это финальная фаза MVP** (см. `docs/00_master_plan.md`, секция «MVP Data Engine»).

## Цель

На очищенных свечах работает первый бэктест в `vectorbt` и выдаёт осмысленный backtest-результат. Данные доезжают до стратегии через чистый контракт, без NaN.

## Прикладной результат

Первая «большая победа» проекта: загрузили историю → починили дыры → прогнали первый бэктест. Это конец MVP.

## Зависимости

- Phase 3 (чистая БД свечей, `gaps_after=0`, OHLC валиден).

## Предварительное направление

- `research/ema_smoke.py` — самостоятельный скрипт, **не часть core engine**:
  - читает свечи через `Db.range_get(...)` (этот метод уже введён в Phase 2 вместе с `upsert`, см. `02_historical_backfill.md` — Phase 4 не вводит новых методов в `Db`);
  - считает EMA(20)/EMA(50) одной строчкой `pd.ewm(adjust=False)` **прямо внутри research-скрипта**;
  - собирает `vbt.Data`;
  - запускает простой EMA-cross бэктест;
  - печатает Sharpe / PF / max_dd.
- В `pyproject.toml` появляются `pandas`, `numpy`, `vectorbt` (как dev/research extras, не как core dependencies).
- В `data_engine/` ничего нового **не появляется**: ни `indicators/`, ни `adapters/vectorbt.py`. Это явный приём, который не даёт раньше времени застывать в неправильной архитектуре indicator-слоя.

## Открытые вопросы

- Точный набор метрик для печати (Sharpe + PF + max_dd?).
- Размер выборки для теста (вся история BTCUSDT/1h?).

## Что не делать раньше Phase 4

- Никаких `IIndicatorBatch`/`IIndicatorStream`/`IndicatorRegistry` — это Phase 5.
- Никакой записи индикаторов в SQLite — таблица `indicators` появляется в Phase 5 после ADR-002.
- Никакого `data_engine/adapters/vectorbt.py` — пока что vbt-сборка живёт прямо в research-скрипте. Полноценный адаптер — позже.
- Никакого выбора production indicator-библиотеки. Spike ADR-001 — это **Phase 5**, не Phase 4.

## Что точно не трогать в Phase 4

- Не вводить `data_engine/indicators/` в репозиторий «потому что скоро понадобится». До Phase 5 — чисто.
- Не сохранять посчитанную EMA в БД. EMA в Phase 4 — эфемерная, посчиталась в research-скрипте → ушла в `vbt.Data` → забылась.
- Не пытаться обобщать `ema_smoke.py` на «фреймворк для индикаторов в research». Это просто smoke-скрипт.

## Acceptance-критерии (общие, расшифровать в детальном ТЗ)

- `python research/ema_smoke.py` отрабатывает без исключений на полном диапазоне `BTCUSDT/1h`.
- В `vbt.Data` нет NaN ни в одной из колонок (предполагая `gaps=0` после Phase 3).
- Печатаются осмысленные не-NaN метрики бэктеста.
- В `data_engine/` ничего нового, кроме (опционально) добавления `pandas`/`vectorbt` в `pyproject.toml` как research-extras. **Тест-проверка**: дерево `data_engine/indicators/`, `data_engine/realtime/`, `data_engine/adapters/`, `data_engine/service/api.py` — отсутствуют.

## После Phase 4 — gate в Phase 5

К моменту, когда Phase 4 закрыта:
- видно, какие индикаторы реально нужны;
- видно, какие свойства данных работают, а какие надо доточить;
- видно, насколько острая боль с EMA-«одной строчкой» — этого достаточно для нескольких индикаторов или нет.

С этим знанием стартует ADR-001 spike (выбор indicator backend) и ADR-002 (схема таблицы `indicators`). До этого момента индикаторный слой лучше не трогать.

---

> При старте Phase 4 этот файл расширяется до детального ТЗ. Не раньше.
