# Exit Management v2 — high-level architecture and behavior

Date: 2026-06-08  
Status: master-plan (human-readable); implementation tracked in OpenSpec change `trade-exit-management-runtime-v2`  
Related: `docs/research/20_trade_exit_management_runtime_v1.md` (diagnostic foundation), `openspec/changes/trade-exit-management-runtime-v2/`

Документ нужен как «человеческое» объяснение, что мы строим в `trade-exit-management-runtime-v2`, зачем это нужно, где проходит граница ответственности между entry pipeline, execution layer, `exit_policy` и `exit_management`, и как это должно вести себя после Slice 4.

## 1. Главная идея

Мы не строим отдельный торговый движок внутри `exit_management`.

Целевая модель такая:

```text
entry pipeline
  → решает, где входить

execution / backtest layer
  → открывает сделку
  → держит сделку
  → каждый бар собирает кандидатов на выход
  → выбирает победивший выход
  → закрывает сделку

exit_policy
  → даёт старые/базовые выходы:
      initial SL
      initial TP
      signal exits
      HTF-context-gated exit profiles

exit_management
  → сопровождает уже открытую сделку
  → хранит фазу и managed-состояние
  → отдаёт managed candidates / snapshot / events
  → сам сделку не открывает и не закрывает
```

Коротко:

```text
execution layer — водитель
exit_management — state/candidate provider
exit_policy — initial/fallback exit layer
```

`exit_management` не знает, почему вход появился. Он не смотрит setup, blocker, trigger, direction. Он не читает `entries` / `short_entries` как владелец входа. Он получает уже открытую сделку и отвечает только за её сопровождение.

## 2. Почему v2 вообще нужен

В v1 / `diagnostic_only` мы могли видеть, что сделка дошла до фаз:

```text
proven
protected
runner
exhaustion
```

Но это ничего не меняло в реальной сделке. Сделка всё равно закрывалась старым `exit_policy`: initial SL / TP / signal exits.

v2 нужен, чтобы фаза сделки могла менять фактические выходы:

```text
protected
  → включить break-even / lock-profit stop

runner
  → убрать близкий initial TP
  → дать сделке жить дальше
  → ждать runner exit components

exhaustion
  → разрешить runtime exit
```

Но это должно быть сделано без смешивания слоёв ответственности.

## 3. Разделение ответственности

### 3.1 Entry pipeline

Entry pipeline остаётся старым владельцем входа.

Он считает:

```text
setup
blocker
trigger
direction
```

И на выходе даёт:

```text
entries
short_entries
```

`exit_management` не имеет права:

```text
- пересчитывать setup
- пересчитывать blockers
- пересчитывать triggers
- решать direction
- открывать позицию
```

### 3.2 Execution / backtest layer

Execution layer владеет жизненным циклом позиции:

```text
open
hold
close
```

Он делает:

```text
если позиции нет:
  открыть сделку по precomputed entry signal

если позиция есть:
  собрать exit_policy candidates
  спросить exit_management provider
  собрать managed candidates
  выбрать победивший выход
  закрыть сделку, если есть winner
  если не закрылась — обновить managed state на конец бара
```

Execution layer — единственное место, где применяется close decision.

### 3.3 exit_policy

`exit_policy` остаётся initial/fallback exit layer.

Он владеет:

```text
initial SL
initial TP
signal exits
HTF-context-gated exit profile selection
```

HTF context остаётся внутри `exit_policy`. `exit_management` не должен заново интерпретировать HTF context, выбирать HTF profile или дублировать profile switching.

### 3.4 exit_management

`exit_management` — provider для уже открытой сделки.

Он владеет:

```text
TradeRuntimeState
phase tracking
ActiveManagementSnapshot
stop_management evaluation
take_management evaluation
runtime_exits evaluation
managed events
managed exit candidates
```

Он не владеет:

```text
entry signal generation
opening trades
full position lifecycle
second portfolio
HTF profile switching
exit_policy mutation
```

## 4. Что такое snapshot

`ActiveManagementSnapshot` — это память managed-состояния сделки.

Условно:

```text
snapshot:
  phase = protected / runner / ...
  active_stop = ...
  active_take_profile = ...
  armed_runtime_exits = [...]
```

Snapshot отвечает на вопрос:

```text
что уже активно для этой сделки на начало текущего бара?
```

Очень важное правило:

```text
snapshot, вычисленный в конце бара N,
становится активным только с бара N+1
```

