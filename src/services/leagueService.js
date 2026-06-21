// League generation: 12 unique teams with distinct identities, colors, and AI
// coaches. One team is flagged as the user's. Deterministic from the career
// seed so the same seed reproduces the same league.

const db = require('../db/connection');
const { makeRng } = require('../lib/rng');
const { CITY_NAMES, MASCOTS, COLOR_PAIRS, COACH_FIRST, COACH_SURNAMES } = require('../lib/names');

const ARCHETYPES = ['Motivator', 'Recruiter', 'Tactician', 'Developer'];
const TEAM_COUNT = 12;

// Build a unique 3-letter abbreviation, preferring the mascot then the city.
function makeAbbrev(city, mascot, used) {
  const candidates = [
    mascot.replace(/[^A-Za-z]/g, '').slice(0, 3),
    (city.replace(/[^A-Za-z]/g, '').slice(0, 2) + mascot.replace(/[^A-Za-z]/g, '').slice(0, 1)),
    city.replace(/[^A-Za-z]/g, '').slice(0, 3),
  ].map((s) => s.toUpperCase());
  for (const c of candidates) {
    if (c.length === 3 && !used.has(c)) { used.add(c); return c; }
  }
  // Fallback: mutate until unique.
  let base = candidates[0];
  for (let n = 0; n < 26; n++) {
    const c = (base.slice(0, 2) + String.fromCharCode(65 + n));
    if (!used.has(c)) { used.add(c); return c; }
  }
  return base;
}

// opts: { teamCity, teamMascot } optional user identity. Returns userTeamId.
function generateLeague(careerId, opts = {}) {
  const career = db.prepare('SELECT seed FROM careers WHERE id=?').get(careerId);
  const rng = makeRng(career.seed);

  const cities = rng.shuffle(CITY_NAMES);
  const mascots = rng.shuffle(MASCOTS);
  const colors = rng.shuffle(COLOR_PAIRS);
  const coachFirsts = rng.shuffle(COACH_FIRST);
  const coachLasts = rng.shuffle(COACH_SURNAMES);

  // User identity (custom if provided, else first off the shuffled pools).
  const userCity = opts.teamCity || cities[0];
  const userMascot = opts.teamMascot || mascots[0];

  // AI pools exclude the user's choices to keep names unique.
  const aiCities = cities.filter((c) => c !== userCity);
  const aiMascots = mascots.filter((m) => m !== userMascot);

  const rows = [];
  rows.push({ city: userCity, mascot: userMascot, isUser: 1 });
  for (let i = 0; i < TEAM_COUNT - 1; i++) {
    rows.push({ city: aiCities[i], mascot: aiMascots[i], isUser: 0 });
  }

  const insert = db.prepare(`INSERT INTO teams
    (career_id, name, city, mascot, abbrev, color_primary, color_secondary,
     is_user_team, coach_name, coach_archetype)
    VALUES (?,?,?,?,?,?,?,?,?,?)`);

  const usedAbbrev = new Set();
  let userTeamId = null;

  rows.forEach((r, i) => {
    const [c1, c2] = colors[i % colors.length];
    const abbrev = makeAbbrev(r.city, r.mascot, usedAbbrev);
    const archetype = rng.pick(ARCHETYPES);
    const coachName = `${coachFirsts[i % coachFirsts.length]} ${coachLasts[i % coachLasts.length]}`;
    const info = insert.run(
      careerId, `${r.city} ${r.mascot}`, r.city, r.mascot, abbrev,
      c1, c2, r.isUser, coachName, archetype
    );
    if (r.isUser) userTeamId = info.lastInsertRowid;
  });

  return userTeamId;
}

function getTeams(careerId) {
  return db.prepare('SELECT * FROM teams WHERE career_id=? ORDER BY id').all(careerId);
}

module.exports = { generateLeague, getTeams, ARCHETYPES };
