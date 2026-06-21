// Resolves the active career for a view. Returns { career, team } or null
// (after rendering a "no career" prompt into the container).

import { apiGet } from '../api.js';
import { state } from '../state.js';
import { updateTopbar } from '../app.js';
import { pageHead, emptyState } from './ui.js';

export async function loadActiveCareer(container, title = 'No career loaded') {
  const id = state.careerId;
  if (!id) {
    container.innerHTML = pageHead(title)
      + `<div class="card">${emptyState('🏀', 'No career is loaded yet. Start or continue one to manage your program.', '#/home', 'Go to careers')}</div>`;
    updateTopbar(null, null);
    return null;
  }
  const { career, team } = await apiGet(`/api/careers/${id}`);
  state.setCareer(career);
  updateTopbar(career, team);
  return { career, team };
}