Это называется delayed activation.

## 5. Что такое candidates

Candidate — это не закрытие сделки.

Candidate — это заявка на возможный выход.

Пример candidate от `exit_policy`:

```text
layer = exit_policy
candidate_type = stop_loss
price = 94
reason = initial_stop_loss
```

Пример candidate от `exit_management`:

```text
layer = exit_management
candidate_type = managed_stop
component_id = break_even_stop
rule_id = BE AutoProtected
price = 100
reason = break_even_stop
```

Candidate означает:

```text
если на этом баре цена дошла до этого уровня / условия,
то это возможный выход
```

Но сделка закрывается только после того, как execution layer выбрал winner.

## 6. Как выглядит бар после Slice 4

На каждом баре N, если позиция уже открыта:

```text
1. Execution layer берёт состояние на начало бара:
   - open position
   - inherited snapshot from N-1
   - effective exit_policy candidates

2. Execution layer спрашивает exit_management provider:
   - какие managed candidates уже активны на начало бара?

3. Execution layer объединяет:
   - exit_policy candidates
   - exit_management candidates

4. ExitArbitrator выбирает winner, если на баре сработало несколько вариантов.

5. Если winner есть:
   - execution layer закрывает сделку
   - записывает attribution:
       exit_layer
       exit_rule_id
       exit_component_id

6. Если winner нет:
   - execution layer вызывает provider на end-of-bar update
   - provider обновляет MFE/MAE/bars_in_trade
   - provider пересчитывает phase
   - provider пересчитывает next snapshot
   - next snapshot effective from N+1
```

## 7. Почему delayed activation обязателен

OHLC-свеча не говорит, что было раньше внутри бара:

```text
open → high → low → close
```

или:

```text
open → low → high → close
```

Поэтому нельзя делать так:

```text
bar N:
  high дал protected
  значит включили BE
  low этого же бара задел BE
  закрыли по BE на этом же баре
```

Это lookahead.

Правильно:

```text
bar N:
  проверяем только те exits, которые были активны до начала bar N

конец bar N:
  увидели, что phase стала protected
  рассчитали BE
  BE effective_from_bar = N+1

bar N+1:
  если цена задела BE
  можно закрыть по BE
```

## 8. Как работает protected → BE

Пример:

```text
entry = 100
initial SL = 94
```

Сделка дошла до `protected`.

В конце бара N `exit_management` делает:

```text
phase = protected
active_stop = 100
rule_id = BE AutoProtected
component_id = break_even_stop
effective_from_bar = N+1
```

На баре N+1 execution layer видит:

```text
exit_policy:
  initial SL = 94
  initial TP = ...

exit_management:
  managed stop = 100
```

### Важный смысл

Initial SL не отключается.

Он остаётся fallback / emergency candidate.

Почему это нормально:

```text
managed BE stop ближе к цене
initial SL дальше
в нормальной ситуации managed stop сработает раньше
```

Если будет аномальная OHLC-ситуация или сильный гэп, initial SL всё ещё есть как аварийный слой.

Для stop-стороны логика такая:

```text
старый SL остаётся
managed stop добавляется поверх него
```

## 9. Same-bar priority

Если на одном баре сработало несколько candidates, нужен `same_bar_policy`.

В v1 priority:

```text
1. initial stop loss from exit_policy
2. managed active stop from exit_management
3. initial take profit from exit_policy
4. runtime exit from exit_management
5. signal exit from exit_policy
```

Пример:

```text
entry = 100
managed BE = 100
initial TP = 110

bar:
  low = 99
  high = 111
```

Формально задеты и BE, и TP. Поскольку OHLC не говорит, что было раньше, выбираем по policy. В этой policy managed stop выше TP, значит winner — managed stop.

Это консервативная модель. Она не идеальна как intrabar truth, но она стабильная, явная и тестируемая.

## 10. Как работает runner → disable initial TP

С TP логика не симметрична stop-логике.

Для stop:

```text
managed stop добавляется поверх initial SL
initial SL остаётся fallback
```

Для TP:

```text
initial TP может мешать runner-сделке жить
поэтому его надо отключить в candidate view
```

Пример:

```text
entry = 100
initial TP = 108
```

Сделка дошла до `runner`.

Если ничего не сделать, то на первом касании 108 сделка закроется, хотя мы хотели тянуть runner дальше.

