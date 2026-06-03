# Trend Strength Episode Blocker

> Спецификация entry-blocker для `ema_pullback` и Strategy Constructor.  
> Компонент фильтрует слабый трендовый режим, не требуя высокого ADX на свече входа.

---

## Проблема

Сейчас setup проверяет структуру EMA-stack:

```text
long:
  fast EMA > anchor EMA > slow EMA

short:
  fast EMA < anchor EMA < slow EMA
```

Но сама по себе такая структура ещё не доказывает, что на рынке есть реальный тренд.

EMA могут быть формально разложены в правильном порядке, но фактически рынок может быть шумным:

- EMA почти горизонтальны;
- цена пилит вокруг anchor;
- импульса нет;
- вход выглядит валидным по правилам, но по факту это слабый режим;
- сделка часто не доходит до TP или быстро возвращается в BE/SL.

Нужен отдельный **entry-blocker**, который фильтрует слабый трендовый режим.

---

## Почему не подходит простой ADX blocker

Стандартный ADX/DMI полезен:

- ADX показывает силу тренда;
- +DI / -DI показывают направление directional movement.

Простая логика могла бы быть такой:

```text
long:
  ADX > threshold
  +DI > -DI

short:
  ADX > threshold
  -DI > +DI
```

Но для pullback-стратегии это может быть вредно.

Хороший вход часто появляется не на пике импульса, а позже:

1. тренд уже был доказан;
2. цена прошла импульсом;
3. ADX/DMI вспыхнул;
4. потом импульс чуть угас;
5. цена откатилась к EMA;
6. ADX уже начал снижаться;
7. именно в этот момент появляется pullback-entry.

Если требовать высокий ADX прямо на свече входа, blocker может заблокировать хорошие pullback-сделки.

Поэтому нужен не `ADX[t] > threshold`, а **blocker с памятью режима**.

---

## Цель компонента

Добавить новый blocker:

```text
component_id: trend_strength_episode_blocker
```

Компонент отвечает не на вопрос:

```text
тренд сильный прямо на текущей свече?
```

а на вопрос:

```text
был ли недавно подтверждённый трендовый импульс,
и не протух ли этот режим к моменту pullback-входа?
```

Вход разрешён, если:

- в lookback был side-aware ADX/DMI strength episode;
- этот episode был не слишком давно;
- текущий режим не развалился;
- EMA-stack всё ещё направлен в сторону сделки.

### Короткая формула

Не «ADX высокий прямо сейчас», а:

```text
недавно был side-aware ADX/DMI импульс,
и текущий pullback ещё происходит внутри живого трендового episode
```

---

## Роль компонента

Компонент живёт в **blockers**, а не в setup, trigger, exits или exit_management.

| Слой | Роль |
|------|------|
| setup | паттерн входа / касание / bounce |
| trigger | конкретный входной триггер |
| blocker | запретить вход, если режим плохой |
| exit_management | управление уже открытой сделкой |

`trend_strength_episode_blocker` не создаёт самостоятельный паттерн входа. Он только блокирует входы в слабом или уже сломанном режиме.

---

## MVP config

```yaml
component_id: trend_strength_episode_blocker
params:
  timeframe: base
  adx_period: 14

  min_adx_peak: 25
  peak_lookback_bars: 60
  max_bars_since_peak: 40

  min_current_adx: 12

  require_di_alignment_on_peak: true
  block_on_opposite_di_flip: true
  opposite_di_margin: 5
```

EMA-stack direction is enforced by the **direction** component only; this blocker does not duplicate it. Legacy configs may still list `require_ema_stack_direction`; the field is ignored at runtime.

---

## Смысл параметров

