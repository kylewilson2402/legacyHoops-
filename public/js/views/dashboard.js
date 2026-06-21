import { apiGet, apiPost } from '../api.js';
import { loadActiveCareer } from '../components/career.js';
import { pageHead, gameToScorebug, esc, emptyState } from '../components/ui.js';

export async function render(container) {
  const ctx = await loadActiveCareer(container, 'Dashboard');
  if (!ctx) return;
  const { career, team } = ctx;

  const [standings, games, news] = await Promise.all([
    apiGet(`/api/schedule/${career.id}/standings`),
    apiGet(`/api/schedule/${career.id}`),
    apiGet(`/api/news/${career.id}?limit=4`),
  ]);

  const me = standings.find((s) => s.team_id === team.id) || { wins: 0, losses: 0, rank: '-', diff: 0, streak: 0 };
  const myGames = games.filter((g) => g.home_team_id === team.id || g.away_team_id === team.id);
  const lastPlayed = [...myGames].filter((g) => g.played).pop();
  const next = myGames.find((g) => !g.played);
  const done = career.current_week > 25;

  const recordCard = `<div class="card">
    <div class="eyebrow">Record</div>
    <div class="big-num">${me.wins}<span class="muted" style="font-size:1.2rem">–${me.losses}</span></div>
    <div class="row" style="margin-top:8px">
      <span class="tag">Rank #${me.rank}</span>
      <span class="tag ${me.diff > 0 ? 'win' : me.diff < 0 ? 'loss' : ''}">${me.diff > 0 ? '+' : ''}${me.diff} diff</span>
      ${me.streak ? `<span class="tag ${me.streak > 0 ? 'win' : 'loss'}">${me.streak > 0 ? 'W' : 'L'}${Math.abs(me.streak)}</span>` : ''}
    </div>
  </div>`;

  const lastCard = `<div class="card">
    <div class="eyebrow">Last result</div>
    ${lastPlayed ? gameToScorebug(lastPlayed) : emptyState('🏀', 'No games played yet — simulate to get started.')}
  </div>`;

  const nextCard = `<div class="card">
    <div class="eyebrow">Next up</div>
    ${next ? gameToScorebug(next)
      : (done ? emptyState('🏆', 'Season complete. Advance to the next season from Settings (coming soon).')
              : emptyState('🗓️', 'No upcoming games scheduled.'))}
    ${next && !done ? `<div class="row" style="margin-top:14px"><button class="btn btn-primary" id="dashSim">Simulate next game</button></div>` : ''}
  </div>`;

  // Season progress.
  const totalMy = myGames.length;
  const playedMy = myGames.filter((g) => g.played).length;
  const pct = totalMy ? Math.round((playedMy / totalMy) * 100) : 0;
  const progress = `<div class="card">
    <div class="row spread"><div class="eyebrow">Season progress</div><span class="mono muted">${playedMy}/${totalMy} games</span></div>
    <div class="track" style="height:10px;background:var(--court);border-radius:999px;margin-top:8px;overflow:hidden">
      <div class="fill" style="height:100%;width:${pct}%;background:linear-gradient(90deg,var(--hardwood),var(--hardwood-bright))"></div>
    </div>
  </div>`;

  const newsWidget = `<div class="card">
    <div class="row spread"><div class="eyebrow">Recent news</div><a class="muted" href="#/news" style="font-size:.8rem">All news →</a></div>
    ${news.items.length ? `<div class="stack" style="margin-top:8px">${news.items.map((n) => `
      <div class="news-mini">
        <span class="tag ${n.category === 'Upset' ? 'loss' : n.category === 'Championship' ? 'win' : ''}">${esc(n.category)}</span>
        <span>${esc(n.headline)}</span>
      </div>`).join('')}</div>`
      : emptyState('📰', 'No news yet — simulate to make headlines.')}
  </div>`;

  container.innerHTML = pageHead(`${team.name}`, `Coach ${esc(career.coach_first)} ${esc(career.coach_last)} · ${esc(career.archetype)}`)
    + `<div class="grid grid-3">${recordCard}${lastCard}${nextCard}</div>`
    + `<div class="grid grid-2" style="margin-top:16px">${progress}${newsWidget}</div>`;

  const ds = container.querySelector('#dashSim');
  if (ds) ds.addEventListener('click', async () => {
    ds.disabled = true; ds.textContent = 'Simulating…';
    try { await apiPost('/api/sim/next', { careerId: career.id }); } catch (e) { console.error(e); }
    render(container);
  });
}
