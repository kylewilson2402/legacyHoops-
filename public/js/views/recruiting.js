import { apiGet, apiPost } from '../api.js';
import { loadActiveCareer } from '../components/career.js';
import { pageHead, esc, emptyState } from '../components/ui.js';

function stars(tier) {
  if (!tier) return '<span class="muted">Unscouted</span>';
  return `<span class="stars" title="${tier}-star prospect">${'★'.repeat(tier)}<span class="muted">${'★'.repeat(5 - tier)}</span></span>`;
}

function interestMeter(v) {
  const cls = v >= 66 ? 'win' : v >= 33 ? '' : '';
  return `<div class="interest"><div class="interest-fill ${cls}" style="width:${v}%"></div></div>
    <span class="mono muted" style="font-size:.75rem">${v}% interest</span>`;
}

export async function render(container) {
  const ctx = await loadActiveCareer(container, 'Recruiting');
  if (!ctx) return;
  const { career } = ctx;

  const [data, actions] = await Promise.all([
    apiGet(`/api/recruiting/${career.id}`),
    apiGet(`/api/recruiting/${career.id}/actions`),
  ]);

  function msg(t, ok = false) {
    const el = container.querySelector('#recMsg');
    if (el) { el.textContent = t; el.style.color = ok ? 'var(--whistle)' : 'var(--foul)'; }
  }

  function recruitCard(r) {
    const scouted = r.scouted;
    const actBtns = actions.map((a) =>
      `<button class="btn btn-sm" data-action="${a.key}" data-id="${r.id}" ${data.budget.remaining <= 0 ? 'disabled' : ''}>${esc(a.label)}</button>`
    ).join('');
    return `<div class="card recruit-card">
      <div class="row spread">
        <div><strong>${esc(r.first)} ${esc(r.last)}</strong>
          <div class="muted">${esc(r.position)}${scouted ? ` · OVR ${r.overall} · POT ${r.potential}${r.potential_known === 'approx' ? '±' : ''}` : ''}</div>
        </div>
        <div style="text-align:right">${stars(r.tier)}</div>
      </div>
      <div style="margin:10px 0">${interestMeter(r.interest)}</div>
      ${scouted
        ? `<div class="muted" style="font-size:.82rem"><span class="pos">+</span> ${esc(r.strengths)}<br><span class="neg">−</span> ${esc(r.weaknesses)}</div>`
        : `<div class="muted" style="font-size:.82rem">Hidden until scouted.</div>`}
      <div class="row" style="margin-top:12px;gap:6px">
        ${scouted ? '' : `<button class="btn btn-sm btn-primary" data-scout="${r.id}" ${data.budget.remaining <= 0 ? 'disabled' : ''}>Scout</button>`}
        ${actBtns}
      </div>
    </div>`;
  }

  const committedHtml = data.committed.length
    ? `<div class="grid grid-auto">${data.committed.map((r) => `
        <div class="card" style="border-color:var(--hardwood)">
          <div class="row spread"><strong>${esc(r.first)} ${esc(r.last)}</strong>${stars(r.tier)}</div>
          <div class="muted">${esc(r.position)}${r.scouted ? ` · POT ${r.potential}` : ''} · <span class="pos">Committed</span></div>
        </div>`).join('')}</div>`
    : emptyState('✍️', 'No commitments yet. Raise a recruit\'s interest, then resolve at season\'s end.');

  const head = pageHead('Recruiting', `Class of Season ${data.classYear}`,
    `<span class="tag ${data.budget.remaining > 0 ? 'win' : 'loss'}">${data.budget.remaining}/${data.budget.max} actions left (Wk ${data.budget.week})</span>`);

  const available = data.recruits.filter((r) => !r.committed_team_id);
  container.innerHTML = head
    + `<div class="card"><h3>Committed to you</h3>${committedHtml}</div>`
    + `<h2 style="margin:22px 0 12px">Prospects</h2>`
    + `<p class="muted" id="recMsg" style="min-height:1.2em"></p>`
    + `<div class="grid grid-auto" id="recGrid">${available.map(recruitCard).join('')}</div>`;

  container.querySelectorAll('[data-scout]').forEach((b) => b.addEventListener('click', async () => {
    try { await apiPost(`/api/recruiting/${career.id}/scout`, { recruitId: Number(b.dataset.scout) }); render(container); }
    catch (e) { msg(e.message); }
  }));
  container.querySelectorAll('[data-action]').forEach((b) => b.addEventListener('click', async () => {
    try {
      const r = await apiPost(`/api/recruiting/${career.id}/action`, { recruitId: Number(b.dataset.id), action: b.dataset.action });
      await render(container);
      msg(`+${r.gain} interest. ${r.budget.remaining} actions left.`, true);
    } catch (e) { msg(e.message); }
  }));
}
