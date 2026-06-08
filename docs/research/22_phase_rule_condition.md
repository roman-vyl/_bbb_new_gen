# Phase Rule Condition — ADX/DI Impulse

Date: 2026-06-08  
Status: research

---

## 1. Предпосылка

Сейчас у нас есть базовый способ переводить сделку в новые фазы управления через MFE/ATR от входа:

```text
сделка ушла на 1 ATR / 1R / 2R → phase = protected
сделка ушла на 4 ATR → phase = runner
```

Это полезный baseline, но он грубый. Он отвечает только на вопрос:

```text
цена достаточно далеко ушла от входа?
```

Но не отвечает на более важный торговый вопрос:

```text
движение было импульсным и подтверждённым направлением,
или цена просто медленно доползла до порога?
```

Для break-even stop это критично. Если сделка еле-еле доползла до 1R, перевод стопа в BE может быть случайным и преждевременным. А если после входа появился сильный направленный импульс на 5m, это уже другой контекст: вход как будто «подтвердился объёмом/движением», и точку входа логично начать защищать.

Отсюда идея:

```text
5m ADX/DI impulse → хороший кандидат для protected phase
```

То есть не сам stop двигается от ADX, а ADX/DI говорит:

```text
сделка получила импульс в нужную сторону,
теперь её можно перевести в protected,
а break_even_stop уже активируется от protected.
```

Для runner логика другая. Локальный 5m импульс защищает вход, но не обязательно говорит, что сделку надо тянуть. Для runner нам интереснее импульс на старшем таймфрейме:

```text
1h ADX/DI impulse → потенциальный режим продолжения,
можно рассматривать runner phase
```

То есть:

```text
5m ADX/DI → protected / BE protection
1h ADX/DI → runner / удержание / disable TP / runtime exits
```

Ключевая идея компонента: ADX показывает силу движения, DI показывает направление относительно стороны сделки.

```text
long:
  +DI > -DI

short:
  -DI > +DI
```

Сам ADX без DI не подходит, потому что ADX не знает направления. Он может быть высоким и против нашей позиции.

---

## 2. Роль компонента в архитектуре

Этот компонент не должен быть blocker.

Старый ADX blocker отвечал на вопрос:

```text
можно ли входить?
```

Новый компонент должен отвечать на другой вопрос:

```text
открытая сделка уже получила достаточное подтверждение,
чтобы поменять phase?
```

Поэтому его место — phase rule condition внутри exit_management, а не setup/blocker/trigger/stop component.

Правильная роль:

```text
phase_rule condition:
  adx_di_threshold
```

Он не открывает сделку.  
Он не закрывает сделку.  
Он не двигает stop напрямую.  
Он не включает/выключает TP напрямую.

Он только говорит:

```text
condition true → phase transition allowed
```

А дальше уже существующая v2-система делает своё:

```text
phase = protected
  → break_even_stop активируется через activate_when phase_at_least protected

phase = runner
  → take_profile_switch / disable_initial_tp активируется через activate_when phase_at_least runner
  → lock_profit_stop может активироваться через runner
  → runtime_exits могут активироваться через runner/exhaustion
```

То есть компонент должен встроиться в текущий rules-driven pipeline, а не создать новый путь управления сделкой.

---

## 3. Место в пайплайне

Целевой pipeline остаётся таким:

```text
entry pipeline
  → setup / blocker / trigger / direction
  → entries / short_entries

execution layer
  → открывает позицию
  → держит позицию
  → выбирает close candidate

exit_policy
  → даёт initial SL / initial TP / signal exits

exit_management
  → phase_rules
  → ActiveManagementSnapshot
  → managed stop / take profile / runtime exits
```

Новый компонент появляется вот здесь:

```text
opened trade
  → end-of-bar phase evaluation
  → phase_rules evaluate conditions
       MFE/ATR condition
       ADX/DI condition     ← новый компонент
  → phase transition event
  → snapshot effective from next bar
  → stop_management/take_management/runtime_exits react to phase
```

