# Pipeline debug

Диагностика пайплайна с сохранением логов в **`debug/reports/`**.

## Python (research backtest + signal trace)

Двойной клик или из корня репозитория:

```bat
debug\run-pipeline-debug.bat
```

Требуется Python с `pip install -e ".[research]"` и SQLite со свечами.

| Файл | Описание |
|------|----------|
| `reports/pipeline_YYYYMMDD_HHMMSS.log` | Полный stdout/stderr прогона |
| `reports/pipeline-latest.log` | Копия последнего прогона |

## Workbench (frontend in-browser pipeline)

```bat
debug\run-workbench-pipeline-debug.bat
```

*(Добавляется в change `frontend-pipeline-debug-v2`.)*

Запускает Playwright-сценарии с `VITE_EMA_PIPELINE_DEBUG=true`, пишет результат на диск:

| Файл | Описание |
|------|----------|
| `reports/workbench_YYYYMMDD_HHMMSS.log` | Console `[pipeline]` + таблицы по сценариям |
| `reports/workbench-latest.log` | Копия последнего прогона |
| `reports/workbench_<scenario>_*.txt` | Опционально: отдельный excerpt на сценарий |

Dev-сервер Vite должен быть доступен (bat может поднять его с флагом debug или проверить, что флаг уже выставлен).

## Общее

- Папка **`debug/reports/`** — только debug-артефакты. Это **не** JSON backtest reports из `research/results/runs/` и **не** вкладка Reports в UI.
- В Python-логе ищите `=== PIPELINE_DEBUG [bff.backtest] ===`; строки **`REPEAT`** — повтор шага в одном прогоне.
- В Workbench-логе фильтруйте `[pipeline]` и блоки `=== PIPELINE_DEBUG [workbench] ===`.

## Переменные

| Переменная | Слой |
|------------|------|
| `EMA_PIPELINE_DEBUG=1` | Python (выставляет `run-pipeline-debug.bat`) |
| `VITE_EMA_PIPELINE_DEBUG=true` | Frontend (Vite при старте dev / bat runner) |

Подробнее: [`research/diagnostics/README.md`](../research/diagnostics/README.md).
