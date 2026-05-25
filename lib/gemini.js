const { GoogleGenerativeAI } = require('@google/generative-ai');
const { fetch: undiciFetch } = require('undici');
const { repairPageSummary } = require('./summary-groups');

function normalizeTangoCount(step) {
  const c = String(step?.count ?? '').trim();
  const u = c.toUpperCase();
  if (u === 'М' || u === 'S' || u === 'SLOW') { step.count = 'М'; return; }
  if (u === 'Б' || u === 'Q' || u === 'QUICK') { step.count = 'Б'; return; }
  const beats = String(step?.beats ?? '').trim();
  const src = /[,\d]/.test(c) ? c : beats;
  if (/,/.test(src)) step.count = 'М';
  else if (/^\d+$/.test(src)) step.count = 'Б';
}

function buildSchemaHint(danceType) {
  const isTango = danceType === 'tango';
  const countField = isTango
    ? `      "count": "ритм из колонки COUNT (НЕ Beats): S→М, Q→Б. Только одна буква М или Б на шаг. НИКОГДА не ставь сюда цифры"`
    : `      "count": "ритм: М или Б (S→М, Q→Б)"`;
  const lastStepField = isTango
    ? `      "beats": "счёт из колонки BEATS (8CT): 1,2 / 3,4 / 5 / 6 / 7,8 — копируй цифры как есть"`
    : `      "sway": "Прямо/Влево/Вправо (S=Straight→Прямо, L=Left→Влево, R=Right→Вправо)"`;
  const swayNote = isTango
    ? `КРИТИЧНО для Танго — две РАЗНЫЕ колонки: COUNT (S/Q) → поле count как М/Б; BEATS (8CT) (1,2 / 5 / 7,8) → поле beats как цифры. Не путай и не дублируй beats в count.`
    : `В колонке Sway: S → Прямо, L → Влево, R → Вправо.`;

  return `Верни ТОЛЬКО валидный JSON-массив (без markdown) из объектов в формате:
{
  "title": "только название фигуры и роль на русском, БЕЗ номера, например 'Правый поворот — Партнёр' (НЕ пиши номер типа '9A.' перед названием)",
  "subtitle": "название танца ТОЛЬКО если оно ЯВНО написано на картинке. Если на картинке нет названия танца — ставь пустую строку ''",
  "level": "",
  "commence": "начальная позиция на русском, например 'Начало: ЗП, лицом по ЛТ'",
  "steps": [
    {
      "step": "1",
      "footPosition": "позиция ноги (ЛН/ПН вперёд/назад/в сторону...)",
      "dancePosition": "ЗП и т.п.",
      "alignment": "Л по ЛТ / С по ЛТ и т.п.",
      "turn": "Нет / 1/4 поворота вправо / 1/8 поворота влево и т.п. (ВСЕГДА используй слово 'поворот', НИКОГДА 'оборот'. Com to turn L → Начало поворота влево, Com to turn R → Начало поворота вправо. L=Left=влево, R=Right=вправо, Л/П — НЕЛЬЗЯ)",
      "cbm": "Нет / Слегка / Да",
      "riseFall": "описание подъёма и снижения",
      "fw": "работа стопы",
${countField}
${lastStepField}
    }
  ],
  "summary": [
    { "label": "5-й такт:", "desc": "Твинкл из ОКПП в ПП", "rowSpan": 3, "startStep": 1 }
  ],
  "leadNotes": "ПОЛНЫЙ перевод секции 'Lead:' / 'Lead and Follower:' / 'Ведущий:' (если есть) — переводи ВСЁ дословно, не пропускай предложения",
  "notes": ["ПОЛНЫЙ перевод КАЖДОГО пункта секции 'Notes' / 'Notes for Leader' / 'Примечания' — переводи ВСЕ пункты целиком, не сокращай"]
}

ВАЖНО: ВСЕ значения в JSON должны быть НА РУССКОМ (кроме поля beats — цифры копируй как есть). Переводи КАЖДОЕ английское слово/сокращение, ничего не оставляй на английском. ${swayNote}

КРИТИЧНО: Обязательно переведи и включи в JSON ВЕСЬ текст под таблицей:
- параграф 'Lead:' / 'Lead and Follower:' → в поле leadNotes
- нумерованный список 'Notes:' / 'Notes for Leader:' → каждый пункт отдельной строкой в массив notes
Не пропускай ни одного предложения. Если параграф длинный — переводи его полностью.

Если какое-то поле отсутствует на картинке (например, нет бейджа уровня в углу) — ставь ПУСТУЮ СТРОКУ "". НИКОГДА не пиши "неизвестно", "unknown", "нет данных" или подобные заглушки.

Если на картинке две таблицы (Партнёр / Партнёрша или Leader / Follower) — верни массив из ДВУХ объектов.
Если одна — массив из одного.

СЛОВАРЬ СОКРАЩЕНИЙ (английский → русский):

Танцевальные позиции:
- CP (Closed Position) → ЗП
- OP/L → ВП/Л, OP/R → ВП/П
- PP (Promenade) → ПП, CPP → КПП, OCPP → ОКПП, Prep PP → подг. ПП
- OFP → ОЛП
- OTPP (Overturned Promenade Position) → Перекрученная променадная позиция
- FallP → ФП, CFallPP → КФП
- RAP → ПУ
- LSP → ЛБП, RSP → ПБП
- B2B → СС
- UAT → ПпР (Поворот под рукой), UATL/FUATL → ПпРЛ (Поворот под рукой влево), UATR/FUATR → ПпРП (Поворот под рукой вправо)
- SH/R → ТеньП, SH/L → ТеньЛ
- RShadP / RShaPdP (Right Shadow Position) → Правая теневая позиция
- LShadP / LShaPdP (Left Shadow Position) → Левая теневая позиция
- ContraL → КЛБ, ContraR → КПБ
- LS/SF → ЛБ/ОН, RS/SF → ПБ/ОН
- Tandem/SF → Тандем/ОН
- ContraL/SF → КЛ/ОН, ContraR/SF → КП/ОН
- OppSh/R → ПрТеньП, OppSh/L → ПрТеньЛ

Захваты:
- BH → БЗ, AH-B → АЗ-Б, AH-S → АЗ-С, FH → РЗ
- DHH → ДРЗ, SHH → ОРЗ, HH → Рук., XHH → ПерЗ
- NH → БЗ-нет, H2B → РкТ
- SH/R (Shadow Hold Right) → ТеньЗП

Работа стопы:
- T (Toe) → Н, H (Heel) → К
- TH → НК, HT → КН, THT → НКН
- B (Ball) → Под, BF → ПодП, BH → ПодК, THB → НКП
- WF → ВС
- TTI → НВн, TTO → НВр, IE → ВР, OE → НР

Действия и термины:
- Slow → М, Quick → Б
- Nil → Нет
- Slight → Слегка
- CBM → ДКТ, CBMP → ПДКТ
- NFR (No Foot Rise) → БПС
- BCT → КЗП, BTL → КПМ
- Rev (Reverse) → Обр, Nat (Natural) → Прав

Направления:
- LOD → ЛТ (линия танца)
- F LOD (Facing) → Л по ЛТ
- B LOD (Backing) → С по ЛТ
- DC → ДЦ, DW → ДС, против стены/центра соответственно
- Wall → Ст (стена), Centre → Ц (центр)

Ноги/направления:
- LF (Left Foot) → ЛН
- RF (Right Foot) → ПН
- forward → вперёд
- back → назад
- side → в сторону
- closes to → приставляется к
- diag → по диагонали
- and slightly → и слегка

Подъём/снижение (Rise & Fall):
- Com to rise e/o N → Начало подъёма в конце N
- Cont to rise on N and N → Продолжение подъёма на N и N
- Up on N → Подъём на N
- Lower e/o N → Снижение в конце N
- Rise on toes → Подъём на носки
- NFR → НПС (нет подъёма стопы)

Сводка (Summary) — ОБЯЗАТЕЛЬНО:
- Если на картинке есть колонка SUMMARY / Итого — извлеки ВСЕ объединённые ячейки в массив summary. Не пропускай.
- Каждая объединённая ячейка → один объект: label (ритм-паттерн, напр. «ММ:» или «ББМ:»), desc (описание шагов на русском), rowSpan (число строк объединения), startStep.
- startStep — это ПОРЯДКОВЫЙ НОМЕР СТРОКИ в массиве steps на ЭТОЙ странице (1, 2, 3…), а НЕ номер из колонки STEP. Пример: если на странице шаги 13–18, первая строка → startStep: 1, четвёртая → startStep: 4.
- rowSpan ДОЛЖЕН соответствовать числу шагов в группе. SS охватывает 2 шага → rowSpan: 2. QQS охватывает 3 шага → rowSpan: 3. Сумма всех rowSpan = число шагов. Одна ячейка на группу — НЕ дублируй ББМ на соседних строках.
- Пример для 11 шагов: [{startStep:1,rowSpan:2,label:"ММ:",desc:"2 шага назад"},{startStep:3,rowSpan:3,label:"ББМ:",desc:"ПН назад перекрёстный рок"},{startStep:6,rowSpan:3,label:"ББМ:",desc:"ЛН назад открытый рок"},{startStep:9,rowSpan:3,label:"ББМ:",desc:"Танго Клоуз"}]
- Перевод ритм-паттернов (label) в Танго: SS → ММ:, QQS → ББМ:, SQQ → МББ:, QQ → ББ:
- Перевод ритм-паттернов в других танцах: 5th Meas → 5-й такт:, 1st Meas → 1-й такт:, 2nd Meas → 2-й такт: и т.д.
- КРИТИЧНО для Танго: В поле desc для Summary — RF = ПН (правая нога), LF = ЛН (левая нога). НЕ применяй словарь работы стопы (BH, TH и т.п.) к описаниям в Summary. "RF back crossed rock" → "ПН назад перекрёстный рок", "LF back open rock" → "ЛН назад открытый рок", "2 back walks" → "2 шага назад", "Tango Close" → "Танго Клоуз".
- LF Forward Progressive → ЛН вперёд прогрессивное, RF Back Progressive → ПН назад прогрессивное.
- Если колонки SUMMARY на картинке нет или она пустая — summary: [].

Заголовки:
- Bronze N → Бронза N
- Silver N → Серебро N
- Gold N → Золото N
- Twinkle(s) → Твинкл(ы) (НЕ переводи как 'винты', 'мерцания' и т.п. — это транслитерация)
- Progressive Twinkles – Leader → Прогрессивные Твинклы — Партнёр
- Progressive Twinkles – Follower → Прогрессивные Твинклы — Партнёрша
- Progressive Chassé – Leader → Прогрессивное шассе — Партнёр
- Progressive Chassé – Follower → Прогрессивное шассе — Партнёрша
- ПРАВИЛО: слово "Progressive" согласуется с существительным по роду/числу: Твинклы (мн.ч.) → Прогрессивные, шассе (ср.р.) → Прогрессивное
- Commence in CP, F LOD → Начало: ЗП, лицом по ЛТ
- Commence in CP, B LOD → Начало: ЗП, спиной по ЛТ`;
}

