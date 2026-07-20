const { GoogleGenerativeAI } = require('@google/generative-ai');
const { fetch: undiciFetch } = require('undici');
const { repairPageSummary } = require('./summary-groups');

function normalizeTangoCount(step) {
  const c = String(step?.count ?? '').trim();
  const u = c.toUpperCase();
  if (u === 'М' || u === 'S' || u === 'SLOW') { step.count = 'М'; return; }
  if (u === 'Б' || u === 'Q' || u === 'QUICK') { step.count = 'Б'; return; }
  if (/^(и|&)$/i.test(c)) return;
  const beats = String(step?.beats ?? '').trim();
  const src = /[,\d]/.test(c) ? c : beats;
  if (/,/.test(src)) step.count = 'М';
  else if (/^\d+$/.test(src)) step.count = 'Б';
}

function buildSchemaHint(danceType) {
  const isTango = danceType === 'tango';
  const isSlowFox = danceType === 'slow-fox';
  const isVienneseWaltz = danceType === 'viennese-waltz';
  const countField = (isTango || isSlowFox)
    ? `      "count": "ритм из колонки COUNT (НЕ Beat/Beats): S→М, Q→Б. Только одна буква М или Б на шаг. НИКОГДА не ставь сюда цифры"`
    : isVienneseWaltz
      ? `      "count": "счёт из колонки COUNT: цифра 1, 2 или 3 — копируй как есть"`
      : `      "count": "ритм: М или Б (S→М, Q→Б)"`;
  const lastStepFields = isTango
    ? `      "beats": "счёт из колонки BEATS (8CT): 1,2 / 3,4 / 5 / 6 / 7,8 — копируй цифры как есть"`
    : isSlowFox
      ? `      "beats": "счёт из колонки BEAT: 1,2 / 3,4 / 1 / 2 — копируй цифры как есть",
      "sway": "Прямо/Влево/Вправо (S=Straight→Прямо, L=Left→Влево, R=Right→Вправо)"`
      : `      "sway": "Прямо/Влево/Вправо (S=Straight→Прямо, L=Left→Влево, R=Right→Вправо)"`;
  const columnNote = isTango
    ? `КРИТИЧНО для Танго — две РАЗНЫЕ колонки: COUNT (S/Q) → поле count как М/Б; BEATS (8CT) (1,2 / 5 / 7,8) → поле beats как цифры. Не путай и не дублируй beats в count.`
    : isSlowFox
      ? `КРИТИЧНО для Slow Fox — ТРИ отдельные колонки: COUNT (S/Q) → count как М/Б; BEAT (1,2 / 3,4 / 1 / 2) → beats как цифры; SWAY (S/L/R) → sway как Прямо/Влево/Вправо. Не путай и не дублируй beat в count.`
      : `В колонке Sway: S → Прямо, L → Влево, R → Вправо.`;

  return `Верни ТОЛЬКО валидный JSON-массив (без markdown) из объектов в формате:
{
  "title": "только название фигуры и роль на русском, БЕЗ номера, например 'Правый поворот — Партнёр' (НЕ пиши номер типа '9A.' перед названием)",
  "subtitle": "",
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
${lastStepFields}
    }
  ],
  "summary": [
    { "label": "5-й такт:", "desc": "Твинкл из ОКПП в ПП", "rowSpan": 3, "startStep": 1 }
  ],
  "leadSourceHeader": "ДОСЛОВНО 'Lead:' / 'Lead and Follower:' с картинки, или \"\" если секции Lead нет",
  "leadNotes": "ПОЛНЫЙ перевод абзаца под заголовком Lead: — только текст, БЕЗ заголовка. \"\" если Lead нет",
  "notesSourceHeader": "ДОСЛОВНО заголовок списка notes: 'Notes for Leader:' / 'Notes for Follower:' / 'Notes for Leader and Follower:' / 'Notes:' — \"\" если списка нет (НЕ пиши сюда Lead:)",
  "notesHeader": "shared | leader | follower | general — соответствует notesSourceHeader (НЕ lead)",
  "notes": ["ТОЛЬКО нумерованные пункты из Notes for Leader/Follower — каждый отдельной строкой, БЕЗ номеров. \"\" / [] если списка нет. НИКОГДА не клади сюда абзац Lead"]
}

ВАЖНО: ВСЕ значения в JSON должны быть НА РУССКОМ (кроме поля beats — цифры копируй как есть). Переводи КАЖДОЕ английское слово/сокращение, ничего не оставляй на английском. ${columnNote}

КРИТИЧНО: Под таблицей могут быть ДВЕ отдельные секции — не смешивай их.
1) Lead: → leadSourceHeader: "Lead:", leadNotes = весь абзац, notes НЕ трогай для этого текста
2) Notes for Leader: → notesSourceHeader: "Notes for Leader:", notesHeader: "leader", notes = каждый пункт 1., 2., … отдельной строкой
Если на картинке ОБЕ секции — заполни И leadNotes, И notes. В notes столько элементов, сколько нумерованных пунктов (1., 2., 3.…) под «Notes for Leader» — НЕ объединяй в один.
Если на картинке есть пункт «For alternative/competitive technique… Foxtrot Facts» — отдельный элемент notes, перевод: «Для альтернативной и соревновательной техники и стиля см. раздел „Foxtrot Facts“.». Если такого пункта нет — не добавляй.
- 'Notes for Leader and Follower:' → notesSourceHeader, notesHeader: "shared", leadSourceHeader: "", leadNotes: ""
- 'Notes for Follower:' → notesHeader: "follower"
- единственный 'Note for Leader:' (без Lead: и без нумерации) → leadNotes, leadSourceHeader: "", notes: []
- только 'Lead:' без Notes for Leader → leadSourceHeader: "Lead:", leadNotes, notes: []
- 'Notes:' / 'Примечания:' без Lead → notesHeader: "general"
Не пропускай ни одного предложения и ни одного пункта списка. Lead ≠ Notes for Leader. Lead → «Ведение», Notes for Leader → «Примечание для ведущего».

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
- CBM → ПДК, CBMP → ПДКТ
- NFR (No Foot Rise) → БПС
- BCT → КЗП, BTL → КПМ
- Rev (Reverse) → Обр, Nat (Natural) → Прав

Направления:
- any alignment → любом направлении (в контексте примечаний: "May commence in any alignment" → "Может начинаться в любом направлении")
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
- Перевод ритм-паттернов в Slow Fox: SS → ММ:, QQ → ББ:. Примеры desc: "2 forward walks" → "2 шага вперёд", "2 backward walks" → "2 шага назад", "Chassé to L" → "шассе влево", "Chassé to R" → "шассе вправо"
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
- Commence in CP, B LOD → Начало: ЗП, спиной по ЛТ
- Basic (straight) / BASIC (STRAIGHT) → Основное движение (по прямой)
- Basic (curving) / BASIC (CURVING) → Основное движение (по дуге)
- BASIC (STRAIGHT) – Leader → Основное движение (по прямой) — Партнёр
- BASIC (STRAIGHT) – Follower → Основное движение (по прямой) — Партнёрша
- BASIC (CURVING) – Leader → Основное движение (по дуге) — Партнёр
- BASIC (CURVING) – Follower → Основное движение (по дуге) — Партнёрша

Текст под таблицей:
- Notes for Leader / Note for Leader → Примечание для ведущего (НЕ «Ведущий»)
- Notes for Follower / Note for Follower → Примечание для ведомого (НЕ «Партнёрша», НЕ «Ведомый»)
- Notes for Leader and Follower / Note for Leader and Follower → Примечание для ведущего и ведомого
- Lead / Lead and Follower → Ведение (НЕ «Ведущий», НЕ «Ведение партнёра»)
- Notes / Примечания → Примечания
- For alternative/competitive technique and styling, please refer to Foxtrot Facts page → Для альтернативной и соревновательной техники и стиля см. раздел «Foxtrot Facts».`;
}

