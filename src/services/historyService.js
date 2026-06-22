// Season rollover + career/league history.
//
// advanceSeason runs the full offseason in one transaction:
//   develop players → resolve recruit commitments → graduate seniors →
//   age up returning players → increment the year → sign committed freshmen →
//   backfill every roster to 12 → generate next recruit class → create the new
//   schedule → recompute reputation. Returns an offseason summary for the UI.

const db = require('../db/connection');
const { makeRng, mixSeed } = require('../lib/rng');
const { FIRST_NAMES, LAST_NAMES } = require('../lib/names');
const { computeOverall, ATTRS } = require('./rosterService');
const { developPlayers } = require('./developService');
const { resolveCommitments, signCommittedRecruits, generateRecruitClass } = require('./recruitService');
const { generateSchedule } = require('./scheduleService');

const ROSTER_MIN = 12;  // fill up to here with walk-ons
const ROSTER_MAX = 15;  // trim down to here (protecting new freshmen)
const POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C'];

// Reputation from the full career record: titles + playoff runs + win rate.
function computeReputation(careerId) {
  const hist = db.prepare('SELECT * FROM career_history WHERE career_id=?').all(careerId);
  let rep = 40;
  for (const h of hist) {
    rep += (h.wins - 11) * 0.6;       // above/below .500
    rep += h.made_playoffs ? 5 : 0;
    rep += h.won_championship ? 18 : 0;
  }
  return Math.max(1, Math.min(100, Math.round(rep)));
}

// Keep a roster within [12, 15]: fill shortfalls with raw grade-9 walk-ons;
// trim overflow by cutting the lowest-overall players (protecting this year's
// freshmen, who are the recruits/signees).
function reconcileTeam(careerId, teamId, rng) {
  const active = db.prepare(`SELECT id, overall, grade FROM players WHERE career_id=? AND team_id=? AND status='active'`).all(careerId, teamId);

  if (active.length < ROSTER_MIN) {
    const need = ROSTER_MIN - active.length;
    const teamAvg = active.length ? active.reduce((s, p) => s + p.overall, 0) / active.length : 60;
    const insert = db.prepare(`INSERT INTO players
      (career_id, team_id, first, last, position, grade,
       shooting, finishing, passing, defense, rebounding, athleticism, potential, overall)
      VALUES (?,?,?,?,?,9,?,?,?,?,?,?,?,?)`);
    for (let i = 0; i < need; i++) {
      const position = rng.pick(POSITIONS);
      const a = {};
      for (const k of ATTRS) a[k] = rng.gaussianClamp(teamAvg - 16, 7, 35, 90);
      const overall = computeOverall(position, a);
      const potential = Math.max(overall, Math.min(99, overall + rng.gaussianClamp(14, 5, 2, 30)));
      insert.run(careerId, teamId,
        rng.pick(FIRST_NAMES), rng.pick(LAST_NAMES), position,
        a.shooting, a.finishing, a.passing, a.defense, a.rebounding, a.athleticism, potential, overall);
    }
  } else if (active.length > ROSTER_MAX) {
    const overBy = active.length - ROSTER_MAX;
    // Cut order: upperclassmen by lowest overall first, then freshmen last.
    const nonFresh = active.filter((p) => p.grade >= 10).sort((a, b) => a.overall - b.overall);
    const fresh = active.filter((p) => p.grade === 9).sort((a, b) => a.overall - b.overall);
    const cuts = [...nonFresh, ...fresh].slice(0, overBy);
    const cut = db.prepare("UPDATE players SET status='cut' WHERE id=?");
    cuts.forEach((p) => cut.run(p.id));
  }
}

