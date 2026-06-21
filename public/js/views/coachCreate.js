import { apiPost } from '../api.js';
import { state } from '../state.js';
import { updateTopbar } from '../app.js';
import { pageHead, esc } from '../components/ui.js';

const ARCHETYPES = [
  { key: 'Motivator', desc: 'Lifts effort and clutch play in close games, and keeps morale high.' },
  { key: 'Recruiter', desc: 'Recruits show more interest and your scouting reads are sharper.' },
  { key: 'Tactician', desc: 'Bigger payoff when your strategy fits the roster; better simmed efficiency.' },
  { key: 'Developer', desc: 'Your players gain more from training each offseason.' },
];

export async function render(container) {
  let selected = 'Tactician';

  container.innerHTML = pageHead('Create Your Coach', 'Set your identity, then take over a program.')
    + `<div class="grid grid-2">
      <div class="card">
        <h3>Coach</h3>
        <label class="field"><span>First name</span>
          <input id="cf" type="text" placeholder="e.g. Ray" maxlength="20"></label>
        <label class="field"><span>Last name</span>
          <input id="cl" type="text" placeholder="e.g. Holloway" maxlength="20"></label>
        <label class="field"><span>Age</span>
          <input id="ca" type="number" min="25" max="75" value="38"></label>

        <h3 style="margin-top:18px">Program (optional)</h3>
        <p class="muted" style="margin-top:-6px">Leave blank to be assigned a program at random.</p>
        <label class="field"><span>Town</span>
          <input id="tcity" type="text" placeholder="Random" maxlength="20"></label>
        <label class="field"><span>Mascot</span>
          <input id="tmascot" type="text" placeholder="Random" maxlength="16"></label>
        <label class="field"><span>Seed (optional — reproducible league)</span>
          <input id="seed" type="number" placeholder="Random"></label>
      </div>

      <div class="card">
        <h3>Coaching style</h3>
        <p class="muted" style="margin-top:-6px">Each archetype shapes how your program grows and wins.</p>
        <div class="choice-grid" id="archetypes">
          ${ARCHETYPES.map((a) => `
            <button type="button" class="choice ${a.key === selected ? 'selected' : ''}" data-arch="${a.key}">
              <strong>${esc(a.key)}</strong><small>${esc(a.desc)}</small>
            </button>`).join('')}
        </div>
        <div class="row" style="margin-top:20px">
          <button class="btn btn-primary" id="start">Start career</button>
        </div>
        <p class="muted" id="err" style="color:var(--foul);margin-top:10px"></p>
      </div>
    </div>`;

  const archWrap = container.querySelector('#archetypes');
  archWrap.querySelectorAll('[data-arch]').forEach((b) => {
    b.addEventListener('click', () => {
      selected = b.dataset.arch;
      archWrap.querySelectorAll('.choice').forEach((x) => x.classList.toggle('selected', x === b));
    });
  });

  const err = container.querySelector('#err');
  container.querySelector('#start').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    err.textContent = '';
    const payload = {
      coachFirst: container.querySelector('#cf').value.trim(),
      coachLast: container.querySelector('#cl').value.trim(),
      coachAge: Number(container.querySelector('#ca').value) || 38,
      archetype: selected,
      teamCity: container.querySelector('#tcity').value.trim() || null,
      teamMascot: container.querySelector('#tmascot').value.trim() || null,
      seed: container.querySelector('#seed').value.trim() || null,
    };
    if (!payload.coachFirst || !payload.coachLast) {
      err.textContent = 'Please enter a first and last name.';
      return;
    }
    btn.disabled = true;
    btn.textContent = 'Building league…';
    try {
      const { career, team } = await apiPost('/api/careers', payload);
      state.setCareer(career);
      updateTopbar(career, team);
      location.hash = '#/dashboard';
    } catch (ex) {
      err.textContent = ex.message;
      btn.disabled = false;
      btn.textContent = 'Start career';
    }
  });
}