| Параметр | Смысл |
|----------|--------|
| `timeframe` | Таймфрейм для ADX / +DI / -DI. Параметр остаётся в контракте; **MVP** — только `base` (non-base → validation error). HTF ADX/DMI — отдельный v2 slice (см. ниже). |
| `adx_period` | Период ADX/DMI. Старт: `14`. |
| `min_adx_peak` | Минимальный ADX на баре, подтверждающем сильный импульс. |
| `peak_lookback_bars` | Сколько баров назад искать подтверждённый ADX/DMI peak. |
| `max_bars_since_peak` | Максимум баров с последнего strength peak; иначе режим «протух». |
| `min_current_adx` | Минимальный текущий ADX (может быть ниже peak после угасания импульса). |
| `require_di_alignment_on_peak` | Peak засчитывается только при DI в сторону сделки. |
| `block_on_opposite_di_flip` | Блок, если текущий DI явно развернулся против стороны. |
| `opposite_di_margin` | Минимальное преимущество противоположного DI для opposite flip. |

---

## Логика для long

Long-вход разрешён, если:

1. В последние `peak_lookback_bars` был бар strength peak: `ADX >= min_adx_peak`.
2. Если `require_di_alignment_on_peak = true`, на этом peak: `+DI > -DI`.
3. С момента peak прошло не больше `max_bars_since_peak`.
4. Текущий `ADX >= min_current_adx`.
5. Если `block_on_opposite_di_flip = true`, нет сильного opposite flip:  
   `-DI > +DI + opposite_di_margin`.

---

## Логика для short

Short-вход разрешён, если:

1. В последние `peak_lookback_bars` был бар strength peak: `ADX >= min_adx_peak`.
2. Если `require_di_alignment_on_peak = true`, на этом peak: `-DI > +DI`.
3. С момента peak прошло не больше `max_bars_since_peak`.
4. Текущий `ADX >= min_current_adx`.
5. Если `block_on_opposite_di_flip = true`, нет сильного opposite flip:  
   `+DI > -DI + opposite_di_margin`.

Long и short — зеркальная семантика.

---

## Термин «peak» (не локальный максимум ADX)

В именах полей (`adx_peak`, `adx_peak_idx`, `min_adx_peak`) слово **peak** — историческое/краткое обозначение. По торговой логике это **последний qualifying bar** (strength confirmation) в lookback, где:

- `ADX >= min_adx_peak`
- при `require_di_alignment_on_peak` — DI в сторону сделки

Нужен **most recent** такой бар, **не** argmax ADX в окне и **не** локальный максимум ADX. Реализация не должна искать swing high / local max по серии ADX.

---

## Episode semantics

Компонент работает как **episode / memory gate**.

Для каждой стороны сделки определяются (внутреннее состояние / diagnostics):

```text
trend_strength_active
last_strength_idx
last_strength_time_ms
bars_since_strength
peak_adx
di_plus_at_peak
di_minus_at_peak
current_adx
current_di_plus
current_di_minus
```

### Начало episode

Side-aware strength peak:

```text
long:
  ADX >= min_adx_peak
  +DI > -DI

short:
  ADX >= min_adx_peak
  -DI > +DI
```

(При `require_di_alignment_on_peak = false` условие DI на peak может не требоваться — см. параметр.)

### Episode активен, пока

```text
bars_since_strength <= max_bars_since_peak
current_adx >= min_current_adx
нет opposite DI flip (если block_on_opposite_di_flip)
```

### Episode неактивен, если

- strength peak не найден в lookback;
- peak был слишком давно;
- `current_adx < min_current_adx`;
- противоположный DI явно доминирует.

---

## Diagnostics

Минимальные поля диагностики (per bar / per evaluation):

```text
trend_strength_active
blocked_reason

adx_current
adx_peak
adx_peak_idx
adx_peak_time_ms
bars_since_adx_peak

di_plus_current
di_minus_current
di_plus_at_peak
di_minus_at_peak

di_alignment_at_peak
opposite_di_flip
```

### Значения `blocked_reason`

```text
no_recent_adx_peak
peak_too_old
current_adx_too_low
opposite_di_flip
indicator_not_ready
```

(Пусто / отсутствует, когда вход не блокируется этим компонентом.)

---

## Acceptance