Поэтому в конце бара N provider выставляет:

```text
active_take_profile = disable_initial_tp
rule_id = Runner Disable Initial TP
effective_from_bar = N+1
```

На баре N+1 execution layer собирает `exit_policy` candidates и видит:

```text
active_take_profile = disable_initial_tp
```

Поэтому он не добавляет initial TP candidate в текущий candidate view.

Важно:

```text
exit_policy config не мутируется
compiled masks не мутируются
initial TP не удаляется из стратегии навсегда
он просто suppressed в managed/execution candidate view,
пока active_take_profile = disable_initial_tp
```

## 11. Почему runner-компоненты не могут сами перекрыть initial TP

Это тонкий и важный момент.

Будущие runner-компоненты могут быть такими:

```text
1h overheat exit
EMA cross very fast exit
structure break
ADX/DI exhaustion
```

Они считаются каждый бар, но candidate дают только когда событие случилось.

Пример:

```text
bar 100:
  phase стала runner
  хотим дать сделке жить

bar 101:
  цена дошла до initial TP = 108

bar 120:
  EMA cross exit наконец появился
```

Если initial TP не выключить на bar 101, до bar 120 мы не доживём.

Поэтому runner-режим должен делать две разные вещи:

```text
A. сразу включить режим удержания:
   disable_initial_tp

B. ждать будущих runtime exit components:
   EMA cross
   overheat
   exhaustion
   structure break
```

`disable_initial_tp` — это не выход. Это режим удержания, который освобождает пространство для будущих выходов.

## 12. Что делать с signal exits

`disable_initial_tp` не должен автоматически отключать signal exits.

Почему:

```text
initial TP — близкий заранее заданный take-profit level
signal exit — выход по условию/индикатору/событию
```

Если в будущем окажется, что какие-то старые `exit_policy.signal_exit` тоже мешают runner, нужен отдельный механизм, например:

```text
suppress_exit_policy_signals:
  - rsi_exit_5m
  - old_ema_cross_exit
```

или более общий профиль:

```text
active_exit_policy_view:
  initial_tp: disabled
  signal_exits:
    rsi_exit_5m: disabled
    ema_cross_runner: enabled
```

Но в текущем v2 Slice 4 минимальная семантика такая:

```text
disable_initial_tp suppresses only initial exit_policy take-profit candidate
```

Он не отключает:

```text
initial SL
managed stops
runtime exits
signal exits
```

## 13. Runtime exits

Runtime exit — это managed exit, который становится возможным при определённом состоянии.

В текущем v2 минимальный компонент:

```text
phase_runtime_exit
```

Пример:

```json
{
  "rule_id": "exit_on_exhaustion",
  "component_id": "phase_runtime_exit",
  "activate_when": { "phase_at_least": "exhaustion" },
  "params": { "exit_price": "close" }
}
```

Смысл:

```text
когда phase стала exhaustion,
runtime exit становится armed
со следующего бара он может дать candidate на close
```

В будущем вместо простого phase_runtime_exit появятся более умные компоненты:

```text
EMA cross runner exit
RSI/ADX overheat exit
structure break exit
volume exhaustion exit
```

## 14. Protected и runner как разные режимы управления

### Protected

Цель:

```text
защитить сделку от превращения в минус
```

Действия:

```text
добавить managed stop:
  break_even_stop
  lock_profit_stop
```

Initial SL остаётся fallback.

### Runner

Цель:

```text
дать сильной сделке жить дольше
```

Действия:

```text
disable_initial_tp
поддерживать/progress managed stop
ждать runner runtime exits
```

То есть runner — это не один exit. Runner — это режим управления выходами.

## 15. Что будет первым proof после Slice 4

Минимальный end-to-end сценарий:

```text
1. Сделка открылась старым entry pipeline.

2. Сделка дошла до protected.

3. В конце бара provider включил break_even_stop:
   active_stop = entry
   effective_from_bar = N+1

4. На следующем баре цена вернулась к entry.

5. Execution layer получил managed stop candidate.

6. ExitArbitrator выбрал managed stop.

7. Execution layer закрыл сделку.

8. В trade attribution:
   exit_layer = exit_management
   exit_component_id = break_even_stop
   exit_rule_id = BE AutoProtected
```

Это докажет, что rules-driven architecture может менять исход сделки, но без нарушения границ ответственности.

## 16. Главное резюме

Самая короткая формула:

