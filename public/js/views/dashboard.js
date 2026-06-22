import { apiGet, apiPost } from '../api.js';
import { loadActiveCareer } from '../components/career.js';
import { pageHead, gameToScorebug, esc, emptyState, toast } from '../components/ui.js';

export async function render(container) {
  const ctx = await loadActiveCareer(container, 'Dashboard');
  if (!ctx) return;
  const { career, team } = ctx;

  const [standings, games, news, leaders] = await Promise.all([
    apiGet(`/api/schedule/${career.id}/standings`),
    apiGet(`/api/schedule/${career.id}`),
    apiGet(`/api/news/${career.id}?limit=4`),
    apiGet(`/api/roster/${career.id}/${team.id}/leaders`),
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
      : (done ? `<div class="empty"><span class="empty-emoji">🏆</span><div>Season ${career.season_year} is in the books.</div>
                 <button class="btn btn-primary" id="dashAdvance">Advance to next season</button></div>`
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

  // Team leaders.
  const leaderRow = (label, p, stat, val) => p
    ? `<div class="news-mini"><span class="tag">${label}</span><a href="#/player/${p.id}">${esc(p.first)} ${esc(p.last)}</a><span class="mono muted" style="margin-left:auto">${val} ${stat}</span></div>`
    : `<div class="news-mini muted">${label}: —</div>`;
  const leadersCard = `<div class="card">
    <div class="eyebrow">Team leaders</div>
    <div class="stack" style="margin-top:8px">
      ${leaders.scorers.length ? leaders.scorers.map((p, i) => leaderRow(i === 0 ? 'PTS' : `#${i + 1}`, p, 'ppg', p.ppg)).join('') : '<div class="news-mini muted">No games played yet.</div>'}
      ${leaders.rebounder ? leaderRow('REB', leaders.rebounder, 'rpg', leaders.rebounder.rpg) : ''}
      ${leaders.assister ? leaderRow('AST', leaders.assister, 'apg', leaders.assister.apg) : ''}
    </div>
  </div>`;

  container.innerHTML = pageHead(`${team.name}`, `Coach ${esc(career.coach_first)} ${esc(career.coach_last)} · ${esc(career.archetype)}`)
    + `<div class="grid grid-3">${recordCard}${lastCard}${nextCard}</div>`
    + `<div class="grid grid-3" style="margin-top:16px">${progress}${leadersCard}${newsWidget}</div>`;

  const ds = container.querySelector('#dashSim');
  if (ds) ds.addEventListener('click', async () => {
    ds.disabled = true; ds.textContent = 'Simulating…';
    try {
      const r = await apiPost('/api/sim/next', { careerId: career.id });
      if (r.recap) toast(`${r.recap.away.abbrev} ${r.recap.away.score} — ${r.recap.home.score} ${r.recap.home.abbrev}`, 'win');
    } catch (e) { toast(e.message, 'error'); }
    render(container);
  });

  const adv = container.querySelector('#dashAdvance');
  if (adv) adv.addEventListener('click', async () => {
    adv.disabled = true; adv.textContent = 'Running offseason…';
    try {
      const summary = await apiPost(`/api/careers/${career.id}/advance`, {});
      renderOffseason(container, summary, career.season_year);
    } catch (e) { adv.disabled = false; adv.textContent = 'Advance to next season'; toast(e.message, 'error'); }
  });
}

// Offseason recap screen shown after advancing a season.
function renderOffseason(container, s, prevYear) {
  const dev = s.developed.length
    ? s.developed.slice(0, 10).map((p) => `<tr><td>${esc(p.name)}</td><td>${p.position}</td><td>${p.before}→<strong>${p.after}</strong></td><td class="pos">+${p.delta}</td></tr>`).join('')
    : '<tr><td colspan="4" class="muted">No notable improvements.</td></tr>';
  const grad = s.graduated.length
    ? s.graduated.map((p) => `<li>${esc(p.name)} <span class="muted">(${p.position})</span></li>`).join('')
    : '<li class="muted">No seniors graduated.</li>';
  const sign = s.signed.length
    ? s.signed.map((p) => `<li>${esc(p.name)} <span class="muted">(${p.position}) OVR ${p.overall} · POT ${p.potential}</span></li>`).join('')
    : '<li class="muted">No recruits signed this cycle.</li>';

  container.innerHTML = pageHead(`Offseason — Season ${prevYear} → ${s.season_year}`, `Coaching reputation: ${s.reputation}`)
    + `<div class="grid grid-2">
        <div class="card"><h3>Player development</h3>
          <div class="table-wrap"><table class="stat"><thead><tr><th>Player</th><th>Pos</th><th>OVR</th><th>Δ</th></tr></thead><tbody>${dev}</tbody></table></div>
        </div>
        <div class="stack">
          <div class="card"><h3>Graduated seniors</h3><ul class="plain">${grad}</ul></div>
          <div class="card"><h3>Incoming freshmen</h3><ul class="plain">${sign}</ul></div>
        </div>
      </div>
      <div class="row" style="margin-top:18px"><button class="btn btn-primary" id="contSeason">Start Season ${s.season_year}</button></div>`;

  container.querySelector('#contSeason').addEventListener('click', () => render(container));
}
