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

function isAndCountStep(step) {
  const c = String(step?.count ?? '').trim().toLowerCase();
  const b = String(step?.beats ?? '').trim();
  return c === 'и' || c === '&' || b === '&';
}

function isSlow(step) { return rhythmFromStep(step) === 'S' && !isAndCountStep(step); }
function isQuick(step) { return rhythmFromStep(step) === 'Q'; }

function isCombinedStepRow(step) {
  return /\d\s*[-–]\s*\d/.test(String(step?.step ?? ''));
}

function buildStepNumberToRowIndex(steps) {
  const map = new Map();
  steps.forEach((st, rowIdx) => {
    const s = String(st.step ?? '').trim();
    const range = s.match(/^(\d+)\s*[-–]\s*(\d+)$/);
    if (range) {
      for (let n = +range[1]; n <= +range[2]; n++) map.set(n, rowIdx);
    } else {
      const n = parseInt(s, 10);
      if (!isNaN(n)) map.set(n, rowIdx);
    }
  });
  return map;
}

function rowIndexForStepNumber(steps, stepNum) {
  const map = buildStepNumberToRowIndex(steps);
  if (map.has(stepNum)) return map.get(stepNum);
  const idx = steps.findIndex(st => String(st.step) === String(stepNum));
  if (idx >= 0) return idx;
  return null;
}

function normalizeSummaryToRows(steps, summary) {
  return (summary || []).map(s => {
    const danceStart = Number(s.startStep) || 1;
    const danceEnd = danceStart + Math.max(1, Number(s.rowSpan) || 1) - 1;
    const rowStart = rowIndexForStepNumber(steps, danceStart);
    const rowEnd = rowIndexForStepNumber(steps, danceEnd);
    if (rowStart == null) return s;
    return {
      ...s,
      startStep: rowStart + 1,
      rowSpan: (rowEnd != null ? rowEnd : rowStart) - rowStart + 1,
    };
  });
}

function normalizeLabel(label, fallback) {
  const l = String(label || '').trim();
  const compact = l.toUpperCase().replace(/\s+/g, '');

  if (/SSQQ&S|ММББ&М/.test(compact)) return 'ММББ&М:';
  if (/^QQS|^ББМ/.test(compact)) return 'ББМ:';
  if (/^SQQ|^МББ/.test(compact)) return 'МББ:';
  if (/^SSQQ/.test(compact)) return 'ММББ:';
  if (/^SS|^ММ/.test(compact)) return 'ММ:';
  if (/^QQ|^ББ/.test(compact) && !/^QQS|^ББМ/.test(compact)) return 'ББ:';

  if (/^(S|М):?$/i.test(l)) return fallback || 'ММ:';

  if (l && !l.endsWith(':')) return l + ':';
  return l || fallback;
}

function inferredRhythmLabel(steps, startStep, rowSpan) {
  const i = startStep - 1;
  if (rowSpan === 2 && i >= 0 && i + 1 < steps.length && isSlow(steps[i]) && isSlow(steps[i + 1])) {
    return 'ММ:';
  }
  if (rowSpan === 3 && i + 2 < steps.length) {
    if (isQuick(steps[i]) && isQuick(steps[i + 1]) && isSlow(steps[i + 2])) return 'ББМ:';
    if (isSlow(steps[i]) && isQuick(steps[i + 1]) && isQuick(steps[i + 2])) return 'МББ:';
  }
  return '';
}

function inferSlowFoxRhythmGroups(steps) {
  const groups = [];
  let i = 0;
  while (i < steps.length) {
    if (i + 1 < steps.length && isSlow(steps[i]) && isSlow(steps[i + 1])) {
      groups.push({ startStep: i + 1, rowSpan: 2, label: 'ММ:' });
      i += 2;
    } else if (i + 1 < steps.length && isQuick(steps[i]) && isQuick(steps[i + 1])) {
      groups.push({ startStep: i + 1, rowSpan: 2, label: 'ББ:' });
      i += 2;
    } else {
      return null;
    }
  }
  return groups.length ? groups : null;
}