```text
exit_management не торгует.
exit_management сопровождает открытую сделку.
execution layer торгует.
```

Или чуть подробнее:

```text
entry pipeline решает, где входить
execution layer открывает и закрывает сделки
exit_policy даёт базовые выходы
exit_management даёт managed state и managed exit candidates
execution layer выбирает winner и применяет close
```

Кандидаты внутри `exit_management` — это:

```text
возможные управляемые выходы,
которые уже были активны на начало бара
и которые execution layer может выбрать для закрытия сделки
```

Snapshot внутри `exit_management` — это:

```text
текущая память сделки:
  phase
  active managed stop
  active take profile
  armed runtime exits
```

Protected-режим:

```text
добавляет защитный managed stop
initial SL остаётся fallback
```

Runner-режим:

```text
отключает initial TP в candidate view
оставляет защитные stops
ждёт будущих runtime exit events
```

Именно эта архитектура нужна, чтобы потом проверять настоящие торговые гипотезы:

```text
когда переводить сделку в runner
каким stop её сопровождать
какие exits ждать
когда runner умер
когда закрывать по exhaustion
```

Без второго trade path, без мутации `exit_policy`, без переноса входов внутрь `exit_management`.

---

## 17. Execution routing (принятое решение)

**Решение:** один behavior-changing managed path — только v2. Legacy BE combiner **удаляется** как runtime path. Общий `execution_combiner` **не** делаем (откат `e5724b1`).

### Path 1 — default (без behavior-changing managed rules)

```text
Условие:
  mode отсутствует / diagnostic_only / managed с пустыми management arrays

Путь:
  vectorbt Portfolio.from_signals + exit_policy

Роль:
  baseline, parity, diagnostic_only
```

### Path 2 — v2 managed (единственный behavior-changing path)

```text
Условие:
  mode=managed
  + непустые stop_management / take_management / runtime_exits

Путь:
  run_managed_execution_loop
  ManagedExitProvider + ExitCandidate + ExitArbitrator
  → _run_execution_integrated_strategy_spec

Владелец lifecycle:
  execution layer (open / hold / close)

Роль provider:
  exit_management — snapshot, candidates, events для уже открытой сделки
```

### Удалено / запрещено

```text
run_managed_bar_loop — нигде в production (не backtest, не signal_trace, не diagnostics)
has_exit_management_rules() как selector execution path
exit_management.always_on или profiles — любое наличие ключа (даже rules: [])
legacy authoring: break_even_stop_rule(trigger_r), exit_management(always_on/profiles) builders
execution_combiner / execution_adapters / adapter shim
автоматическая миграция старых JSON
```

**Presence-based rejection:** если в `exit_management` есть ключ `always_on` или `profiles` — ошибка, независимо от содержимого.

`exit_policy.always_on` / `profiles` — **не трогаем**.

Ошибка:

`Legacy exit_management shape is no longer supported; use mode=managed with stop_management/take_management/runtime_exits.`

**Миграция:** `diagnostic_only` и конфиги без legacy shape — без изменений. Старые BE JSON с `exit_management.always_on/profiles` — breaking, переписать вручную на v2 `stop_management`.

---

## 18. Sequencing (нормативно для v2 loop)

```text
1. position_was_open_at_bar_start
2. если открыта: bar-open candidates → ExitArbitrator → close
3. entry только если НЕ была открыта на начало бара
4. entry bar: позиция открылась на close бара N
   → НЕ вызывать update_end_of_bar_snapshot на баре N
   → первый provider end-of-bar update не раньше N+1
5. delayed activation: snapshot с конца N активен с N+1
```

Причина п.4: OHLC не даёт intrabar path до фактического close-entry.

---

## 19. Legacy BE vs v2 (историческая справка)

Step 18 R-trigger BE и v2 managed — **разные exit models**. v2 не встраивается в legacy loop.

| | Legacy BE (удалён) | v2 managed (остаётся) |
|---|---|---|
| Конфиг | `always_on`/`profiles`, `trigger_r` | `stop_management` + `phase_rules` |
| Stop | один `effective_stop` | initial SL + managed stop candidates |
| Close | inline classify | ExitArbitrator |
| Phase / take / runtime | нет | да |

Старые JSON переписываются на v2 `stop_management.break_even_stop` вручную — без auto-migration.

Детали задач: `openspec/changes/trade-exit-management-runtime-v2/tasks.md` Slice 4.5.
