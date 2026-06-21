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

// ---------------------------------------------------------------------------
// Strategy options (the sim reads these in Phase 5)
// ---------------------------------------------------------------------------
const OFFENSIVE_STYLES = ['Pace & Space', 'Inside-Out', 'Motion', 'Iso-Heavy'];
const DEFENSIVE_STYLES = ['Man-to-Man', '2-3 Zone', 'Full-Court Press', 'Pack-Line'];
const TEMPOS = ['Slow', 'Balanced', 'Fast'];
const MAX_MINUTES = 200; // 5 positions * 40 minutes (HS games are 32, but we
                         // allocate against a 200-unit budget for simplicity)

function getUserTeamId(careerId) {
  const c = db.prepare('SELECT team_id FROM careers WHERE id=?').get(careerId);
  if (!c || !c.team_id) throw new Error('Career has no team.');
  return c.team_id;
}

function getTeamSettings(careerId, teamId) {
  return db.prepare('SELECT offensive_style, defensive_style, tempo FROM team_settings WHERE career_id=? AND team_id=?')
    .get(careerId, teamId);
}

// Set exactly five starters (by player id) on the user's team.
function setLineup(careerId, starters) {
  const teamId = getUserTeamId(careerId);
  if (!Array.isArray(starters)) throw new Error('Starters must be a list of player ids.');
  const ids = [...new Set(starters.map(Number))];
  if (ids.length !== 5) throw new Error('You must select exactly 5 starters.');

  const valid = db.prepare(
    `SELECT id FROM players WHERE career_id=? AND team_id=? AND status='active'`
  ).all(careerId, teamId).map((r) => r.id);
  const validSet = new Set(valid);
  for (const id of ids) {
    if (!validSet.has(id)) throw new Error('A selected player is not on your active roster.');
  }

  const tx = db.transaction(() => {
    db.prepare('UPDATE players SET is_starter=0 WHERE career_id=? AND team_id=?').run(careerId, teamId);
    const mark = db.prepare('UPDATE players SET is_starter=1 WHERE id=?');
    ids.forEach((id) => mark.run(id));
  });
  tx();
  return { starters: ids };
}

// Set per-game minutes. allocations: [{ playerId, minutes }]. Total across
// active players must not exceed MAX_MINUTES.
function setMinutes(careerId, allocations) {
  const teamId = getUserTeamId(careerId);
  if (!Array.isArray(allocations)) throw new Error('Minutes must be a list.');

  const roster = db.prepare(
    `SELECT id FROM players WHERE career_id=? AND team_id=? AND status='active'`
  ).all(careerId, teamId);
  const validSet = new Set(roster.map((r) => r.id));

  let total = 0;
  const clean = [];
  for (const a of allocations) {
    const id = Number(a.playerId);
    const min = Math.max(0, Math.min(40, Math.round(Number(a.minutes) || 0)));
    if (!validSet.has(id)) continue;
    total += min;
    clean.push({ id, min });
  }
  if (total > MAX_MINUTES) {
    throw new Error(`Minutes total ${total} exceeds the ${MAX_MINUTES}-minute budget. Trim ${total - MAX_MINUTES}.`);
  }

  const tx = db.transaction(() => {
    const upd = db.prepare('UPDATE players SET minutes=? WHERE id=?');
    clean.forEach((c) => upd.run(c.min, c.id));
  });
  tx();
  return { total, max: MAX_MINUTES };
}

function setStrategy(careerId, { offensive, defensive, tempo }) {
  const teamId = getUserTeamId(careerId);
  if (!OFFENSIVE_STYLES.includes(offensive)) throw new Error('Invalid offensive style.');
  if (!DEFENSIVE_STYLES.includes(defensive)) throw new Error('Invalid defensive style.');
  if (!TEMPOS.includes(tempo)) throw new Error('Invalid tempo.');
  db.prepare(
    'UPDATE team_settings SET offensive_style=?, defensive_style=?, tempo=? WHERE career_id=? AND team_id=?'
  ).run(offensive, defensive, tempo, careerId, teamId);
  return { offensive, defensive, tempo };
}

// Single player + current-season aggregate stats (empty until games are simmed).
function getPlayerProfile(careerId, playerId) {
  const player = db.prepare('SELECT * FROM players WHERE career_id=? AND id=?').get(careerId, playerId);
  if (!player) throw new Error('Player not found.');
  const team = db.prepare('SELECT * FROM teams WHERE id=?').get(player.team_id);
  const c = db.prepare('SELECT season_year FROM careers WHERE id=?').get(careerId);

  const agg = db.prepare(`
    SELECT COUNT(*) AS gp,
           SUM(pgs.pts) AS pts, SUM(pgs.reb) AS reb, SUM(pgs.ast) AS ast,
           SUM(pgs.stl) AS stl, SUM(pgs.blk) AS blk, SUM(pgs.tov) AS tov,
           SUM(pgs.fg) AS fg, SUM(pgs.fga) AS fga,
           SUM(pgs.threes) AS threes, SUM(pgs.threes_a) AS threes_a,
           SUM(pgs.min) AS min
    FROM player_game_stats pgs
    JOIN games g ON g.id = pgs.game_id
    WHERE pgs.player_id=? AND g.season_year=?
  `).get(playerId, c.season_year);

  const gp = agg.gp || 0;
  const per = (v) => (gp ? +(v / gp).toFixed(1) : 0);
  const stats = {
    gp,
    ppg: per(agg.pts), rpg: per(agg.reb), apg: per(agg.ast),
    spg: per(agg.stl), bpg: per(agg.blk), tpg: per(agg.tov), mpg: per(agg.min),
    fgPct: agg.fga ? Math.round((agg.fg / agg.fga) * 100) : 0,
    threePct: agg.threes_a ? Math.round((agg.threes / agg.threes_a) * 100) : 0,
  };
  return { player, team, stats };
}

module.exports = {
  generateRoster, getRoster, computeOverall, POS_WEIGHTS, ATTRS,
  setLineup, setMinutes, setStrategy, getTeamSettings, getUserTeamId,
  getPlayerProfile, OFFENSIVE_STYLES, DEFENSIVE_STYLES, TEMPOS, MAX_MINUTES,
};
