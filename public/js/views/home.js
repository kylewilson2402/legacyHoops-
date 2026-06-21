import { pageHead, emptyState } from '../components/ui.js';

export async function render(container) {
  container.innerHTML = pageHead('Welcome to Legacy Hoops', 'Build a high school basketball dynasty, one season at a time.')
    + `<div class="card">${emptyState('🏀',
        'No career loaded yet. Career creation arrives in Phase 3 — this shell is live and ready.',
        '#/dashboard', 'Peek at the dashboard')}</div>`;
}
