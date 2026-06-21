import { apiGet, apiPost } from '../api.js';
import { loadActiveCareer } from '../components/career.js';
import { updateTopbar } from '../app.js';
import { pageHead, gameToScorebug, esc } from '../components/ui.js';

export async function render(container) {
  const ctx = await loadActiveCareer(container, 'Schedule');
  if (!ctx) return;
  const { career, team } = ctx;
  const games = await apiGet(`/api/schedule/${career.id}`);

  const userId = team.id;
  const done = career.current_week > 25;

  // Group by week.
  const byWeek = new Map();
  for (const g of games) {
    if (!byWeek.has(g.week)) byWeek.set(g.week, []);
    byWeek.get(g.week).push(g);
  }
  const weekLabel = (w) => (w <= 22 ? `Week ${w}` : w === 23 ? 'Quarterfinals' : w === 24 ? 'Semifinals' : 'State Final');

  const weeksHtml = [...byWeek.keys()].sort((a, b) => a - b).map((w) => {
    const list = byWeek.get(w);
    const isCurrent = w === career.current_week;
    const cards = list.map((g) => {
      const mine = g.home_team_id === userId || g.away_team_id === userId;
      return `<div class="sched-game ${mine ? 'mine' : ''} ${g.played ? 'clickable' : ''}" ${g.played ? `data-box="${g.id}"` : ''}>
        ${gameToScorebug(g)}
        <div class="box-slot" id="box-${g.id}"></div>
      </div>`;
    }).join('');
    return `<section class="week ${isCurrent ? 'current' : ''}">
      <div class="row spread week-head">
        <h3>${weekLabel(w)} ${isCurrent ? '<span class="tag win">Up next</span>' : ''}</h3>
      </div>
      <div class="grid grid-2">${cards}</div>
    </section>`;
  }).join('');

  const actions = done ? '<span class="tag">Season complete</span>' : `
    <button class="btn btn-primary" id="simNext">Simulate next game</button>
    <button class="btn" id="simWeek">Simulate week</button>
    <button class="btn btn-ghost" id="simSeason">Simulate rest of season</button>`;

  container.innerHTML = pageHead('Schedule', `Season ${career.season_year}`, actions) + weeksHtml;

  // Scroll to current week.
  const cur = container.querySelector('.week.current');
  if (cur) cur.scrollIntoView({ block: 'start', behavior: 'instant' in window ? 'instant' : 'auto' });

  async function simAndReload(endpoint) {
    container.querySelectorAll('.page-head button').forEach((b) => { b.disabled = true; });
    try { await apiPost(endpoint, { careerId: career.id }); } catch (e) { console.error(e); }
    render(container);
  }
  const bN = container.querySelector('#simNext');
  const bW = container.querySelector('#simWeek');
  const bS = container.querySelector('#simSeason');
  if (bN) bN.addEventListener('click', () => simAndReload('/api/sim/next'));
  if (bW) bW.addEventListener('click', () => simAndReload('/api/sim/week'));
  if (bS) bS.addEventListener('click', () => simAndReload('/api/sim/season'));

  // Toggle box score on click of a played game.
  container.querySelectorAll('[data-box]').forEach((el) => {
    el.addEventListener('click', async (e) => {
      if (e.target.closest('.box-slot')) return; // don't toggle when interacting inside
      const gid = el.dataset.box;
      const slot = container.querySelector(`#box-${gid}`);
      if (slot.innerHTML) { slot.innerHTML = ''; return; }
      slot.innerHTML = '<div class="spinner"></div>';
      const { teamStats, playerStats } = await apiGet(`/api/sim/box/${career.id}/${gid}`);
      slot.innerHTML = renderBox(teamStats, playerStats);
    });
  });

  // refresh topbar (week may have changed via buttons handled by re-render)
  updateTopbar(career, team);
}

function renderBox(teamStats, playerStats) {
  const teams = [...new Set(playerStats.map((p) => p.team_id))];
  const blocks = teams.map((tid) => {
    const t = teamStats.find((x) => x.team_id === tid);
    const players = playerStats.filter((p) => p.team_id === tid && p.min > 0);
    const rows = players.map((p) => `<tr>
      <td>${esc(p.first[0])}. ${esc(p.last)}</td><td>${p.position}</td>
      <td>${p.pts}</td><td>${p.reb}</td><td>${p.ast}</td>
      <td>${p.fg}-${p.fga}</td><td>${p.threes}-${p.threes_a}</td>
      <td>${p.stl}</td><td>${p.blk}</td><td>${p.tov}</td></tr>`).join('');
    return `<div class="box-team">
      <table class="stat"><thead><tr><th>Player</th><th>Pos</th><th>PTS</th><th>REB</th><th>AST</th><th>FG</th><th>3PT</th><th>S</th><th>B</th><th>TO</th></tr></thead>
      <tbody>${rows}</tbody></table></div>`;
  }).join('');
  return `<div class="box-detail">${blocks}</div>`;
}