function normalizeSummary(pages, danceType = 'slow-waltz') {
  for (const page of pages) {
    if (!page.steps?.length) {
      page.summary = [];
      continue;
    }
    if (danceType === 'tango') {
      for (const step of page.steps) normalizeTangoCount(step);
    }
    const firstStep = parseInt(page.steps[0].step, 10);
    page.summary = (page.summary || [])
      .filter(s => s && (String(s.label || '').trim() || String(s.desc || '').trim()))
      .map(s => {
        let startStep = Number(s.startStep) || 1;
        const idx = page.steps.findIndex(st => String(st.step) === String(s.startStep));
        if (idx >= 0) {
          startStep = idx + 1;
        } else if (!isNaN(firstStep) && startStep >= firstStep) {
          const offset = startStep - firstStep;
          if (offset >= 0 && offset < page.steps.length) startStep = offset + 1;
        }
        return {
          label: String(s.label || '').trim(),
          desc: String(s.desc || '').trim(),
          rowSpan: Math.max(1, Number(s.rowSpan) || 1),
          startStep,
        };
      });
    repairPageSummary(page, danceType);
  }
  return pages;
}


async function extractFromImage(imageBuffer, mimeType = 'image/png', danceType = 'slow-waltz') {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY не задан в .env');

  const genAI = new GoogleGenerativeAI(apiKey, { fetch: undiciFetch });
  const models = [
    'gemini-2.5-flash-lite',
    'gemini-2.5-flash',
    'gemini-2.0-flash',
  ];

  let lastError;
  for (const modelName of models) {
    const model = genAI.getGenerativeModel({
      model: modelName,
      generationConfig: { responseMimeType: 'application/json' },
    });

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const result = await model.generateContent([
          { inlineData: { data: imageBuffer.toString('base64'), mimeType } },
          buildSchemaHint(danceType),
        ]);
        const text = result.response.text();
        try {
          const parsed = JSON.parse(text);
          return normalizeSummary(Array.isArray(parsed) ? parsed : [parsed], danceType);
        } catch {
          const match = text.match(/\[[\s\S]*\]/);
          if (!match) throw new Error('Невалидный JSON: ' + text.slice(0, 300));
          return normalizeSummary(JSON.parse(match[0]), danceType);
        }
      } catch (e) {
        lastError = e;
        const msg = e.message || '';
        const quota = /\b(429|quota|limit: 0)\b/i.test(msg);
        const retriable = quota || /\b(503|overloaded|Service Unavailable|Too Many Requests|high demand)\b/i.test(msg);
        if (!retriable) break;
        if (quota) break;
        const delay = 1500 * attempt;
        console.log(`[${modelName}] попытка ${attempt} не удалась (${msg.slice(0, 80)}), жду ${delay}мс...`);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  throw lastError;
}

module.exports = { extractFromImage, normalizeSummary, normalizeTangoCount };