const { repairNotes } = require('./notes');

function normalizeSummary(pages, danceType = 'slow-waltz') {
  for (const page of pages) {
    if (!page.steps?.length) {
      page.summary = [];
      continue;
    }
    if (danceType === 'tango' || danceType === 'slow-fox') {
      for (const step of page.steps) normalizeTangoCount(step);
    }
    page.subtitle = '';
    page.summary = (page.summary || [])
      .filter(s => s && (String(s.label || '').trim() || String(s.desc || '').trim()))
      .map(s => ({
        label: String(s.label || '').trim(),
        desc: String(s.desc || '').trim(),
        rowSpan: Math.max(1, Number(s.rowSpan) || 1),
        startStep: Number(s.startStep) || 1,
      }));
    repairPageSummary(page, danceType);
    repairNotes(page);
  }
  return pages;
}


const DEFAULT_MODELS = [
  'gemini-2.5-flash-lite',
  'gemini-2.5-flash',
  'gemini-3.1-flash-lite',
  'gemini-3-flash-preview',
  'gemini-3.5-flash',
];

function isModelUnavailable(msg) {
  return /is not found|not supported for generateContent/i.test(String(msg || ''));
}

function parseRetryMs(msg) {
  const m = String(msg).match(/retry in ([\d.]+)s/i);
  return m ? Math.ceil(parseFloat(m[1]) * 1000) + 500 : null;
}

