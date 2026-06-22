// Hash-based client router. Each view module exports
//   export async function render(container, params)
// Views are lazily imported so we only fetch what we navigate to.

import { state } from './state.js';
import { apiGet, apiPost } from './api.js';
import { toast } from './components/ui.js';

const routes = {
  home:         () => import('./views/home.js'),
  'coach-create': () => import('./views/coachCreate.js'),
  dashboard:    () => import('./views/dashboard.js'),
  roster:       () => import('./views/roster.js'),
  schedule:     () => import('./views/schedule.js'),
  standings:    () => import('./views/standings.js'),
  news:         () => import('./views/news.js'),
  recruiting:   () => import('./views/recruiting.js'),
  player:       () => import('./views/playerProfile.js'),
  history:      () => import('./views/history.js'),
  settings:     () => import('./views/settings.js'),
};

const view = document.getElementById('view');
const sidebar = document.getElementById('sidebar');
const hamburger = document.getElementById('hamburger');

// Parse "#/route/param" -> { name, params:[...] }
function parseHash() {
  const raw = (location.hash || '#/home').replace(/^#\/?/, '');
  const [name, ...params] = raw.split('/').filter(Boolean);
  return { name: name || 'home', params };
}

function setActiveNav(name) {
  document.querySelectorAll('[data-route]').forEach((el) => {
    el.classList.toggle('active', el.dataset.route === name);
  });
}

async function router() {
  const { name, params } = parseHash();
  const loader = routes[name] || routes.home;
  setActiveNav(name);
  // close mobile sidebar on navigation
  sidebar.classList.remove('open');
  hamburger.setAttribute('aria-expanded', 'false');

  view.innerHTML = '<div class="spinner" role="status" aria-label="Loading"></div>';
  try {
    const mod = await loader();
    await mod.render(view, params);
    view.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  } catch (err) {
    console.error('View error:', err);
    view.innerHTML = `<div class="card"><h2>Something went wrong</h2>
      <p class="muted">${err.message || err}</p>
      <a class="btn btn-primary" href="#/home">Back to home</a></div>`;
  }
}

// Re-run the current route (used to refresh a view after simulating).
export function refresh() { router(); }

// Update the topbar from the active career (called by views after loading).
export function updateTopbar(career, team) {
  const nameEl = document.getElementById('topbarName');
  const subEl = document.getElementById('topbarSub');
  const seasonEl = document.getElementById('topbarSeason');
  const crest = document.getElementById('topbarCrest');
  const simBtn = document.getElementById('topbarSim');
  if (career && team) {
    nameEl.textContent = team.name;
    subEl.textContent = `Coach ${career.coach_first} ${career.coach_last}`;
    const done = career.current_week > 25;
    seasonEl.textContent = done ? `Season ${career.season_year} · Complete` : `Season ${career.season_year} · Wk ${career.current_week}`;
    crest.style.setProperty('--c1', team.color_primary);
    crest.style.setProperty('--c2', team.color_secondary);
    simBtn.hidden = false;
    simBtn.disabled = done;
    simBtn.textContent = done ? 'Season over' : 'Simulate next';
  } else {
    nameEl.textContent = 'Legacy Hoops';
    subEl.textContent = 'No career loaded';
    seasonEl.textContent = '';
    simBtn.hidden = true;
  }
}

// Topbar Simulate button → sim the user's next game, then refresh the view.
const topbarSim = document.getElementById('topbarSim');
topbarSim.addEventListener('click', async () => {
  const id = state.careerId;
  if (!id) return;
  topbarSim.disabled = true;
  topbarSim.textContent = 'Simulating…';
  try {
    const r = await apiPost('/api/sim/next', { careerId: id });
    if (r && r.recap) toast(`${r.recap.away.abbrev} ${r.recap.away.score} — ${r.recap.home.score} ${r.recap.home.abbrev}`, 'win');
    else if (r && r.champion_team_id) toast('Season complete — a champion is crowned!', 'win');
  } catch (e) {
    toast(e.message, 'error');
  }
  refresh();
});

hamburger.addEventListener('click', () => {
  const open = sidebar.classList.toggle('open');
  hamburger.setAttribute('aria-expanded', String(open));
});

window.addEventListener('hashchange', router);
window.addEventListener('DOMContentLoaded', () => {
  if (!location.hash) location.hash = '#/home';
  router();
});

// Make state reachable for debugging in the console.
window.__lh = { state };
