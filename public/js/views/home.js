import { apiGet, apiPost, apiDelete } from '../api.js';
import { state } from '../state.js';
import { updateTopbar } from '../app.js';
import { pageHead, emptyState, esc, toast } from '../components/ui.js';

// Quick-start a reviewer-friendly career with a fixed seed.
async function startDemo(container) {
  const existing = (await apiGet('/api/careers')).find((c) => c.coach === 'Casey Demo');
  let career, team;
  if (existing) {
    ({ career, team } = await apiGet(`/api/careers/${existing.id}`));
  } else {
    ({ career, team } = await apiPost('/api/careers', {
      coachFirst: 'Casey', coachLast: 'Demo', coachAge: 40,
      archetype: 'Tactician', teamCity: 'Oak Hill', teamMascot: 'Hawks', seed: 12345,
    }));
  }
  state.setCareer(career);
  updateTopbar(career, team);
  toast('Demo career ready — welcome to Oak Hill!', 'win');
  location.hash = '#/dashboard';
}

export async function render(container) {
  const careers = await apiGet('/api/careers');

  const head = pageHead(
    'Welcome to Legacy Hoops',
    'Take over a high school program and build a dynasty.',
    `<button class="btn" id="demoBtn">Demo career</button>
     <a class="btn btn-primary" href="#/coach-create">+ New career</a>`
  );

  if (!careers.length) {
    container.innerHTML = head + `<div class="card">${emptyState(
      '🏀',
      'No careers yet. Create a coach and pick a program — or jump straight in with a demo career.',
      '#/coach-create', 'Create your coach'
    )}</div>`;
    updateTopbar(null, null);
    container.querySelector('#demoBtn').addEventListener('click', () => startDemo(container));
    return;
  }

  const cards = careers.map((c) => {
    const t = c.team;
    const crest = t
      ? `<span class="crest" style="--c1:${esc(t.color_primary)};--c2:${esc(t.color_secondary)}"></span>`
      : '';
    return `<div class="card career-card">
      <div class="row" style="gap:12px">
        ${crest}
        <div>
          <h3 style="margin:0">${esc(t ? t.name : 'Unnamed program')}</h3>
          <div class="muted">Coach ${esc(c.coach)} · ${esc(c.archetype)}</div>
        </div>
      </div>
      <div class="row spread" style="margin-top:14px">
        <span class="mono muted">Season ${c.season_year} · ${c.wins}–${c.losses}</span>
        <span class="row">
          <button class="btn btn-primary btn-sm" data-load="${c.id}">Continue</button>
          <button class="btn btn-danger btn-sm" data-del="${c.id}">Delete</button>
        </span>
      </div>
    </div>`;
  }).join('');

  container.innerHTML = head + `<div class="grid grid-auto">${cards}</div>`;
  updateTopbar(null, null);

  container.querySelector('#demoBtn').addEventListener('click', () => startDemo(container));

  container.querySelectorAll('[data-load]').forEach((b) => {
    b.addEventListener('click', async () => {
      const { career, team } = await apiGet(`/api/careers/${b.dataset.load}`);
      state.setCareer(career);
      updateTopbar(career, team);
      location.hash = '#/dashboard';
    });
  });

  container.querySelectorAll('[data-del]').forEach((b) => {
    b.addEventListener('click', async () => {
      if (!confirm('Delete this career permanently? This cannot be undone.')) return;
      await apiDelete(`/api/careers/${b.dataset.del}`);
      if (state.careerId === Number(b.dataset.del)) state.clear();
      render(container); // refresh list
    });
  });
}
