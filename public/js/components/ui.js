// Small render helpers shared across views. Kept dependency-free.

// Escape user/data strings before injecting into innerHTML.
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// Standard page header.
export function pageHead(title, sub, actionsHtml = '') {
  return `<div class="page-head">
    <div><div class="eyebrow">Legacy Hoops</div><h1>${esc(title)}</h1>
      ${sub ? `<p class="sub">${esc(sub)}</p>` : ''}</div>
    <div class="row">${actionsHtml}</div>
  </div>`;
}

// Empty state with optional directing CTA.
export function emptyState(emoji, text, ctaHref, ctaLabel) {
  return `<div class="empty">
    <span class="empty-emoji">${emoji}</span>
    <div>${esc(text)}</div>
    ${ctaHref ? `<a class="btn btn-primary" href="${ctaHref}">${esc(ctaLabel)}</a>` : ''}
  </div>`;
}

// Placeholder used by Phase 1 stubs.
export function placeholder(container, title, note) {
  container.innerHTML = pageHead(title, note || 'Coming together phase by phase.')
    + `<div class="card">${emptyState('🏀', note || 'This page is wired up and ready for data.')}</div>`;
}

// Broadcast scorebug. game = { homeAbbr, awayAbbr, homeName, awayName,
//   homeScore, awayScore, homeColor, awayColor, tag, homeWin, awayWin }
export function scorebug(g) {
  const final = g.homeScore != null && g.awayScore != null;
  return `<div class="scorebug">
    <div class="sb-team away">
      <span class="sb-bar" style="--team:${esc(g.awayColor || 'var(--hardwood)')}"></span>
      <span><span class="sb-abbr ${g.awayWin ? 'sb-win' : ''}">${esc(g.awayAbbr)}</span>
        <span class="sb-name">${esc(g.awayName || '')}</span></span>
      <span class="sb-score">${final ? g.awayScore : '–'}</span>
    </div>
    <div class="sb-mid"><span class="sb-tag">${esc(g.tag || (final ? 'FINAL' : 'VS'))}</span></div>
    <div class="sb-team home">
      <span class="sb-bar" style="--team:${esc(g.homeColor || 'var(--hardwood)')}"></span>
      <span><span class="sb-abbr ${g.homeWin ? 'sb-win' : ''}">${esc(g.homeAbbr)}</span>
        <span class="sb-name">${esc(g.homeName || '')}</span></span>
      <span class="sb-score">${final ? g.homeScore : '–'}</span>
    </div>
  </div>`;
}
