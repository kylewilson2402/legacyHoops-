import { apiGet } from '../api.js';
import { loadActiveCareer } from '../components/career.js';
import { pageHead, esc, emptyState } from '../components/ui.js';

const GRADE_LABEL = { 9: 'Freshman', 10: 'Sophomore', 11: 'Junior', 12: 'Senior' };
const ATTRS = [
  ['shooting', 'Shooting'], ['finishing', 'Finishing'], ['passing', 'Passing'],
  ['defense', 'Defense'], ['rebounding', 'Rebounding'], ['athleticism', 'Athleticism'],
];

export async function render(container, params) {
  const ctx = await loadActiveCareer(container, 'Player Profile');
  if (!ctx) return;
  const playerId = params && params[0];
  if (!playerId) {
    container.innerHTML = pageHead('Player Profile')
      + `<div class="card">${emptyState('👤', 'Open a player from the roster to view their card.', '#/roster', 'Go to roster')}</div>`;
    return;
  }

  const { player: p, team, stats } = await apiGet(`/api/roster/player/${ctx.career.id}/${playerId}`);

  const bars = ATTRS.map(([k, label]) => `
    <div class="attrbar">
      <span class="lbl">${label}</span>
      <span class="track"><span class="fill" style="width:${p[k]}%"></span></span>
      <span class="val">${p[k]}</span>
    </div>`).join('');

  const statBlock = stats.gp > 0 ? `
    <div class="table-wrap"><table class="stat">
      <thead><tr><th>GP</th><th>MPG</th><th>PPG</th><th>RPG</th><th>APG</th><th>SPG</th><th>BPG</th><th>TO</th><th>FG%</th><th>3P%</th></tr></thead>
      <tbody><tr><td>${stats.gp}</td><td>${stats.mpg}</td><td>${stats.ppg}</td><td>${stats.rpg}</td><td>${stats.apg}</td><td>${stats.spg}</td><td>${stats.bpg}</td><td>${stats.tpg}</td><td>${stats.fgPct}</td><td>${stats.threePct}</td></tr></tbody>
    </table></div>`
    : emptyState('📈', 'No games played yet this season. Stats appear once you simulate.');

  container.innerHTML = pageHead(`${p.first} ${p.last}`, `${esc(team.name)}`, `<a class="btn btn-sm" href="#/roster">Back to roster</a>`)
    + `<div class="grid grid-2">
      <div class="card">
        <div class="row spread">
          <div>
            <div class="eyebrow">${esc(p.position)} · ${GRADE_LABEL[p.grade] || 'Grade ' + p.grade}</div>
            <div class="big-num">${p.overall}<span class="muted" style="font-size:1rem"> OVR</span></div>
          </div>
          <div style="text-align:right">
            <div class="muted">Potential</div>
            <div class="big-num" style="color:var(--hardwood-bright)">${p.potential}</div>
          </div>
        </div>
        <div style="margin-top:8px"><span class="tag ${p.is_starter ? 'win' : ''}">${p.is_starter ? 'Starter' : 'Bench'}</span>
          <span class="tag">${p.minutes || 0} min</span></div>
      </div>
      <div class="card"><h3>Attributes</h3>${bars}</div>
    </div>
    <div class="card" style="margin-top:16px"><h3>Season ${ctx.career.season_year} stats</h3>${statBlock}</div>`;
}
