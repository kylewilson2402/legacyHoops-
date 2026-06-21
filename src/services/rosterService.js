// Roster generation + the canonical "overall" rating formula.
//
// OVERALL FORMULA
// ----------------
// A player's overall is a position-weighted blend of their six attributes
// (shooting, finishing, passing, defense, rebounding, athleticism). Each
// position emphasizes different skills, so a great-passing PG and a great-
// rebounding C can carry similar overalls for different reasons. Weights per
// position sum to 1.0 (see POS_WEIGHTS). The sim (Phase 5) reads these same
// attributes, so overall is purely a human-friendly summary.

const db = require('../db/connection');
const { makeRng, mixSeed } = require('../lib/rng');
const { FIRST_NAMES, LAST_NAMES } = require('../lib/names');

const ATTRS = ['shooting', 'finishing', 'passing', 'defense', 'rebounding', 'athleticism'];

// Position-weighted blend for overall.
const POS_WEIGHTS = {
  PG: { shooting: 0.20, finishing: 0.12, passing: 0.28, defense: 0.12, rebounding: 0.05, athleticism: 0.23 },
  SG: { shooting: 0.28, finishing: 0.20, passing: 0.12, defense: 0.13, rebounding: 0.07, athleticism: 0.20 },
  SF: { shooting: 0.18, finishing: 0.20, passing: 0.12, defense: 0.18, rebounding: 0.15, athleticism: 0.17 },
  PF: { shooting: 0.10, finishing: 0.22, passing: 0.07, defense: 0.20, rebounding: 0.26, athleticism: 0.15 },
  C:  { shooting: 0.06, finishing: 0.24, passing: 0.06, defense: 0.22, rebounding: 0.30, athleticism: 0.12 },
};

// Additive flavor so positions generate believable attribute shapes.
const POS_ADJ = {
  PG: { shooting: 4, finishing: -2, passing: 10, defense: 0, rebounding: -10, athleticism: 5 },
  SG: { shooting: 8, finishing: 3, passing: 0, defense: 0, rebounding: -8, athleticism: 4 },
  SF: { shooting: 2, finishing: 4, passing: -1, defense: 3, rebounding: 2, athleticism: 3 },
  PF: { shooting: -6, finishing: 5, passing: -6, defense: 5, rebounding: 8, athleticism: 1 },
  C:  { shooting: -12, finishing: 6, passing: -8, defense: 6, rebounding: 12, athleticism: -2 },
};

// 12-man roster shape (sums to 12).
const POSITION_PLAN = ['PG', 'PG', 'PG', 'SG', 'SG', 'SF', 'SF', 'SF', 'PF', 'PF', 'C', 'C'];

function computeOverall(position, a) {
  const w = POS_WEIGHTS[position] || POS_WEIGHTS.SF;
  let sum = 0;
  for (const k of ATTRS) sum += a[k] * w[k];
  return Math.round(sum);
}

// Generate the 12 players for one team. `teamIndex` (0..11) seeds a child RNG
// so rosters are reproducible from the career seed regardless of DB ids.
function generateRoster(careerId, teamId, teamIndex, masterSeed) {
  const rng = makeRng(mixSeed(masterSeed, teamIndex + 1));

  // Each team gets a strength baseline → some programs are simply better.
  const teamStrength = rng.gaussianClamp(63, 7, 48, 80);

  const insert = db.prepare(`INSERT INTO players
    (career_id, team_id, first, last, position, grade,
     shooting, finishing, passing, defense, rebounding, athleticism,
     potential, overall)
    VALUES (@career_id,@team_id,@first,@last,@position,@grade,
     @shooting,@finishing,@passing,@defense,@rebounding,@athleticism,
     @potential,@overall)`);

  const firsts = rng.shuffle(FIRST_NAMES);
  const lasts = rng.shuffle(LAST_NAMES);

  POSITION_PLAN.forEach((position, i) => {
    // Grade spread 9..12, leaning toward the middle classes.
    const grade = rng.weighted([[9, 25], [10, 30], [11, 25], [12, 20]]);
    const gradeBonus = (grade - 9) * 2; // upperclassmen a touch more developed
    const base = teamStrength + gradeBonus - 3;

    const adj = POS_ADJ[position];
    const a = {};
    for (const k of ATTRS) a[k] = rng.gaussianClamp(base + adj[k], 8, 40, 99);

    const overall = computeOverall(position, a);
    // Younger players carry more upside; potential never below current overall.
    const headroom = rng.gaussianClamp((12 - grade) * 4 + 5, 4, 0, 30);
    const potential = Math.max(overall, Math.min(99, overall + headroom));

    insert.run({
      career_id: careerId,
      team_id: teamId,
      first: firsts[i % firsts.length],
      last: lasts[(i * 3 + teamIndex) % lasts.length],
      position,
      grade,
      ...a,
      potential,
      overall,
    });
  });
}

// Read a team's roster (active players), best first.
function getRoster(careerId, teamId) {
  return db.prepare(
    `SELECT * FROM players
     WHERE career_id=? AND team_id=? AND status='active'
     ORDER BY overall DESC`
  ).all(careerId, teamId);
}

module.exports = { generateRoster, getRoster, computeOverall, POS_WEIGHTS, ATTRS };
