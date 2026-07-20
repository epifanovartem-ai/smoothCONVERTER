function isFollowerTitle(title) {
  return /партнёрша|follower/i.test(String(title || ''));
}

function isExplicitSharedSource(src) {
  return /leader\s+and\s+follower/i.test(String(src || ''));
}

function headerFromSource(src) {
  const s = String(src || '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!s || /[а-яё]/i.test(s)) return null;
  if (/leader\s+and\s+follower/.test(s)) return 'shared';
  if (/for\s+follower/.test(s)) return 'follower';
  if (/for\s+leader/.test(s)) return 'leader';
  if (/^lead\b/.test(s) || /^lead and/.test(s)) return 'lead';
  if (/^notes\b|^note\b|^примечания/.test(s)) return 'general';
  return null;
}

function detectNotesHeaderFromArtifacts(notes, leadNotes) {
  for (const raw of [...(notes || []), leadNotes]) {
    const t = String(raw || '').trim();
    if (!t || /[а-яё]/i.test(t)) continue;
    if (/^notes\s+for\s+leader\s+and\s+follower|^note\s+for\s+leader\s+and\s+follower/i.test(t)) {
      return 'shared';
    }
    if (/^notes\s+for\s+follower|^note\s+for\s+follower/i.test(t)) return 'follower';
    if (/^notes\s+for\s+leader|^note\s+for\s+leader/i.test(t)) return 'leader';
  }
  return null;
}

function getLeadBlockTitle(notesHeader, hasNotesList, title = '') {
  if (notesHeader === 'lead' || (hasNotesList && (notesHeader === 'leader' || notesHeader === 'follower'))) {
    return 'Ведение:';
  }
  return isFollowerTitle(title) ? 'Примечание для ведомого:' : 'Примечание для ведущего:';
}

function getNotesSectionTitle(notesHeader, _hasLeadNotes, title = '') {
  if (notesHeader === 'shared' || notesHeader === 'leader-and-follower') {
    return 'Примечание для ведущего и ведомого:';
  }
  if (notesHeader === 'leader') return 'Примечание для ведущего:';
  if (notesHeader === 'follower') return 'Примечание для ведомого:';
  if (notesHeader === 'general') return 'Примечания:';
  return isFollowerTitle(title) ? 'Примечание для ведомого:' : 'Примечание для ведущего:';
}

function stripNoteNumber(text) {
  return String(text || '').trim().replace(/^\d+\.\s*/, '');
}

function roleHeader(page) {
  return isFollowerTitle(page.title) ? 'follower' : 'leader';
}

function looksLikeLeadParagraph(text) {
  return /предыдущ|отпускает|левую руку|правую руку|по часовой|закрытую позицию|натяжени|тонус|вытяните левую/i.test(String(text || ''));
}

function looksLikeNoteItem(text) {
  const t = String(text || '').trim();
  if (looksLikeLeadParagraph(t) && t.length > 100) return false;
  return /^на шаге\s*\d|^on step\s*\d|^для альтернативн|^for alternative|fox\s*trot\s*facts|см\.\s*раздел/i.test(t);
}

function partitionLeadAndNotes(page) {
  const leadParts = [];
  const noteParts = [];

  for (const raw of page.notes) {
    const t = stripNoteNumber(String(raw || '').trim());
    if (!t) continue;
    if (looksLikeNoteItem(t)) noteParts.push(t);
    else if (looksLikeLeadParagraph(t)) leadParts.push(t);
    else noteParts.push(t);
  }

  if (leadParts.length) {
    const merged = leadParts.join(' ');
    page.leadNotes = page.leadNotes ? `${page.leadNotes.trim()} ${merged}` : merged;
  }
  page.notes = noteParts;
}

function expandMergedNotes(page) {
  const expanded = [];
  for (const raw of page.notes) {
    const t = String(raw || '').trim();
    if (!t) continue;
    const parts = t
      .split(/(?=\s*\d+\.\s+)/)
      .map(s => stripNoteNumber(s.trim()))
      .filter(s => s.length > 12);
    if (parts.length > 1) expanded.push(...parts);
    else expanded.push(stripNoteNumber(t));
  }
  page.notes = expanded;
}

function pullAlternativeNoteFromLead(page) {
  if (!page.leadNotes) return;
  const re =
    /(?:^|\s)(?:\d+\.\s*)?((?:для альтернативн|for alternative)[\s\S]+)$/i;
  const m = String(page.leadNotes).match(re);
  if (!m) return;
  const note = stripNoteNumber(m[1].trim());
  if (!note) return;
  if (!page.notes.some(n => /альтернативн|fox\s*trot/i.test(n))) page.notes.push(note);
  page.leadNotes = page.leadNotes.replace(re, '').trim();
}

function maybeSwapLeadAndNotes(page) {
  if (!page.leadNotes || !page.notes.length) return;
  const lead = String(page.leadNotes).trim();
  const first = String(page.notes[0] || '').trim();
  if (looksLikeNoteItem(lead) && looksLikeLeadParagraph(first)) {
    page.leadNotes = first;
    page.notes[0] = lead;
  }
}

function repairNotes(page) {
  if (!page.notes) page.notes = [];

  const fromLeadSrc = headerFromSource(page.leadSourceHeader);
  const fromNotesSrc = headerFromSource(page.notesSourceHeader);
  const fromArtifacts = detectNotesHeaderFromArtifacts(page.notes, page.leadNotes);
  const explicitlyShared = isExplicitSharedSource(page.notesSourceHeader) || fromArtifacts === 'shared';

  page.notes = page.notes.filter(n => {
    const t = String(n || '').trim();
    if (!t) return false;
    if (/^примечани[ея]\s+для\s+ведущего\s*:?\s*$/i.test(t)) return false;
    if (/^примечани[ея]\s+для\s+ведомого\s*:?\s*$/i.test(t)) return false;
    if (/^примечани[ея]\s+для\s+ведущего\s+и\s+ведомого\s*:?\s*$/i.test(t)) return false;
    if (/^notes\s+for\s+leader\s*:?\s*$/i.test(t)) return false;
    if (/^notes\s+for\s+follower\s*:?\s*$/i.test(t)) return false;
    if (/^notes\s+for\s+leader\s+and\s+follower\s*:?\s*$/i.test(t)) return false;
    if (/^lead\s*:?\s*$/i.test(t)) return false;
    return true;
  }).map(stripNoteNumber);

  expandMergedNotes(page);
  pullAlternativeNoteFromLead(page);
  maybeSwapLeadAndNotes(page);
  partitionLeadAndNotes(page);

  if (fromNotesSrc === 'shared' && explicitlyShared) {
    page.notesHeader = 'shared';
  } else if (fromNotesSrc === 'follower' || fromArtifacts === 'follower') {
    page.notesHeader = 'follower';
  } else if (fromNotesSrc === 'leader' || fromArtifacts === 'leader') {
    page.notesHeader = 'leader';
  } else if (fromNotesSrc === 'general') {
    page.notesHeader = 'general';
  } else if (page.notes.length > 0) {
    page.notesHeader = roleHeader(page);
  }

  if ((page.notesHeader === 'shared' || page.notesHeader === 'leader-and-follower') && !explicitlyShared) {
    page.notesHeader = roleHeader(page);
  }

  if (page.notesHeader === 'shared' && page.leadNotes) {
    page.notes = [stripNoteNumber(page.leadNotes), ...page.notes];
    page.leadNotes = '';
  }

  if (page.notesHeader === 'leader-and-follower') page.notesHeader = 'shared';

  if (fromNotesSrc === 'lead' && !page.notes.length && page.leadNotes) {
    page.notesHeader = 'lead';
  } else if (page.leadNotes && page.notes.length > 0) {
    page.notesHeader = fromNotesSrc === 'follower' ? 'follower' : roleHeader(page);
  } else if (page.leadNotes) {
    page.notesHeader = 'lead';
  } else if (page.notes.length > 0 && !page.notesHeader) {
    page.notesHeader = roleHeader(page);
  }

  if (fromLeadSrc === 'lead' && page.leadNotes && page.notes.length > 0 && page.notesHeader !== 'shared') {
    page.notesHeader = fromNotesSrc === 'follower' ? 'follower' : roleHeader(page);
  }
}

module.exports = {
  getLeadBlockTitle,
  getNotesSectionTitle,
  repairNotes,
  isFollowerTitle,
  headerFromSource,
  detectNotesHeaderFromArtifacts,
  isExplicitSharedSource,
};
