// Offseason player development. Returning players improve based on:
//  - potential headroom (room left below their ceiling; diminishing near it)
//  - playing time the prior season (games + minutes — bench players grow less)
//  - their team coach's archetype (Developer gives a larger multiplier)
//  - youth (younger players develop faster)
//  - small seeded random noise
// Overall is recomputed from attributes after the bump and never exceeds
// potential. Returns a per-player summary for the USER team.

const db = require('../db/connection');
const { makeRng, mixSeed } = require('../lib/rng');
const { computeOverall, ATTRS } = require('./rosterService');

// Compute one player's overall gain for the season just completed.
function developGain(player, gp, avgMin, isDeveloper, rng) {
  const headroom = Math.max(0, player.potential - player.overall);
  if (headroom <= 0) return 0;

  const ptFactor = Math.max(0.2, Math.min(1.2, (gp / 22) * (avgMin / 26 + 0.3)));
  const ageFactor = Math.max(0.4, (12 - player.grade) / 3 + 0.5); // 9→1.5 … 12→0.5
  const archFactor = isDeveloper ? 1.4 : 1.0;
  const noise = rng.gaussian(0, 0.4);

  const gain = headroom * 0.22 * ptFactor * ageFactor * archFactor + noise;
  return Math.max(0, Math.round(gain));
}

// Develop every active player; return the USER team's improvement summary.
function developPlayers(careerId) {
  const career = db.prepare('SELECT seed, season_year, team_id FROM careers WHERE id=?').get(careerId);
  const seasonYear = career.season_year;
  const rng = makeRng(mixSeed(career.seed, 9000 + seasonYear));

  const teams = db.prepare('SELECT id, coach_archetype FROM teams WHERE career_id=?').all(careerId);
  const archByTeam = new Map(teams.map((t) => [t.id, t.coach_archetype]));

  const players = db.prepare(`SELECT * FROM players WHERE career_id=? AND status='active'`).all(careerId);
  const ptStmt = db.prepare(`
    SELECT COUNT(*) gp, COALESCE(AVG(pgs.min),0) avgMin
    FROM player_game_stats pgs JOIN games g ON g.id=pgs.game_id
    WHERE pgs.player_id=? AND g.season_year=? AND pgs.min>0`);

  const upd = db.prepare(`UPDATE players SET shooting=?,finishing=?,passing=?,defense=?,rebounding=?,athleticism=?,overall=? WHERE id=?`);
  const summary = [];

  const tx = db.transaction(() => {
    for (const p of players) {
      const { gp, avgMin } = ptStmt.get(p.id, seasonYear);
      const isDev = archByTeam.get(p.team_id) === 'Developer';
      const gain = developGain(p, gp, avgMin, isDev, rng);
      if (gain <= 0) continue;

      // Adding `gain` to every attribute raises the weighted overall by ~gain;
      // clamp attributes at 99 and back off if overall would exceed potential.
      const a = {};
      for (const k of ATTRS) a[k] = Math.min(99, p[k] + gain);
      let overall = computeOverall(p.position, a);
      if (overall > p.potential) {
        // trim uniformly so overall lands at potential
        const over = overall - p.potential;
        for (const k of ATTRS) a[k] = Math.max(p[k], a[k] - over);
        overall = Math.min(p.potential, computeOverall(p.position, a));
      }
      if (overall <= p.overall) continue;

      upd.run(a.shooting, a.finishing, a.passing, a.defense, a.rebounding, a.athleticism, overall, p.id);
      if (p.team_id === career.team_id) {
        summary.push({ id: p.id, name: `${p.first} ${p.last}`, position: p.position, grade: p.grade, before: p.overall, after: overall, delta: overall - p.overall });
      }
    }
  });
  tx();

  summary.sort((x, y) => y.delta - x.delta);
  return summary;
}

module.exports = { developPlayers, developGain };
