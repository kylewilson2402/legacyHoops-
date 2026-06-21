import { apiGet } from '../api.js';
import { loadActiveCareer } from '../components/career.js';
import { pageHead, esc } from '../components/ui.js';

const COLS = [
  { key: 'rank', label: '#' },
  { key: 'name', label: 'Team' },
  { key: 'wins', label: 'W' },
  { key: 'losses', label: 'L' },
  { key: 'win_pct', label: 'PCT' },
  { key: 'pf', label: 'PF' },
  { key: 'pa', label: 'PA' },
  { key: 'diff', label: 'DIFF' },
  { key: 'streak', label: 'STRK' },
];

export async function render(container) {
  const ctx = await loadActiveCareer(container, 'Standings');
  if (!ctx) return;
  const rows = await apiGet(`/api/schedule/${ctx.career.id}/standings`);

  let sortKey = 'rank';
  let sortDir = 1;

  function streakTxt(s) {
    if (!s) return '—';
    return `<span class="${s > 0 ? 'pos' : 'neg'}">${s > 0 ? 'W' : 'L'}${Math.abs(s)}</span>`;
  }

  function draw() {
    const sorted = [...rows].sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey];
      if (av < bv) return -1 * sortDir;
      if (av > bv) return 1 * sortDir;
      return 0;
    });
    const body = sorted.map((r) => {
      const top8 = r.rank <= 8;
      return `<tr class="${r.is_user_team ? 'me' : ''}">
        <td>${r.rank}${top8 ? '' : ''}</td>
        <td><span class="dot" style="background:${esc(r.color_primary)}"></span>${esc(r.name)}${r.is_user_team ? ' <span class="tag">You</span>' : ''}</td>
        <td>${r.wins}</td><td>${r.losses}</td>
        <td>${r.win_pct.toFixed(3).replace(/^0/, '')}</td>
        <td>${r.pf}</td><td>${r.pa}</td>
        <td class="${r.diff > 0 ? 'pos' : r.diff < 0 ? 'neg' : ''}">${r.diff > 0 ? '+' : ''}${r.diff}</td>
        <td>${streakTxt(r.streak)}</td>
      </tr>`;
    }).join('');
    const head = COLS.map((c) => `<th data-sort="${c.key}">${c.label}${sortKey === c.key ? (sortDir < 0 ? ' ▾' : ' ▴') : ''}</th>`).join('');
    container.querySelector('#stCard').innerHTML =
      `<div class="table-wrap"><table class="stat standings"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>
       <p class="muted" style="margin-top:10px">Top 8 seeds make the State Championship Tournament.</p>`;
    container.querySelectorAll('th[data-sort]').forEach((th) => th.addEventListener('click', () => {
      const k = th.dataset.sort;
      if (sortKey === k) sortDir *= -1; else { sortKey = k; sortDir = (k === 'name' || k === 'rank') ? 1 : -1; }
      draw();
    }));
  }

  container.innerHTML = pageHead('Standings', `Season ${ctx.career.season_year} — league table`)
    + `<div class="card" id="stCard"></div>`;
  draw();
}
