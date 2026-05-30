# Pipeline debug

Запуск диагностики пайплайна (config → backtest → signal trace) с сохранением лога в эту папку.

## Запуск

Двойной клик или из корня репозитория:

```bat
debug\run-pipeline-debug.bat
```

Требуется Python с установленным пакетом research (`pip install -e ".[research]"`) и доступная SQLite с свечами (как для обычного backtest).

## Отчёты

| Файл | Описание |
|------|----------|
| `reports/pipeline_YYYYMMDD_HHMMSS.log` | Полный stdout/stderr прогона |
| `reports/pipeline-latest.log` | Копия последнего прогона |

В логе ищите блоки `=== PIPELINE_DEBUG [bff.backtest] ===` — строки с префиксом **`REPEAT`** означают повтор шага внутри одного прогона.

## Переменные

- `EMA_PIPELINE_DEBUG=1` — выставляется bat-файлом автоматически.

Подробнее: [`research/diagnostics/README.md`](../research/diagnostics/README.md).