function advanceSeason(careerId) {
  const career = db.prepare('SELECT * FROM careers WHERE id=?').get(careerId);
  if (!career) throw new Error('Career not found.');
  if (career.current_week <= 25) throw new Error('Finish the current season before advancing.');

  const oldYear = career.season_year;
  const newYear = oldYear + 1;
  const rng = makeRng(mixSeed(career.seed, 8000 + newYear));

  let result;
  const tx = db.transaction(() => {
    // 1. Development (uses the season-just-played stats).
    const developed = developPlayers(careerId);

    // 2. Recruit commitments resolve (class_year = oldYear+1 = newYear).
    resolveCommitments(careerId);

    // 3. Graduate seniors (capture the user's outgoing class first).
    const graduated = db.prepare(
      `SELECT first, last, position FROM players WHERE career_id=? AND team_id=? AND grade=12 AND status='active'`
    ).all(careerId, career.team_id).map((p) => ({ name: `${p.first} ${p.last}`, position: p.position }));
    db.prepare(`UPDATE players SET status='graduated' WHERE career_id=? AND grade=12 AND status='active'`).run(careerId);

    // 4. Age up everyone still active.
    db.prepare(`UPDATE players SET grade=grade+1 WHERE career_id=? AND status='active'`).run(careerId);

    // 5. Advance the calendar.
    db.prepare(`UPDATE careers SET season_year=?, current_week=1, updated_at=datetime('now') WHERE id=?`).run(newYear, careerId);

    // 6. Sign the user's committed recruits as freshmen (class_year == newYear).
    signCommittedRecruits(careerId);
    const signed = db.prepare(
      `SELECT first, last, position, overall, potential FROM players
       WHERE career_id=? AND team_id=? AND grade=9 AND status='active'
       ORDER BY id DESC`
    ).all(careerId, career.team_id).map((p) => ({ name: `${p.first} ${p.last}`, position: p.position, overall: p.overall, potential: p.potential }));

    // 7. Backfill every roster to 12 (walk-ons). User signings count first, so
    //    only the remaining slots fill — and the `signed` list above already
    //    captured commits; trim walk-ons out of the signed display.
    const teams = db.prepare('SELECT id FROM teams WHERE career_id=?').all(careerId);
    const userSignedBefore = signed.length;
    teams.forEach((t) => reconcileTeam(careerId, t.id, rng));
    // Recompute the user's freshman list to show committed signees only (the
    // committed recruits) by matching against recruits table.
    const committedNames = new Set(
      db.prepare("SELECT first || ' ' || last AS n FROM recruits WHERE career_id=? AND class_year=? AND committed_team_id=?")
        .all(careerId, newYear, career.team_id).map((r) => r.n)
    );
    const signedReal = signed.filter((s) => committedNames.has(s.name));

    // 8. Next recruiting class.
    generateRecruitClass(careerId, newYear + 1);

    // 9. New season scaffolding: seasons row + schedule.
    db.prepare('INSERT INTO seasons (career_id, year) VALUES (?, ?)').run(careerId, newYear);
    generateSchedule(careerId);

    // 10. Reputation.
    const reputation = computeReputation(careerId);
    db.prepare('UPDATE careers SET reputation=? WHERE id=?').run(reputation, careerId);

    result = {
      season_year: newYear,
      developed,
      graduated,
      signed: signedReal.length ? signedReal : signed.slice(0, userSignedBefore),
      reputation,
    };
  });
  tx();
  return result;
}

// Career + league history for the History view.
function getHistory(careerId) {
  const career = db.prepare('SELECT * FROM careers WHERE id=?').get(careerId);
  if (!career) throw new Error('Career not found.');

  const champions = db.prepare(`
    SELECT s.year, t.id team_id, t.name, t.abbrev, t.color_primary, t.color_secondary
    FROM seasons s LEFT JOIN teams t ON t.id = s.champion_team_id
    WHERE s.career_id=? AND s.champion_team_id IS NOT NULL
    ORDER BY s.year DESC`).all(careerId);

  const dynasty = db.prepare('SELECT * FROM career_history WHERE career_id=? ORDER BY season_year').all(careerId);

  const totals = dynasty.reduce((acc, h) => {
    acc.wins += h.wins; acc.losses += h.losses;
    acc.titles += h.won_championship; acc.playoffs += h.made_playoffs;
    if (acc.bestRank === null || (h.final_rank && h.final_rank < acc.bestRank)) acc.bestRank = h.final_rank;
    return acc;
  }, { wins: 0, losses: 0, titles: 0, playoffs: 0, bestRank: null });

  return { career, champions, dynasty, totals };
}

module.exports = { advanceSeason, getHistory, computeReputation };