1. Компонент живёт в **blockers**.
2. Компонент **не трогает**: `exit_policy`, `exit_management`, `break_even_stop`, Signal Trace exit-management lifecycle, `data_engine`.
3. Long и short логика зеркальны.
4. ADX peak **side-aware**: long — `+DI > -DI` на peak; short — `-DI > +DI` на peak (когда `require_di_alignment_on_peak`).
5. Компонент **не требует** высокого ADX на текущей свече; разрешает pullback при недавнем сильном episode.
6. При явном opposite DI flip вход блокируется (если `block_on_opposite_di_flip`).
7. EMA-stack direction **не** проверяется этим blocker (только direction component).
8. Компонент отдаёт diagnostics (см. выше).
9. Компонент отдаёт `component_counters` с `blocked_reason_breakdown` на run variant.
10. Старые стратегии **без** этого blocker работают без изменений (opt-in через spec / config).

---

## Feature dependencies

Для MVP на `timeframe: base` компоненту нужны подготовленные колонки (через `FeaturePlan`, не внутри компонента):

```text
ADX(adx_period) на выбранном timeframe
+DI, -DI (тот же период)
```

Расчёт ADX/DMI — в `features/calculations.py`; компонент только читает колонки по binding из spec.

### MTF / HTF ADX (v2, вне MVP)

Параметр `timeframe` заложен намеренно (например entry 5m, strength 15m/1h). В **первом slice** реализуется только `base`; HTF не делаем.

Для v2 отдельно нужно зафиксировать:

- расчёт ADX/DMI на HTF;
- align к base bars (без silent approximation в blocker);
- confirmed HTF bar vs forming HTF bar;
- timestamp / index semantics для peak и Signal Trace;
- отображение diagnostics при `timeframe != base`.

HTF ADX **не** аппроксимировать resample-from-base внутри blocker.

---

## Первые sweep-параметры

```text
min_adx_peak:              20 / 25 / 30
peak_lookback_bars:         40 / 60 / 100
max_bars_since_peak:        20 / 40 / 80
min_current_adx:            8 / 10 / 12 / 15
opposite_di_margin:         0 / 5 / 10
require_di_alignment_on_peak: true
block_on_opposite_di_flip:  true / false
```

---

## Component counters (JSON report)

На каждый run variant в `component_counters[]` для этого blocker (per `instance_id`, per side):

```text
intrinsic_allowed_count
intrinsic_blocked_count
intrinsic_blocked_reason_breakdown
final_allowed_count_after_context   # если включён context_consumption
final_blocked_count_after_context
allowed_count                       # = final mask (runtime), иначе intrinsic
blocked_count
blocked_reason_breakdown            # = intrinsic (для sweep)
```
  no_recent_adx_peak: <bars>
  peak_too_old: <bars>
  current_adx_too_low: <bars>
  opposite_di_flip: <bars>
  indicator_not_ready: <bars>
```

Сумма значений в `blocked_reason_breakdown` должна совпадать с `blocked_count`. Без breakdown sweep слепой: видно только «сделок меньше», но не *почему* режутся бары.

---

## Что смотреть в результатах

- trades count;
- `component_counters` для blocker: `allowed_count`, `blocked_count`, `blocked_reason_breakdown`;
- сколько входов заблокировано;
- TP rate / SL rate / BE rate;
- profit factor;
- long / short отдельно;
- avg ADX peak у TP / BE / SL сделок;
- avg `bars_since_adx_peak` у TP / BE / SL сделок;
- `blocked_reason` breakdown.

---

## Guardrails (implementation)

```text
Не добавлять в data_engine/
Не менять exit_policy / exit_management / break_even_stop для этого slice
Не подменять setup/trigger — только AND в цепочке blockers
Диагностика — в component_counters / debug path research runner, не в JSON свечей
```

---

## Связанные документы

```text
docs/research/EMA_PULLBACK_PIPELINE_README.md  — blockers в pipeline
docs/research/06_component_registry.md         — registry role + component_id
docs/research/12_component_builders.md         — blocker_rule() builder (после реализации)
docs/research/strategy_constructor_master_plan.md
```
