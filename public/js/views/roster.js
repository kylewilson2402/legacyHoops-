import { apiGet, apiPut } from '../api.js';
import { loadActiveCareer } from '../components/career.js';
import { pageHead, esc } from '../components/ui.js';

const COLS = [
  { key: 'name', label: 'Player', sort: (p) => p.last },
  { key: 'position', label: 'Pos' },
  { key: 'grade', label: 'Gr' },
  { key: 'overall', label: 'OVR' },
  { key: 'shooting', label: 'SHT' },
  { key: 'finishing', label: 'FIN' },
  { key: 'passing', label: 'PAS' },
  { key: 'defense', label: 'DEF' },
  { key: 'rebounding', label: 'REB' },
  { key: 'athleticism', label: 'ATH' },
  { key: 'potential', label: 'POT' },
];

export async function render(container) {
  const ctx = await loadActiveCareer(container, 'Roster');
  if (!ctx) return;
  const { career, team } = ctx;

  const [data, options] = await Promise.all([
    apiGet(`/api/roster/${career.id}/${team.id}`),
    apiGet('/api/roster/options'),
  ]);
  let players = data.players;
  const settings = data.settings || { offensive_style: 'Motion', defensive_style: 'Man-to-Man', tempo: 'Balanced' };

  let sortKey = 'overall';
  let sortDir = -1;

  function totalMinutes() {
    return players.reduce((s, p) => s + (Number(p.minutes) || 0), 0);
  }
  function starterCount() {
    return players.filter((p) => p.is_starter).length;
  }

  function draw() {
    const sorted = [...players].sort((a, b) => {
      const col = COLS.find((c) => c.key === sortKey);
      const av = col && col.sort ? col.sort(a) : a[sortKey];
      const bv = col && col.sort ? col.sort(b) : b[sortKey];
      if (av < bv) return -1 * sortDir;
      if (av > bv) return 1 * sortDir;
      return 0;
    });

    const rows = sorted.map((p) => `
      <tr>
        <td>
          <button class="star ${p.is_starter ? 'on' : ''}" data-star="${p.id}" title="Toggle starter" aria-pressed="${!!p.is_starter}">★</button>
          <a href="#/player/${p.id}">${esc(p.first)} ${esc(p.last)}</a>
        </td>
        <td>${esc(p.position)}</td>
        <td>${p.grade}</td>
        <td><strong>${p.overall}</strong></td>
        <td>${p.shooting}</td><td>${p.finishing}</td><td>${p.passing}</td>
        <td>${p.defense}</td><td>${p.rebounding}</td><td>${p.athleticism}</td>
        <td class="muted">${p.potential}</td>
        <td><input class="min-input" type="number" min="0" max="40" value="${p.minutes || 0}" data-min="${p.id}" style="width:58px"></td>
      </tr>`).join('');

    const head = COLS.map((c) =>
      `<th data-sort="${c.key}">${c.label}${sortKey === c.key ? (sortDir < 0 ? ' ▾' : ' ▴') : ''}</th>`
    ).join('') + '<th>MIN</th>';

    const total = totalMinutes();
    const overBudget = total > options.maxMinutes;
    const sc = starterCount();

    container.querySelector('#rosterCard').innerHTML = `
      <div class="row spread" style="margin-bottom:12px">
        <div class="row">
          <span class="tag ${sc === 5 ? 'win' : ''}">Starters ${sc}/5</span>
          <span class="tag ${overBudget ? 'loss' : ''}">Minutes ${total}/${options.maxMinutes}</span>
        </div>
        <div class="row">
          <button class="btn btn-sm" id="saveLineup" ${sc !== 5 ? 'disabled' : ''}>Lock lineup</button>
          <button class="btn btn-sm" id="saveMinutes" ${overBudget ? 'disabled' : ''}>Save minutes</button>
        </div>
      </div>
      <div class="table-wrap"><table class="stat"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>
      <p class="muted" id="rosterMsg" style="margin-top:10px"></p>`;

    wire();
  }

  function wire() {
    container.querySelectorAll('th[data-sort]').forEach((th) => {
      th.addEventListener('click', () => {
        const k = th.dataset.sort;
        if (sortKey === k) sortDir *= -1; else { sortKey = k; sortDir = (k === 'name' || k === 'position') ? 1 : -1; }
        draw();
      });
    });
    container.querySelectorAll('[data-star]').forEach((b) => {
      b.addEventListener('click', () => {
        const p = players.find((x) => x.id === Number(b.dataset.star));
        p.is_starter = p.is_starter ? 0 : 1;
        draw();
      });
    });
    container.querySelectorAll('[data-min]').forEach((inp) => {
      inp.addEventListener('input', () => {
        const p = players.find((x) => x.id === Number(inp.dataset.min));
        p.minutes = Math.max(0, Math.min(40, Number(inp.value) || 0));
        // live total update without full redraw
        const total = totalMinutes();
        const tag = container.querySelectorAll('.tag')[1];
        tag.textContent = `Minutes ${total}/${options.maxMinutes}`;
        tag.classList.toggle('loss', total > options.maxMinutes);
        container.querySelector('#saveMinutes').disabled = total > options.maxMinutes;
      });
    });

    const msg = (t, ok = true) => {
      const el = container.querySelector('#rosterMsg');
      el.textContent = t; el.style.color = ok ? 'var(--whistle)' : 'var(--foul)';
    };

    const saveLineupBtn = container.querySelector('#saveLineup');
    if (saveLineupBtn) saveLineupBtn.addEventListener('click', async () => {
      const starters = players.filter((p) => p.is_starter).map((p) => p.id);
      try {
        await apiPut(`/api/roster/${career.id}/lineup`, { starters });
        msg('Lineup locked.');
      } catch (e) { msg(e.message, false); }
    });

    const saveMinBtn = container.querySelector('#saveMinutes');
    if (saveMinBtn) saveMinBtn.addEventListener('click', async () => {
      const allocations = players.map((p) => ({ playerId: p.id, minutes: p.minutes || 0 }));
      try {
        const r = await apiPut(`/api/roster/${career.id}/minutes`, { allocations });
        msg(`Minutes saved (${r.total}/${r.max}).`);
      } catch (e) { msg(e.message, false); }
    });
  }

  container.innerHTML = pageHead(`${team.name} — Roster`, `Set your starters, minutes, and game plan.`)
    + `<div class="card" id="rosterCard"></div>`
    + `<div class="card" style="margin-top:16px">
        <h3>Game plan</h3>
        <div class="grid grid-3">
          <label class="field"><span>Offensive style</span>
            <select id="off">${options.offensive.map((o) => `<option ${o === settings.offensive_style ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></label>
          <label class="field"><span>Defensive style</span>
            <select id="def">${options.defensive.map((o) => `<option ${o === settings.defensive_style ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></label>
          <label class="field"><span>Tempo</span>
            <select id="tmp">${options.tempo.map((o) => `<option ${o === settings.tempo ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></label>
        </div>
        <div class="row"><button class="btn btn-primary btn-sm" id="saveStrat">Save game plan</button>
          <span class="muted" id="stratMsg"></span></div>
      </div>`;

  draw();

  container.querySelector('#saveStrat').addEventListener('click', async () => {
    const sm = container.querySelector('#stratMsg');
    try {
      await apiPut(`/api/roster/${career.id}/strategy`, {
        offensive: container.querySelector('#off').value,
        defensive: container.querySelector('#def').value,
        tempo: container.querySelector('#tmp').value,
      });
      sm.textContent = 'Game plan saved.'; sm.style.color = 'var(--whistle)';
    } catch (e) { sm.textContent = e.message; sm.style.color = 'var(--foul)'; }
  });
}
