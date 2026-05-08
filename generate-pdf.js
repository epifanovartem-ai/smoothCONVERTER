const puppeteer = require('puppeteer');
const fs = require('fs');

const leader = JSON.parse(fs.readFileSync('./progressive-leader.json', 'utf8'));
const follower = JSON.parse(fs.readFileSync('./progressive-follower.json', 'utf8'));

function renderTable(data) {
  const columns = [
    { key: 'step', label: 'Шаг' },
    { key: 'footPosition', label: 'Позиция ноги' },
    { key: 'dancePosition', label: 'Танц. поз.' },
    { key: 'alignment', label: 'Направление' },
    { key: 'turn', label: 'Поворот' },
    { key: 'cbm', label: 'ДКТ' },
    { key: 'riseFall', label: 'Подъём и снижение' },
    { key: 'fw', label: 'Работа стопы' },
    { key: 'sway', label: 'Свей' },
    { key: 'summary', label: 'Итого' },
  ];

  const summaryMap = {};
  data.summary.forEach(s => { summaryMap[s.startStep] = s; });

  const headerCells = columns.map(c => `<th>${c.label}</th>`).join('');
  
  const rows = data.steps.map((step, i) => {
    const stepNum = i + 1;
    const cells = columns.slice(0, -1).map(col => {
      const val = step[col.key] || '';
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
    } else if (!Object.values(summaryMap).some(s => stepNum > s.startStep && stepNum < s.startStep + s.rowSpan)) {
      summaryCell = '';
    }

    const rowClass = i % 2 === 0 ? 'even' : 'odd';
    return `<tr class="${rowClass}">${cells}${summaryCell}</tr>`;
  }).join('');

  const notes = data.notes.map((n, i) => `<li>${n}</li>`).join('');

  return `
    <div class="section">
      <div class="header">
        <div>
          <h2>${data.title}</h2>
          <p class="subtitle">${data.subtitle}</p>
        </div>
        <span class="level">${data.level}</span>
      </div>
      <p class="commence">${data.commence}</p>
      <table>
        <thead><tr>${headerCells}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
      ${notes.length ? `<div class="notes"><h4>Примечания:</h4><ol>${notes}</ol></div>` : ''}
    </div>
  `;
}

const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 11px; color: #1a1a2e; padding: 24px; }
  .section { margin-bottom: 32px; }
  .header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 12px; }
  h2 { font-size: 18px; font-weight: 700; }
  .subtitle { color: #666; font-size: 11px; margin-top: 2px; }
  .level { background: #f0ede8; color: #333; font-size: 10px; font-weight: 600; padding: 3px 10px; border-radius: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
  .commence { color: #666; font-size: 11px; margin-bottom: 10px; }
  table { width: 100%; border-collapse: collapse; border: 1px solid #ddd; border-radius: 8px; overflow: hidden; }
  th { background: #2b4c8c; color: #fff; padding: 6px 8px; text-align: left; font-size: 9px; text-transform: uppercase; letter-spacing: 0.4px; font-weight: 600; }
  td { padding: 5px 8px; border-top: 1px solid #eee; vertical-align: top; font-size: 10.5px; }
  tr.odd { background: #f9f8f6; }
  tr.even { background: #fff; }
  .step-num { font-weight: 700; color: #2b4c8c; }
  .count-slow { display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; border-radius: 6px; font-weight: 700; font-size: 10px; background: rgba(43,76,140,0.1); color: #2b4c8c; }
  .count-quick { display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; border-radius: 6px; font-weight: 700; font-size: 10px; background: rgba(210,90,40,0.1); color: #d25a28; }
  .summary-cell { border-left: 1px solid #ddd; font-size: 10.5px; }
  .summary-cell strong { color: #2b4c8c; }
  .notes { margin-top: 12px; padding: 12px; border: 1px solid #eee; border-radius: 8px; background: #fafaf9; }
  .notes h4 { font-size: 11px; margin-bottom: 6px; }
  .notes ol { padding-left: 18px; color: #555; font-size: 10.5px; line-height: 1.5; }
</style>
</head>
<body>
${renderTable(leader)}
${renderTable(follower)}
</body>
</html>`;

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle0' });
  await page.pdf({
    path: './progressive.pdf',
    format: 'A4',
    landscape: true,
    margin: { top: '16mm', bottom: '16mm', left: '12mm', right: '12mm' },
    printBackground: true,
  });
  await browser.close();
  console.log('PDF created: progressive.pdf');
})();