Важно сохранить уже утверждённую sequencing-семантику:

```text
на баре N condition стала true
→ phase transition рассчитывается на end-of-bar N
→ новый snapshot активен только с bar N+1
```

Нельзя:

```text
на баре N увидеть ADX/DI,
сразу включить protected,
и на этом же баре применить BE stop
```

Это снова был бы lookahead / intrabar ambiguity.

---

## 4. Семантика v1-компонента

Название условно:

```text
adx_di_threshold
```

Минимальная v1-семантика:

```text
condition true, если:
  latest available ADX на выбранном timeframe >= adx_threshold
  AND DI aligned with trade side
```

Для long:

```text
+DI > -DI
```

Для short:

```text
-DI > +DI
```

V1 специально простая:

```text
нет rolling max
нет crossed-above-threshold
нет ADX slope
нет peak detection
нет DI spread threshold
нет volume confirmation
нет «держалось N баров»
```

Только:

```text
на текущем доступном баре значение ADX/DI удовлетворяет условию
```

Это важно, потому что сначала надо проверить саму торговую гипотезу:

```text
работает ли ADX/DI как phase activation criterion?
```

А не сразу строить сложный ADX-фреймворк.

---

## 5. Пример целевого конфига

### Protected по 5m impulse

```json
{
  "rule_id": "protected_5m_adx_di_40",
  "to_phase": "protected",
  "condition": {
    "type": "adx_di_threshold",
    "timeframe": "base",
    "period": 14,
    "adx_threshold": 40,
    "require_di_alignment": true
  }
}
```

Дальше обычный stop management:

```json
{
  "rule_id": "be_at_protected",
  "component_id": "break_even_stop",
  "activate_when": {
    "phase_at_least": "protected"
  },
  "params": {
    "buffer_type": "none",
    "buffer": 0.0
  }
}
```

Смысл:

```text
если после входа на 5m появился сильный направленный импульс,
переводим сделку в protected,
после чего BE stop начинает защищать вход.
```

### Runner по 1h impulse

```json
{
  "rule_id": "runner_1h_adx_di_30",
  "to_phase": "runner",
  "condition": {
    "type": "adx_di_threshold",
    "timeframe": "1h",
    "period": 14,
    "adx_threshold": 30,
    "require_di_alignment": true
  }
}
```

Дальше take management:

```json
{
  "rule_id": "disable_initial_tp_at_runner",
  "component_id": "take_profile_switch",
  "activate_when": {
    "phase_at_least": "runner"
  },
  "params": {
    "action": "disable_initial_tp"
  }
}
```

Смысл:

```text
если на 1h появилась сила движения в сторону сделки,
это может быть признак режима протяжки,
поэтому можно отключать initial TP и дать сделке жить через runner management.
```

---

## 6. Изменения в контрактах

### 6.1 StrategySpec / backend config contract

Нужно расширить union `phase_rules[].condition`.

Сейчас есть MFE/ATR condition. Добавляется новый тип:

```json
{
  "type": "adx_di_threshold",
  "timeframe": "base",
  "period": 14,
  "adx_threshold": 40,
  "require_di_alignment": true
}
```

Минимальные поля:

```text
type: "adx_di_threshold"

timeframe:
  "base" или конкретный TF: "5m", "1h", "4h", "1d"

period:
  ADX period, например 14

adx_threshold:
  число > 0

require_di_alignment:
  boolean, default true
```

Можно подумать, нужен ли `di_mode`, но для v1 я бы не добавлял. `require_di_alignment: true` достаточно.

### 6.2 Feature planning contract

Phase rule condition должен объявлять feature dependency:

```text
ADX
+DI
-DI
```

на выбранном timeframe и period.

То есть feature planner должен понимать:

```text
phase_rule condition adx_di_threshold
→ нужны ADX/DI features
→ timeframe = condition.timeframe
→ period = condition.period
```

