// Career lifecycle: create (which triggers full league/roster/schedule
// generation), load, and list. All generation runs in a single transaction so
// a new career is all-or-nothing.

const db = require('../db/connection');
const { generateLeague, getTeams } = require('./leagueService');
const { generateRoster } = require('./rosterService');
const { generateSchedule } = require('./scheduleService');

const VALID_ARCHETYPES = ['Motivator', 'Recruiter', 'Tactician', 'Developer'];

function createCareer(data = {}) {
  const coachFirst = String(data.coachFirst || '').trim();
  const coachLast = String(data.coachLast || '').trim();
  const coachAge = Number(data.coachAge) || 35;
  const archetype = VALID_ARCHETYPES.includes(data.archetype) ? data.archetype : 'Tactician';

  if (!coachFirst || !coachLast) {
    throw new Error('Coach first and last name are required.');
  }

  // Seed: explicit (for demo/reproducibility) or random.
  const seed = data.seed != null && data.seed !== ''
    ? (Number(data.seed) >>> 0)
    : (Math.floor(Math.random() * 0xffffffff) >>> 0);

  const create = db.transaction(() => {
    const info = db.prepare(`INSERT INTO careers
      (coach_first, coach_last, coach_age, archetype, seed, season_year, current_week, reputation)
      VALUES (?,?,?,?,?,1,1,50)`).run(coachFirst, coachLast, coachAge, archetype, seed);
    const careerId = info.lastInsertRowid;

    // 1. League (12 teams). User identity optional.
    const userTeamId = generateLeague(careerId, {
      teamCity: data.teamCity || null,
      teamMascot: data.teamMascot || null,
    });
    db.prepare('UPDATE careers SET team_id=? WHERE id=?').run(userTeamId, careerId);

    // 2. Rosters (12 players each), with default team settings.
    const teams = getTeams(careerId);
    const settingsStmt = db.prepare(
      'INSERT INTO team_settings (career_id, team_id) VALUES (?, ?)'
    );
    teams.forEach((team, idx) => {
      generateRoster(careerId, team.id, idx, seed);
      settingsStmt.run(careerId, team.id);
    });

    // 3. Schedule (22-game regular season; playoff weeks reserved).
    generateSchedule(careerId);

    // 4. Season record.
    db.prepare('INSERT INTO seasons (career_id, year) VALUES (?, 1)').run(careerId);

    return careerId;
  });

  const careerId = create();
  return getCareer(careerId);
}

// Load a career plus its user team. Returns { career, team }.
function getCareer(id) {
  const career = db.prepare('SELECT * FROM careers WHERE id=?').get(id);
  if (!career) throw new Error('Career not found.');
  const team = career.team_id
    ? db.prepare('SELECT * FROM teams WHERE id=?').get(career.team_id)
    : null;
  return { career, team };
}

// List all careers with their team name + a quick record summary for the Home
// screen. Record is computed from played games.
function listCareers() {
  const careers = db.prepare('SELECT * FROM careers ORDER BY updated_at DESC, id DESC').all();
  return careers.map((c) => {
    const team = c.team_id ? db.prepare('SELECT name, abbrev, color_primary, color_secondary FROM teams WHERE id=?').get(c.team_id) : null;
    const rec = db.prepare(`
      SELECT
        SUM(CASE WHEN (home_team_id=@t AND home_score>away_score) OR (away_team_id=@t AND away_score>home_score) THEN 1 ELSE 0 END) AS wins,
        SUM(CASE WHEN (home_team_id=@t AND home_score<away_score) OR (away_team_id=@t AND away_score<home_score) THEN 1 ELSE 0 END) AS losses
      FROM games WHERE career_id=@c AND played=1 AND (home_team_id=@t OR away_team_id=@t)
    `).get({ t: c.team_id, c: c.id });
    return {
      id: c.id,
      coach: `${c.coach_first} ${c.coach_last}`,
      archetype: c.archetype,
      season_year: c.season_year,
      current_week: c.current_week,
      team,
      wins: rec.wins || 0,
      losses: rec.losses || 0,
    };
  });
}

function deleteCareer(id) {
  const info = db.prepare('DELETE FROM careers WHERE id=?').run(id);
  return info.changes > 0;
}

module.exports = { createCareer, getCareer, listCareers, deleteCareer, VALID_ARCHETYPES };
