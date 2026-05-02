# ema_pullback

Research strategy family: EMA fast/slow crossover baseline with an explicit
direction → blockers → setup → trigger → exits → risk pipeline, manual variants,
and JSON run artifacts.

## Layout

| Path | Role |
|------|------|
| `config.py` | Frozen `StrategyConfig`, defaults, deterministic `config_id` |
| `variants.py` | Manual `StrategyInstance` list for multi-variant runs |
| `run.py` | Entrypoint: DB → features → signals → vectorbt → stdout + JSON |
| `instance.py` | Config + derived `config_id` |
| `features/calculations.py` | OHLCV → EMA / ATR-prepared columns |
| `features/profile.py` | Family-local feature profiles and relations |
| `components/*.py` | Pipeline stages + `registry.py` (static component map) |
| `execution/signals.py` | Composer: resolved components → entry/exit series |
| `execution/trade_management.py` | SL/TP profiles for `Portfolio.from_signals` |
| `execution/results.py` | Run payload, `latest.json` / `runs/<run_id>.json` |

## Run

From repo root (with research extras, e.g. `pip install -e ".[research]"`):

```bash
python research/strategies/ema_pullback/run.py
```

CLI flags match the historical EMA smoke (`--symbol`, `--tf`, `--db-path`, fees, etc.).

## JSON report

Multi-variant runs write:

- `research/results/latest.json` — last run (overwritten)
- `research/results/runs/<run_id>.json` — same payload, named by `run_id`

`run.py` prints `results_artifact=` and `run_artifact=` paths on success.
