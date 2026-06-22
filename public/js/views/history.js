import { apiGet } from '../api.js';
import { loadActiveCareer } from '../components/career.js';
import { pageHead, esc, emptyState } from '../components/ui.js';

export async function render(container) {
  const ctx = await loadActiveCareer(container, 'League History');
  if (!ctx) return;
  const { career } = ctx;
  const { champions, dynasty, totals } = await apiGet(`/api/history/${career.id}`);

  const summary = `<div class="grid grid-3">
    <div class="card"><div class="eyebrow">All-time record</div><div class="big-num">${totals.wins}<span class="muted" style="font-size:1.1rem">–${totals.losses}</span></div></div>
    <div class="card"><div class="eyebrow">State titles</div><div class="big-num" style="color:var(--hardwood-bright)">${totals.titles}</div></div>
    <div class="card"><div class="eyebrow">Playoff trips</div><div class="big-num">${totals.playoffs}</div>${totals.bestRank ? `<div class="muted">Best finish: #${totals.bestRank}</div>` : ''}</div>
  </div>`;

  const champRows = champions.length
    ? champions.map((c) => `<tr>
        <td>${c.year}</td>
        <td><span class="dot" style="background:${esc(c.color_primary || 'var(--line)')}"></span>${esc(c.name || 'TBD')}</td>
      </tr>`).join('')
    : `<tr><td colspan="2" class="muted">No champions crowned yet.</td></tr>`;

  const dynRows = dynasty.length
    ? dynasty.map((h) => `<tr ${h.won_championship ? 'class="me"' : ''}>
        <td>${h.season_year}</td>
        <td>${h.wins}–${h.losses}</td>
        <td>${h.made_playoffs ? '<span class="pos">Yes</span>' : '<span class="muted">No</span>'}</td>
        <td>${h.won_championship ? '<span class="tag win">Champions</span>' : (h.final_rank ? '#' + h.final_rank : '—')}</td>
      </tr>`).join('')
    : `<tr><td colspan="4" class="muted">Finish a season to start your dynasty timeline.</td></tr>`;

  container.innerHTML = pageHead('League History', `${esc(career.coach_first)} ${esc(career.coach_last)} — coaching reputation ${career.reputation}`)
    + summary
    + `<div class="grid grid-2" style="margin-top:16px">
        <div class="card"><h3>Champions by year</h3>
          <div class="table-wrap"><table class="stat"><thead><tr><th>Year</th><th>Champion</th></tr></thead><tbody>${champRows}</tbody></table></div>
        </div>
        <div class="card"><h3>Your dynasty</h3>
          <div class="table-wrap"><table class="stat standings"><thead><tr><th>Year</th><th>Record</th><th>Playoffs</th><th>Finish</th></tr></thead><tbody>${dynRows}</tbody></table></div>
        </div>
      </div>`;
}
