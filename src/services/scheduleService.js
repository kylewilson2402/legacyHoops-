// Schedule generation. A balanced double round-robin among 12 teams: every
// team plays every other team twice (home + away) = 22 games, one per week
// across 22 weeks (6 games per week). Built with the circle method so it's
// perfectly balanced, then week order is shuffled (seeded) for variety.
//
// PLAYOFFS: weeks 23 (Quarterfinals), 24 (Semifinals), 25 (Final) are RESERVED
// for the State Championship Tournament. Bracket games depend on final standings
// (top 8 by record), so they are created at end of regular season by simService
// (Phase 5). Here we only build the regular season + document the reserved slots.

const db = require('../db/connection');
const { makeRng, mixSeed } = require('../lib/rng');
const { getTeams } = require('./leagueService');

const REG_WEEKS = 22;
const PLAYOFF_WEEKS = { QF: 23, SF: 24, FINAL: 25 };

function generateSchedule(careerId) {
  const career = db.prepare('SELECT seed, season_year FROM careers WHERE id=?').get(careerId);
  const teamIds = getTeams(careerId).map((t) => t.id);
  const n = teamIds.length; // 12

  // Circle method: fix the first team, rotate the rest.
  const fixed = teamIds[0];
  let rot = teamIds.slice(1);
  const firstLeg = [];
  for (let r = 0; r < n - 1; r++) {
    const line = [fixed, ...rot];
    const round = [];
    for (let i = 0; i < n / 2; i++) {
      const a = line[i];
      const b = line[n - 1 - i];
      // Alternate home/away across rounds so home games spread evenly.
      round.push(r % 2 === 0 ? [a, b] : [b, a]);
    }
    firstLeg.push(round);
    rot.unshift(rot.pop()); // rotate
  }

  // Second leg mirrors the first with home/away swapped.
  const secondLeg = firstLeg.map((round) => round.map(([h, a]) => [a, h]));

  // Combine and shuffle the 22 weeks (seeded) so the slate isn't predictable.
  const rng = makeRng(mixSeed(career.seed, 999));
  const allWeeks = rng.shuffle([...firstLeg, ...secondLeg]);

  const insert = db.prepare(`INSERT INTO games
    (career_id, season_year, week, home_team_id, away_team_id, played, is_playoff)
    VALUES (?,?,?,?,?,0,0)`);

  const tx = db.transaction(() => {
    allWeeks.forEach((round, idx) => {
      const week = idx + 1;
      for (const [home, away] of round) {
        insert.run(careerId, career.season_year, week, home, away);
      }
    });
  });
  tx();
}

// Full schedule for a season, joined with team identity for rendering.
function getSchedule(careerId, seasonYear) {
  const career = db.prepare('SELECT season_year FROM careers WHERE id=?').get(careerId);
  const year = seasonYear || career.season_year;
  return db.prepare(`
    SELECT g.*,
           h.name AS home_name, h.abbrev AS home_abbrev,
           h.color_primary AS home_color, h.color_secondary AS home_color2,
           a.name AS away_name, a.abbrev AS away_abbrev,
           a.color_primary AS away_color, a.color_secondary AS away_color2
    FROM games g
    JOIN teams h ON h.id = g.home_team_id
    JOIN teams a ON a.id = g.away_team_id
    WHERE g.career_id=? AND g.season_year=?
    ORDER BY g.week, g.id
  `).all(careerId, year);
}

module.exports = { generateSchedule, getSchedule, REG_WEEKS, PLAYOFF_WEEKS };
