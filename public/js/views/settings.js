import { apiGet, apiPost, apiDelete } from '../api.js';
import { state } from '../state.js';
import { updateTopbar } from '../app.js';
import { pageHead, esc, emptyState } from '../components/ui.js';

export async function render(container) {
  const careers = await apiGet('/api/careers');
  const activeId = state.careerId;
  const active = careers.find((c) => c.id === activeId) || null;

  const seasonDone = active && active.current_week > 25;

  const advanceCard = active ? `<div class="card">
    <h3>Season</h3>
    ${seasonDone
      ? `<p class="muted">Season ${active.season_year} is complete. Run the offseason to develop players, graduate seniors, and sign your recruits.</p>
         <button class="btn btn-primary" id="advance">Advance to next season</button>`
      : `<p class="muted">Season ${active.season_year} is in progress (Week ${active.current_week}). Finish it from the Schedule, then return here to advance.</p>`}
    <p class="muted" id="advMsg" style="color:var(--foul)"></p>
  </div>` : '';

  const careerList = careers.length ? `<div class="grid grid-auto">${careers.map((c) => `
    <div class="card ${c.id === activeId ? 'me' : ''}">
      <div class="row spread">
        <div><strong>${esc(c.team ? c.team.name : 'Unnamed')}</strong>
          <div class="muted">Coach ${esc(c.coach)} · S${c.season_year} · ${c.wins}–${c.losses}</div></div>
      </div>
      <div class="row" style="margin-top:12px">
        ${c.id === activeId ? '<span class="tag win">Active</span>' : `<button class="btn btn-sm btn-primary" data-load="${c.id}">Load</button>`}
        <button class="btn btn-sm btn-danger" data-del="${c.id}">Delete</button>
      </div>
    </div>`).join('')}</div>` : emptyState('🏀', 'No saved careers. Create one to begin.', '#/coach-create', 'New career');

  container.innerHTML = pageHead('Settings', 'Saving is automatic — your career lives in the local database.',
    `<a class="btn btn-primary" href="#/coach-create">+ New career</a>`)
    + advanceCard
    + `<div class="card"><h3>Saved careers</h3>${careerList}</div>`
    + `<div class="card"><h3>About</h3>
        <p class="muted">Legacy Hoops: High School Dynasty — a single-player basketball management sim.
        Build a program across seasons: manage your roster, set the game plan, recruit, and chase state titles.
        All progress is stored locally and saved automatically as you play.</p></div>`;

  const adv = container.querySelector('#advance');
  if (adv) adv.addEventListener('click', async () => {
    adv.disabled = true; adv.textContent = 'Running offseason…';
    try {
      await apiPost(`/api/careers/${activeId}/advance`, {});
      const { career, team } = await apiGet(`/api/careers/${activeId}`);
      state.setCareer(career); updateTopbar(career, team);
      location.hash = '#/dashboard';
    } catch (e) {
      const m = container.querySelector('#advMsg'); if (m) m.textContent = e.message;
      adv.disabled = false; adv.textContent = 'Advance to next season';
    }
  });

  container.querySelectorAll('[data-load]').forEach((b) => b.addEventListener('click', async () => {
    const { career, team } = await apiGet(`/api/careers/${b.dataset.load}`);
    state.setCareer(career); updateTopbar(career, team);
    location.hash = '#/dashboard';
  }));

  container.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm('Delete this career permanently? This cannot be undone.')) return;
    await apiDelete(`/api/careers/${b.dataset.del}`);
    if (state.careerId === Number(b.dataset.del)) { state.clear(); updateTopbar(null, null); }
    render(container);
  }));
}