function inferTangoRhythmGroups(steps) {
  const groups = [];
  let i = 0;
  while (i < steps.length) {
    if (isCombinedStepRow(steps[i])) {
      groups.push({ startStep: i + 1, rowSpan: 1, label: '' });
      i += 1;
    } else if (i + 1 < steps.length && isSlow(steps[i]) && isSlow(steps[i + 1])) {
      groups.push({ startStep: i + 1, rowSpan: 2, label: 'ММ:' });
      i += 2;
    } else if (
      i + 2 < steps.length &&
      isQuick(steps[i]) &&
      isQuick(steps[i + 1]) &&
      (isSlow(steps[i + 2]) || isAndCountStep(steps[i + 2]))
    ) {
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

function assignDescriptions(groups, rawSummaries, steps) {
  const sorted = [...rawSummaries].sort((a, b) => a.startStep - b.startStep);
  const assigned = groups.map(() => null);

  for (let i = 0; i < groups.length; i++) {
    const m = sorted.find(s => s.startStep === groups[i].startStep);
    if (m) assigned[i] = m;
  }

  const used = new Set(assigned.filter(Boolean));
  const leftover = sorted.filter(s => !used.has(s));
  let li = 0;
  for (let i = 0; i < groups.length && li < leftover.length; i++) {
    if (!assigned[i]) assigned[i] = leftover[li++];
  }

  return groups.map((g, i) => ({
    startStep: g.startStep,
    rowSpan: g.rowSpan,
    label: normalizeLabel(assigned[i]?.label, g.label || inferredRhythmLabel(steps, g.startStep, g.rowSpan)),
    desc: cleanSummaryDesc(assigned[i]?.desc || g.desc || ''),
  }));
}

function clampSummaryPartition(summary, stepCount) {
  const sorted = [...summary].sort((a, b) => a.startStep - b.startStep);
  const out = [];
  let pos = 1;
  for (const s of sorted) {
    if (s.startStep > pos) break;
    const start = Math.max(s.startStep, pos);
    const span = Math.min(s.rowSpan, stepCount - start + 1);
    if (span <= 0) continue;
    out.push({ ...s, startStep: start, rowSpan: span });
    pos = start + span;
    if (pos > stepCount) break;
  }
  return out;
}

function hasSummaryOverlaps(summary) {
  const sorted = [...summary].sort((a, b) => a.startStep - b.startStep);
  let pos = 1;
  for (const s of sorted) {
    if (s.startStep < pos) return true;
    if (s.startStep > pos) return false;
    pos = s.startStep + s.rowSpan;
  }
  return false;
}

function sanitizeSummary(summary, stepCount) {
  const clamped = clampSummaryPartition(summary, stepCount);
  if (summaryCoversAllSteps(clamped, stepCount)) return clamped;
  if (summaryCoversAllSteps(summary, stepCount) && !hasSummaryOverlaps(summary)) return summary;
  return clamped;
}

function isInsideSummarySpan(stepNum, summary) {
  return (summary || []).some(s =>
    stepNum > s.startStep && stepNum < s.startStep + (s.rowSpan || 1),
  );
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

function isSlowGroupLabel(label) {
  return /^ММ?:|^SS?:?/i.test(String(label || '').trim());
}

function repairAndStepSummary(steps, summary) {
  if (!summary?.length) return summary;
  return summary.map(s => {
    if (!isSlowGroupLabel(s.label)) return { ...s };
    let start = s.startStep;
    let span = s.rowSpan;
    while (span > 0 && start <= steps.length && isAndCountStep(steps[start - 1])) {
      start += 1;
      span -= 1;
    }
    return span > 0 ? { ...s, startStep: start, rowSpan: span } : null;
  }).filter(Boolean);
}

function polishSummaryLabels(summary, steps) {
  return summary.map(s => ({
    ...s,
    label: normalizeLabel(s.label, inferredRhythmLabel(steps, s.startStep, s.rowSpan)),
  }));
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

  const normalized = normalizeSummaryToRows(page.steps, raw);
  const rowCount = page.steps.length;

  if (danceType === 'slow-fox') {
    const inferred = inferSlowFoxRhythmGroups(page.steps);
    if (inferred) {
      page.summary = assignDescriptions(inferred, normalized, page.steps);
      return page;
    }
    page.summary = sanitizeSummary(normalized, rowCount);
    return page;
  }

  if (danceType !== 'tango') {
    page.summary = sanitizeSummary(normalized, rowCount);
    return page;
  }

  const inferred = inferTangoRhythmGroups(page.steps);
  if (inferred) {
    page.summary = assignDescriptions(inferred, normalized, page.steps);
    return page;
  }

  const repaired = repairAndStepSummary(page.steps, normalized);
  page.summary = polishSummaryLabels(sanitizeSummary(repaired, rowCount), page.steps);
  return page;
}

module.exports = {
  repairPageSummary,
  inferSlowFoxRhythmGroups,
  inferTangoRhythmGroups,
  normalizeSummaryToRows,
  summaryCoversAllSteps,
  buildGroupByStep,
  rhythmFromStep,
  isInsideSummarySpan,
  sanitizeSummary,
};
