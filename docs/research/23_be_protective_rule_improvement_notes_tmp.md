# BE StopLoss / Protective Rule — заметки по улучшению (временный)

> **Статус:** временный рабочий документ, не спецификация.  
> **Контекст:** странное поведение BE в экспериментах ema200_real_tp_be (strict vs relaxed, ADX activation).

---

## Исходная мысль

Пока BE странно себя показывает, но нельзя говорить, что он **выборочно** может быть применён. Он должен **всегда применяться или никогда**. Не может такого быть, что для strict и для relaxed разное поведение.

Возможно, мы просто ещё не нашли формулу применения protective rule. Возможные направления:

- ADX нужно подкрутить
- проверить, что ADX даёт только **направленный** сигнал (в сторону сделки), а не в любую сторону
- SL надо делать с подстраховкой от прокола — закрытие бара ниже BE, возможно N баров ниже BE

---

## Основной вывод: нельзя включать BE выборочно

Согласен с основной мыслью: нельзя сейчас честно сказать «BE работает для strict, но не работает для relaxed, значит включим только strict». Это пахнет подгонкой.

**Правильнее так:**

- BE как protective rule должен иметь **универсальную формулу применения**
- Если формула хорошая, она должна хотя бы **не ломать** разные ветки
- Если ломает relaxed и странно ведёт себя на strict — **формула ещё не найдена**

Разница strict/relaxed сейчас полезна **не для выбора «где включать BE»**, а как **диагностика**:

- на чистом входе BE меньше вредит
- на грязном входе ломает сильнее

Это говорит не «включать выборочно», а «**текущий BE слишком тупой/ранний/жёсткий**».

---

## Что сейчас, скорее всего, не так с BE

Текущий BE — это грубый **hard stop**:

```
phase protected случилась
  → стоп переносится ровно в entry
  → любой wick в BE выбивает сделку
```

Для EMA200 pullback это может быть слишком хрупко. Сделка часто после импульса возвращается, ретестит область entry/EMA/локальную ликвидность, прокалывает и потом идёт дальше. Hard BE на wick будет выбивать нормальные сделки.

**Поэтому:**

- не делать вывод «BE не нужен»
- **zero hard-BE по wick** пока не доказан
- нужен **другой protective rule contract**

---

## Проверка ADX direction — обязательно

По идее `adx_di_threshold` должен быть направленным:

**long:**

- `ADX >= threshold`
- `+DI > -DI`

**short:**

- `ADX >= threshold`
- `-DI > +DI`

Если это работает иначе, весь тест мусор. Даже если код должен это делать, надо проверить по артефактам, а не верить.

### Нужная проверка

Для всех `phase_changed` с `condition_component_id = adx_di_threshold`:

| side  | условие                          |
|-------|----------------------------------|
| long  | `metadata.di_plus > metadata.di_minus` |
| short | `metadata.di_minus > metadata.di_plus` |

Если в metadata сейчас нет `di_plus` / `di_minus`, надо добавить. Одного `di_aligned: true` мало для аудита.

### Дополнительная аналитика

Посчитать:

**ADX protected events by side:**

- long count
- short count

**ADX protected → BE exit by side:**

- long count / avg return / avg hold
- short count / avg return / avg hold

Потому что если ADX чаще активирует protected в момент **позднего истощения**, а не в начале импульса, то DI alignment формально правильный, но торгово бесполезный.

---

## Возможные формулы protective rule

Разложить не как «подкрутить один параметр», а как несколько разных **типов защиты**.

### 1. Hard BE with buffer

Сейчас: `stop = entry`

Проверить:

- `stop = entry + fees buffer`
- `stop = entry + 0.1 ATR`
- `stop = entry + 0.2 ATR`

Для long это выше entry, для short ниже entry.

Это всё ещё hard stop, но хотя бы не гарантированный fee-loss.

**Минус:** если поставить buffer слишком рано, ещё сильнее выбьет.

### 2. BE с подтверждением закрытием бара

Это уже не stop-loss в классическом смысле. Это скорее `runtime_exit` / `protected_failure_exit`.

**Для long:**

```
protected active
close < BE level
N consecutive bars
  → exit at close
```

**Для short:**

```
protected active
close > BE level
N consecutive bars
  → exit at close
```

Варианты: `N = 1`, `N = 2`, `N = 3`