function isQuotaExhausted(msg) {
  return /\b(429|quota|RESOURCE_EXHAUSTED)\b/i.test(msg);
}

function isDailyQuotaZero(msg) {
  return /limit:\s*0/i.test(msg) || /PerDay|per day/i.test(msg);
}

function getGeminiApiKeys() {
  const keys = [process.env.GEMINI_API_KEY, process.env.GEMINI_API_KEY_2]
    .map(k => k?.trim())
    .filter(Boolean);
  if (!keys.length) throw new Error('GEMINI_API_KEY не задан в .env');
  return keys;
}

function formatGeminiError(e, keyCount = 1) {
  const msg = e?.message || String(e);
  if (isQuotaExhausted(msg)) {
    const extra = keyCount > 1
      ? ' Запасной ключ тоже исчерпан.'
      : ' Добавьте GEMINI_API_KEY_2 в .env для автоматического переключения.';
    return 'Исчерпана квота Gemini API (бесплатный тариф).' + extra + ' Подождите до сброса лимита или проверьте usage: https://ai.dev/rate-limit';
  }
  if (/\b503\b|overloaded|Service Unavailable/i.test(msg)) {
    return 'Сервер Gemini перегружен — попробуйте через минуту.';
  }
  const short = msg.replace(/^.*?\[[\d]+[^\]]*\]\s*/, '').trim();
  return short.length > 400 ? short.slice(0, 400) + '…' : short;
}

async function extractFromImage(imageBuffer, mimeType = 'image/png', danceType = 'slow-waltz') {
  const apiKeys = getGeminiApiKeys();
  const envModel = process.env.GEMINI_MODEL?.trim();
  const models = envModel ? [envModel] : DEFAULT_MODELS;

  let lastError;
  for (let keyIdx = 0; keyIdx < apiKeys.length; keyIdx++) {
    const genAI = new GoogleGenerativeAI(apiKeys[keyIdx], { fetch: undiciFetch });
    let keyQuotaExhausted = false;

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
          if (isModelUnavailable(msg)) {
            console.log(`[${modelName}] модель недоступна, следующая...`);
            break;
          }

          const quota = isQuotaExhausted(msg);
          const overload = /\b(503|overloaded|Service Unavailable|high demand)\b/i.test(msg);
          if (!quota && !overload && !/\bToo Many Requests\b/i.test(msg)) break;

          if (quota && isDailyQuotaZero(msg)) {
            console.log(`[ключ ${keyIdx + 1}/${apiKeys.length}] дневная квота исчерпана`);
            keyQuotaExhausted = true;
            break;
          }

          const retryMs = parseRetryMs(msg);
          if (quota && retryMs && retryMs <= 120000 && attempt < 3) {
            console.log(`[${modelName}] лимит RPM, жду ${retryMs}мс (попытка ${attempt})...`);
            await new Promise(r => setTimeout(r, retryMs));
            continue;
          }

          if (quota) {
            keyQuotaExhausted = true;
            break;
          }

          const delay = 1500 * attempt;
          console.log(`[${modelName}] попытка ${attempt} не удалась (${msg.slice(0, 80)}), жду ${delay}мс...`);
          await new Promise(r => setTimeout(r, delay));
        }
      }
      if (keyQuotaExhausted) break;
    }

    if (keyQuotaExhausted && keyIdx < apiKeys.length - 1) {
      console.log(`[ключ ${keyIdx + 1}/${apiKeys.length}] переключаюсь на запасной API key...`);
      continue;
    }
    if (!keyQuotaExhausted) break;
  }
  throw new Error(formatGeminiError(lastError, apiKeys.length));
}

module.exports = { extractFromImage, normalizeSummary, normalizeTangoCount };
