import { placeholder } from '../components/ui.js';
export async function render(container, params) {
  const id = params && params[0];
  placeholder(container, 'Player Profile', id
    ? `Full card for player #${id} — attributes, eligibility, and stats come in Phase 4.`
    : 'Open a player from the roster to view their card.');
}
