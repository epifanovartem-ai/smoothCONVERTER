const puppeteer = require('puppeteer');
const { repairPageSummary, buildGroupByStep } = require('./summary-groups');

function renderTable(data, danceType = 'slow-waltz') {
  const isTango = danceType === 'tango';
  if (isTango) repairPageSummary(data, danceType);
  const columns = [
    { key: 'step', label: 'Шаг' },
    { key: 'footPosition', label: 'Позиция ноги' },
    { key: 'dancePosition', label: 'Танц. поз.' },
    { key: 'alignment', label: 'Направление' },
    { key: 'turn', label: 'Поворот' },
    { key: 'cbm', label: 'ДКТ' },
    { key: 'riseFall', label: 'Подъём и снижение' },
    { key: 'fw', label: 'Работа стопы' },
    { key: 'count', label: 'Ритм' },
    isTango ? { key: 'beats', label: 'Счёт' } : { key: 'sway', label: 'Свей' },
  ];

  const summaryMap = {};
  (data.summary || []).forEach(s => { summaryMap[s.startStep] = s; });
  const groupByStep = buildGroupByStep(data.summary);

  const hasSummary = (data.summary || []).length > 0;
  const headerCells = columns.map(c => `<th>${c.label}</th>`).join('') +
    (hasSummary ? '<th>Итого</th>' : '');

  const rows = data.steps.map((step, i) => {
    const stepNum = i + 1;
    const cells = columns.map(col => {
      const val = step[col.key] ?? '';
      if (col.key === 'count') {
        const cls = val === 'М' ? 'count-slow' : 'count-quick';
        return `<td><span class="${cls}">${val}</span></td>`;
      }
      if (col.key === 'step') return `<td class="step-num">${val}</td>`;
      return `<td>${val}</td>`;
    }).join('');

    let summaryCell = '';
    const sum = summaryMap[stepNum];
    if (sum) {
      summaryCell = `<td rowspan="${sum.rowSpan}" class="summary-cell"><strong>${sum.label}</strong><br/>${sum.desc}</td>`;
    }

    const groupIdx = groupByStep[stepNum] ?? 0;
    return `<tr class="${groupIdx % 2 === 0 ? 'odd' : 'even'}">${cells}${summaryCell}</tr>`;
  }).join('');

  const notes = (data.notes || []).map(n => `<li>${n}</li>`).join('');
  const leadBlock = data.leadNotes ? `<div class="notes"><h4>Ведущий:</h4><p>${data.leadNotes}</p></div>` : '';

  return `
    <div class="section">
      <div class="header">
        <div>
          <h2>${data.title || ''}</h2>
          ${data.subtitle && !/бронз|серебр|золот|bronze|silver|gold/i.test(data.subtitle) ? `<p class="subtitle">${data.subtitle}</p>` : ''}
        </div>
        
      </div>
      ${data.commence ? `<p class="commence">${data.commence}</p>` : ''}
      <table>
        <thead><tr>${headerCells}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
      ${leadBlock}
      ${notes ? `<div class="notes"><h4>Примечания:</h4><ol>${notes}</ol></div>` : ''}
    </div>
  `;
}

function buildHtml(pages, danceType = 'slow-waltz') {
  const sections = pages.map(p => renderTable(p, danceType)).join('');
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 13px; color: #1a1a2e; padding: 28px; background: #fff; }
  .section { margin-bottom: 36px; }
  .section:last-child { margin-bottom: 0; }
  .header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 14px; }
  h2 { font-size: 22px; font-weight: 700; }
  .subtitle { color: #666; font-size: 12px; margin-top: 3px; }
  .level { background: #f0ede8; color: #333; font-size: 11px; font-weight: 600; padding: 4px 12px; border-radius: 14px; text-transform: uppercase; letter-spacing: 0.5px; }
  .commence { color: #666; font-size: 13px; margin-bottom: 12px; }
  table { width: 100%; border-collapse: collapse; border: 1px solid #ddd; border-radius: 10px; overflow: hidden; }
  th { background: #2b4c8c; color: #fff; padding: 8px 10px; text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600; }
  td { padding: 7px 10px; border-top: 1px solid #eee; vertical-align: top; font-size: 12px; }
  tr.odd { background: #e8e6e1; }
  tr.even { background: #fff; }
  .step-num { font-weight: 700; color: #2b4c8c; }
  .count-slow, .count-quick { display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px; border-radius: 7px; font-weight: 700; font-size: 12px; }
  .count-slow { background: rgba(43,76,140,0.12); color: #2b4c8c; }
  .count-quick { background: rgba(210,90,40,0.12); color: #d25a28; }
  .summary-cell { border-left: 1px solid #ddd; }
  .summary-cell strong { color: #2b4c8c; }
  .notes { margin-top: 14px; padding: 14px; border: 1px solid #eee; border-radius: 10px; background: #fafaf9; }
  .notes h4 { font-size: 12px; margin-bottom: 8px; }
  .notes ol { padding-left: 20px; color: #555; font-size: 12px; line-height: 1.55; }
  .notes p { color: #555; font-size: 12px; line-height: 1.55; }
</style></head>
<body><div id="content">${sections}</div></body></html>`;
}

async function renderPng(pages, danceType = 'slow-waltz') {
  const html = buildHtml(pages, danceType);
  const browser = await puppeteer.launch({ headless: 'new' });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 800, deviceScaleFactor: 2 });
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const element = await page.$('#content');
    const buffer = await element.screenshot({ type: 'png', omitBackground: false });
    return buffer;
  } finally {
    await browser.close();
  }
}

module.exports = { renderPng, buildHtml };
