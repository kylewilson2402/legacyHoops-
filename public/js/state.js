// Client-side cache of the active career. The DB is the source of truth;
// this just remembers which career_id we're viewing (survives reloads via
// sessionStorage) plus a small cache of the loaded career object.

const KEY = 'lh_active_career';

let _career = null; // last loaded career object (optional convenience cache)

export const state = {
  get careerId() {
    const v = sessionStorage.getItem(KEY);
    return v ? Number(v) : null;
  },
  setCareerId(id) {
    if (id == null) sessionStorage.removeItem(KEY);
    else sessionStorage.setItem(KEY, String(id));
  },
  get career() { return _career; },
  setCareer(c) {
    _career = c;
    if (c && c.id) this.setCareerId(c.id);
  },
  clear() {
    _career = null;
    sessionStorage.removeItem(KEY);
  },
};