Важно:

```text
feature planning не должен быть завязан на blocker role
```

Если сейчас ADX/DI уже умеет планироваться для blocker, нельзя просто использовать blocker как owner. Нужно либо вынести общий ADX/DI feature request helper, либо добавить phase-rule-specific planning.

### 6.3 Runtime evaluation contract

Новый evaluator должен получать:

```text
trade side
current bar index/time
latest available ADX value
latest available +DI
latest available -DI
condition params
```

И возвращать:

```text
condition_met: bool
diagnostics/details
```

Side-aware logic:

```text
long:
  di_aligned = di_plus > di_minus

short:
  di_aligned = di_minus > di_plus
```

Condition:

```text
adx >= adx_threshold
AND (
  not require_di_alignment
  OR di_aligned
)
```

Если ADX/DI value unavailable / NaN:

```text
condition false
diagnostic reason = indicator_not_ready
```

### 6.4 Phase event/report contract

Новый компонент не требует нового event type.

Если condition сработал, уже существующий event должен быть достаточен:

```text
phase_changed
rule_id = protected_5m_adx_di_40
to_phase = protected
condition_type = adx_di_threshold
```

Полезно добавить diagnostics/details в event metadata, если текущий event contract это позволяет:

```json
{
  "adx": 42.1,
  "di_plus": 31.5,
  "di_minus": 18.2,
  "di_aligned": true,
  "timeframe": "5m",
  "period": 14,
  "threshold": 40
}
```

Но это не должно ломать существующий report contract. Если metadata уже есть — использовать. Если нет — можно оставить минимально.

### 6.5 Composer/catalog contract

Composer должен получить новый condition type в phase rule editor:

```text
condition type:
  ADX/DI threshold
```

Поля UI:

```text
timeframe
period
ADX threshold
require DI alignment
```

Важно:

```text
это editor phase_rules.condition,
не stop_management editor,
не blocker editor.
```

Composer не должен создавать старый ADX blocker.  
Composer не должен создавать legacy exit_management shape.  
Composer не должен напрямую двигать stop от ADX.

Он должен создать только:

```json
{
  "to_phase": "protected",
  "condition": {
    "type": "adx_di_threshold",
    ...
  }
}
```

А BE уже отдельным правилом:

```json
{
  "component_id": "break_even_stop",
  "activate_when": {
    "phase_at_least": "protected"
  }
}
```

---

## 7. Что не входит в v1

Чтобы не размазать scope, я бы явно запретил:

```text
- не адаптировать старый ADX blocker
- не делать новый blocker
- не делать ADX stop_management component
- не делать ADX runtime_exit
- не делать ADX take_management
- не делать rolling/lookback/peak/slope logic
- не делать DI spread threshold
- не делать volume confirmation
- не делать frontend chart overlay ADX
- не менять существующую ADX blocker semantics
```

Отдельно важно:

```text
старый ADX blocker не трогать, кроме возможного выноса общего feature helper,
если это реально нужно и безопасно.
```

---

## 8. Как это потом тестировать осмысленно

После реализации v1 первые smoke/research configs:

### A. Protected / BE by 5m ADX

Параметры:

```text
ADX threshold:
  30 / 35 / 40 / 45

phase:
  protected

stop:
  break_even_stop at protected
```

Сравнивать:

```text
baseline MFE/ATR protected
vs
ADX/DI protected
```

Смотреть:

```text
сколько сделок protected
сколько закрыто BE
saved/hurt managed stop
PF/winrate
long/short separately
runner+SL категории
```

### B. Runner by 1h ADX

Параметры:

```text
1h ADX threshold:
  20 / 25 / 30 / 35 / 40

phase:
  runner

take:
  disable_initial_tp at runner

optional:
  lock_profit_stop at runner
```

Смотреть:

```text
помогает ли 1h impulse реально выбирать сделки для протяжки
или просто поздно включает runner
```
