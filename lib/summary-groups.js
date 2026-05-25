function rhythmFromStep(step) {
  const c = String(step?.count ?? '').trim();
  const u = c.toUpperCase();
  if (u === 'М' || u === 'S' || u === 'SLOW' || u === 'МЕДЛ') return 'S';
  if (u === 'Б' || u === 'Q' || u === 'QUICK' || u === 'КВ') return 'Q';
  if (/,/.test(c)) return 'S';
  const beat = String(step?.beats ?? '').trim();
  if (/,/.test(beat)) return 'S';
  if (/^\d+$/.test(c) || /^\d+$/.test(beat)) return 'Q';
  return '';
}

function isSlow(step) { return rhythmFromStep(step) === 'S'; }
function isQuick(step) { return rhythmFromStep(step) === 'Q'; }

function normalizeLabel(label, fallback) {
  const l = String(label || '').trim();
  if (/^SS|^ММ/i.test(l)) return 'ММ:';
  if (/^QQS|^ББМ/i.test(l)) return 'ББМ:';
  if (/^SQQ|^МББ/i.test(l)) return 'МББ:';
  if (/^QQ|^ББ/i.test(l) && !/^QQS|^ББМ/i.test(l)) return 'ББ:';
  if (l && !l.endsWith(':')) return l + ':';
  return l || fallback;
}

function inferTangoRhythmGroups(steps) {
  const groups = [];
  let i = 0;
  while (i < steps.length) {
    if (i + 1 < steps.length && isSlow(steps[i]) && isSlow(steps[i + 1])) {
      groups.push({ startStep: i + 1, rowSpan: 2, label: 'ММ:' });
      i += 2;
    } else if (i + 2 < steps.length && isQuick(steps[i]) && isQuick(steps[i + 1]) && isSlow(steps[i + 2])) {
      groups.push({ startStep: i + 1, rowSpan: 3, label: 'ББМ:' });
      i += 3;
    } else {
      return null;
    }
  }
  return groups.length ? groups : null;
}

function cleanSummaryDesc(desc) {
  const d = String(desc || '').trim();
  const parts = d.split(/\s*\/\s*/).map(p => p.trim()).filter(Boolean);
  if (parts.length <= 1) return d;
  const text = parts.find(p => !/^[\d,.\s]+$/.test(p));
  return text || parts[parts.length - 1];
}

function buildGroupByStep(summary) {
  const map = {};
  (summary || []).forEach((s, groupIdx) => {
    const span = s.rowSpan || 1;
    for (let j = 0; j < span; j++) map[s.startStep + j] = groupIdx;
  });
  return map;
}

function assignDescriptions(groups, rawSummaries) {
  const sorted = [...rawSummaries].sort((a, b) => a.startStep - b.startStep);
  const assigned = groups.map(() => null);

  for (let i = 0; i < groups.length; i++) {
    const m = sorted.find(s => s.startStep === groups[i].startStep);
    if (m) assigned[i] = m;
  }

  const used = new Set(assigned.filter(Boolean));
  const leftover = sorted.filter(s => !used.has(s));
  const openIdx = groups.map((_, i) => i).filter(i => !assigned[i]);

  for (let j = 0; j < Math.min(leftover.length, openIdx.length); j++) {
    assigned[openIdx[j]] = leftover[j];
  }

  return groups.map((g, i) => ({
    startStep: g.startStep,
    rowSpan: g.rowSpan,
    label: normalizeLabel(assigned[i]?.label, g.label),
    desc: cleanSummaryDesc(assigned[i]?.desc || g.desc || ''),
  }));
}

function summaryCoversAllSteps(summary, stepCount) {
  if (!summary.length) return false;
  const sorted = [...summary].sort((a, b) => a.startStep - b.startStep);
  let pos = 1;
  for (const s of sorted) {
    if (s.startStep !== pos) return false;
    pos += s.rowSpan;
  }
  return pos === stepCount + 1;
}

function repairPageSummary(page, danceType = 'slow-waltz') {
  if (!page.steps?.length) {
    page.summary = [];
    return page;
  }

  const raw = (page.summary || [])
    .filter(s => s && (String(s.label || '').trim() || String(s.desc || '').trim()))
    .map(s => ({
      label: String(s.label || '').trim(),
      desc: String(s.desc || '').trim(),
      rowSpan: Math.max(1, Number(s.rowSpan) || 1),
      startStep: Number(s.startStep) || 1,
    }));

  if (danceType !== 'tango') {
    page.summary = raw;
    return page;
  }

  const inferred = inferTangoRhythmGroups(page.steps);
  if (!inferred) {
    page.summary = raw;
    return page;
  }

  page.summary = assignDescriptions(inferred, raw);
  return page;
}

module.exports = {
  repairPageSummary,
  inferTangoRhythmGroups,
  summaryCoversAllSteps,
  buildGroupByStep,
  rhythmFromStep,
};
