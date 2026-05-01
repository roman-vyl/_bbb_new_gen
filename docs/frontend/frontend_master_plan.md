# Frontend — Master Plan

## Goal

Frontend is a separate read/view layer for observing research runs, strategy instances, metrics, and later backtest results.

It is not Data Engine.
It is not Strategy Constructor.
It is not an execution layer.

Main boundary:

```text
Data Engine provides clean data.
Research layer creates strategy instances and result artifacts.
Frontend displays prepared information via API/read layer.
```

## What Frontend Must Not Do Initially

- Do not launch live trading.
- Do not send orders.
- Do not modify Data Engine directly.
- Do not build strategy logic inside UI.
- Do not become a visual constructor at the first stage.
- Do not edit arbitrary strategy configs.
- Do not bypass research-layer validation.

## Proposed Architecture

```text
research/results/*.json
        ↓
read-only API layer
        ↓
frontend dashboard
```

API layer can be a separate preparatory step.

Frontend reads prepared results and does not compute backtests itself.

## Step 1 — Read-only Research API Preparation

The first frontend stage is not UI, but preparation of API/read layer.

Purpose:

- Give frontend stable read-only access to research results.
- Read structured artifacts from `research/results`.
- Do not launch backtests from API.
- Do not modify `StrategyConfig`.
- Do not write to Data Engine.

Minimum future endpoints (direction):

- `GET /api/research/runs`
- `GET /api/research/runs/latest`
- `GET /api/research/runs/{run_id}`

Fields API should provide:

- `run_id`
- `timestamp`
- `family`
- `symbol`
- `timeframe`
- `variants`
- `config_id`
- `feature_profile`
- `component_ids`
- `trade_management_profile`
- `trades`
- `sharpe`
- `profit_factor`
- `max_drawdown`

Important:

- This is read-only API.
- API does not execute backtests.
- API does not modify configs.
- API does not handle exchange execution.

## Step 2 — Research Dashboard

The second stage is a simple dashboard.

Purpose:

- Show latest research runs.
- Show variants comparison table.
- Show metrics.
- Show which components/profile/trade_management_profile formed the selected strategy instance.

Minimum screen:

- Run summary
- Variants comparison table
- Selected strategy instance details
- Metrics: trades, Sharpe, PF, MaxDD

At this stage:

- No strategy editing.
- No backtest launch from UI.
- No visual constructor.
- No drag-and-drop components.
- Read-only viewing only.

## Later Stages

### Step 3 — Run Comparison

Compare multiple research runs.

### Step 4 — Launch Predefined Research Runs

UI can launch only pre-approved predefined variants/profiles.

### Step 5 — Controlled Parameter Forms

UI can modify only whitelist parameters after backend validation.

### Step 6 — Visual Strategy Constructor

Deferred stage. Canvas/blocks/graph UI is possible only after stable `StrategySpec` and validation layer are in place.

## Guardrails

- Frontend reads prepared state.
- Research owns strategy construction and backtest.
- Data Engine owns clean market data.
- No live execution from frontend.
- No visual constructor before stable `StrategySpec`.