**Плюс:** wick-прокол не выбивает.

**Минус:** можно получить минус больше BE, потому что выход по close, а не по уровню.

Но для EMA200 это может быть намного честнее: мы защищаемся не от «касания», а от факта, что импульс не удержал reclaim.

### 3. BE только после удержания импульса

Сейчас protected может случиться на одном баре ADX/DI. Можно добавить удержание:

- ADX/DI condition true K bars
- или price remains on profitable side of entry K bars
- или close remains beyond entry + X ATR K bars

Например:

```
protected when:
  ADX >= 35
  DI aligned
  and trade MFE >= 1 ATR
  and close is still profitable after 2 bars
```

Это уже не просто ADX, а «импульс подтвердился и не схлопнулся сразу».

### 4. Protected не через ADX level, а через ADX event

Порог ADX сам по себе может быть поздним. ADX=40 может появиться уже после того, как импульс созрел и скоро начнёт откат.

Надо проверить не только `ADX >= threshold`, а варианты:

- ADX rising
- ADX crossed above threshold
- DI spread expanding
- `ADX >= threshold AND ADX slope > 0`

Возможно, protected должен срабатывать не когда ADX высокий, а когда ADX **начинает ускоряться** в сторону сделки.

---

## План следующих тестов

Не широкий sweep. Сначала проверить гипотезы **по одной**.

### Batch 1 — audit ADX direction

Без новых правил:

- `strict_continuation` initial
- `strict_continuation` ADX40/45 BE
- `relaxed` ADX40/45 BE

**Цель — проверить metadata:**

- ADX protected events действительно side-aligned?
- на каких барах относительно entry они срабатывают?
- какой MFE уже был на момент protected?
- сколько баров прошло от entry до protected?

Если protected часто случается поздно — ADX threshold как activation плохой.

### Batch 2 — BE buffer на strict baseline

Только лучший чистый кандидат:

`strict_continuation w12/r14/wlb20 SL6/TP14`

Варианты:

| ADX | варианты BE |
|-----|-------------|
| ADX40 | hard BE entry / BE + fees / BE + 0.1 ATR / BE + 0.2 ATR |
| ADX45 | hard BE entry / BE + fees / BE + 0.1 ATR / BE + 0.2 ATR |

Смотреть не только PnL:

- PF, winrate, DD
- TP count, BE count
- long/short PF
- `high_mfe_low_capture`
- lost TP count (если paired compare есть)

### Batch 3 — close-confirmed protected failure exit

Новый компонент/правило, не вместо стопа в старом смысле: `protected_close_failure_exit`

Параметры:

- `level`: entry / entry + buffer
- `confirm_bars`: 1 / 2 / 3
- `exit_price`: close

Тест:

- ADX40 protected → close failure exit
- ADX45 protected → close failure exit

Это проверит идею «закрытие бара ниже BE, возможно N баров ниже BE».

---

## Архитектурная граница

**Hard BE** и **close-confirmed BE** — это разные сущности.

| | hard BE | close-confirmed BE |
|---|---------|-------------------|
| слой | `stop_management` | `runtime_exit` / signal-like managed exit |
| семантика | level-based candidate | bar-close condition |
| триггер | intrabar wick can trigger | avoids wick noise |

Не надо запихивать N-bar close confirmation внутрь обычного stop-loss — иначе смешаем два разных execution semantics.

См. также: `20_trade_exit_management_runtime_v1.md`, `21_state_driven_exit_management_v1.md`, `22_phase_rule_condition.md`.

---

## Текущий вывод (зафиксировать)

1. **BE не rejected.**
2. **Rejected** только текущий naive zero hard-BE as universal protective rule.
3. ADX/DI activation promising, но надо проверить **timing** и **side-alignment**.
4. Следующие кандидаты:
   - ADX40/45 + BE buffer
   - ADX40/45 + close-confirmed protected failure
   - ADX rising / DI spread вместо просто `ADX >= threshold`

### Более честная интерпретация strict vs relaxed

Перестать говорить «BE работает на strict». Более честно:

> strict показал, что у entry edge есть запас качества,  
> поэтому даже грубый BE не всегда убивает результат.

Но **универсальная protective formula ещё не найдена**.

Вот это нормальная интерпретация текущих странных результатов.
