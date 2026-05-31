# Pipeline debug

Диагностика пайплайна с сохранением логов в **`debug/reports/`**.

## Python (research backtest + signal trace)

```bat
debug\run-pipeline-debug.bat
```

Требуется Python с `pip install -e ".[research]"` и SQLite со свечами. Bat сам запускает `run_pipeline_debug.py`.

| Файл | Описание |
|------|----------|
| `reports/pipeline_YYYYMMDD_HHMMSS.log` | Полный stdout/stderr |
| `reports/pipeline-latest.log` | Копия последнего прогона |

## Workbench (frontend in-browser pipeline)

```bat
debug\run-workbench-pipeline-debug.bat
```

**Bat не поднимает `npm run dev` и не трогает ваш стек.** Только Playwright против уже запущенного Workbench.

### Что должно быть запущено у вас

1. **Frontend (Vite)** — как вы обычно (порт `5173` или `5174`).
2. **BFF / Research API** — `http://127.0.0.1:8000` (проверка `GET /health`).
3. **Debug-флаг при старте Vite** — в `frontend/.env.local`:

   ```
   VITE_EMA_PIPELINE_DEBUG=true
   ```

   После изменения `.env.local` **перезапустите Vite** (флаг вшивается при старте dev-сервера).

### Порты

| Переменная | Назначение |
|------------|------------|
| `WORKBENCH_URL` | Явный URL фронта, напр. `http://127.0.0.1:5174` |
| `RESEARCH_API_URL` | BFF, по умолчанию `http://127.0.0.1:8000` |

Без `WORKBENCH_URL` bat ищет ответ на `:5173`, затем `:5174`.

**Почему «висит» на Running Playwright:** тест ждёт полный market bundle на Chart (часто **1–3 мин**). Прогресс виден в окне cmd после обновления bat (Tee-Object). Альтернатива без Playwright — ручной `__pipelineDebugFlush()` в DevTools (см. ниже).

### Результаты

| Файл | Описание |
|------|----------|
| `reports/workbench_YYYYMMDD_HHMMSS.log` | Playwright + `[pipeline]` |
| `reports/workbench-latest.log` | Последний прогон |
| `reports/workbench_<scenario>_*.txt` | Excerpt по сценарию |

## Общее

- **`debug/reports/`** — только debug-артефакты, не `research/results/runs/*.json` и не вкладка Reports в UI.
- Python-лог: `=== PIPELINE_DEBUG [bff.backtest] ===`; **`REPEAT`** — повтор шага.
- Workbench-лог: `[pipeline]`, `=== PIPELINE_DEBUG [workbench] ===`.

Подробнее: [`research/diagnostics/README.md`](../research/diagnostics/README.md).
