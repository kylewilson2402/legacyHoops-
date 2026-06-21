// Recruiting: generate incoming freshman classes, scout them, spend a weekly
// action budget to raise interest, and resolve commitments at season's end.
// Committed recruits are signed as grade-9 players (used by the Phase 8 rollover).

const db = require('../db/connection');
const { makeRng, mixSeed } = require('../lib/rng');
const { FIRST_NAMES, LAST_NAMES, ATTR_LABELS } = require('../lib/names');
const { computeOverall } = require('./rosterService');

let recordCommitNews = null; // wired by newsService in Phase 7 (optional hook)
function setNewsHook(fn) { recordCommitNews = fn; }

const ATTRS = ['shooting', 'finishing', 'passing', 'defense', 'rebounding', 'athleticism'];
const POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C'];
const WEEKLY_BUDGET = 5;

// Recruiting actions and the interest they add (before bonuses).
const ACTIONS = {
  letter: { label: 'Send letter', gain: 4 },
  visit: { label: 'Home visit', gain: 9 },
  offer: { label: 'Offer scholarship', gain: 16 },
};

// Star tier from potential.
function tierOf(pot) {
  if (pot >= 90) return 5;
  if (pot >= 82) return 4;
  if (pot >= 74) return 3;
  if (pot >= 65) return 2;
  return 1;
}

// Build a strengths/weaknesses blurb from the attribute spread.
function describe(attrs) {
  const sorted = [...ATTRS].sort((a, b) => attrs[b] - attrs[a]);
  const strengths = sorted.slice(0, 2).map((k) => ATTR_LABELS[k]);
  const weaknesses = sorted.slice(-2).map((k) => ATTR_LABELS[k]);
  return { strengths: strengths.join(', '), weaknesses: weaknesses.join(', ') };
}

// Generate a class of recruits for `classYear` (the season they enter as
// freshmen). Deterministic from the career seed + class year.
function generateRecruitClass(careerId, classYear) {
  const career = db.prepare('SELECT seed FROM careers WHERE id=?').get(careerId);
  const rng = makeRng(mixSeed(career.seed, 5000 + classYear));
  const firsts = rng.shuffle(FIRST_NAMES);
  const lasts = rng.shuffle(LAST_NAMES);

  const size = rng.randInt(28, 36);
  const insert = db.prepare(`INSERT INTO recruits
    (career_id, class_year, first, last, position, potential, strengths, weaknesses,
     shooting, finishing, passing, defense, rebounding, athleticism, interest, scouted)
    VALUES (@career_id,@class_year,@first,@last,@position,@potential,@strengths,@weaknesses,
     @shooting,@finishing,@passing,@defense,@rebounding,@athleticism,0,0)`);

  const tx = db.transaction(() => {
    for (let i = 0; i < size; i++) {
      const position = rng.pick(POSITIONS);
      // Potential tiers: most recruits are average; a few are special.
      const potential = rng.weighted([
        [rng.gaussianClamp(94, 3, 90, 99), 4],   // 5-star
        [rng.gaussianClamp(85, 2, 82, 89), 10],  // 4-star
        [rng.gaussianClamp(77, 2, 74, 81), 26],  // 3-star
        [rng.gaussianClamp(69, 3, 65, 73), 35],  // 2-star
        [rng.gaussianClamp(58, 4, 50, 64), 25],  // unranked
      ]);
      // Incoming freshmen are raw — current attributes well below ceiling.
      const a = {};
      for (const k of ATTRS) a[k] = rng.gaussianClamp(potential - 22, 7, 35, potential);
      // Bias attributes toward the position's identity.
      const bias = { PG: 'passing', SG: 'shooting', SF: 'athleticism', PF: 'rebounding', C: 'rebounding' }[position];
      a[bias] = Math.min(potential, a[bias] + rng.randInt(3, 8));
      const { strengths, weaknesses } = describe(a);

      insert.run({
        career_id: careerId, class_year: classYear,
        first: firsts[i % firsts.length], last: lasts[(i * 5 + classYear) % lasts.length],
        position, potential, strengths, weaknesses, ...a,
      });
    }
  });
  tx();
}

// The class entering NEXT season (current recruiting target). Lazily generated.
function getRecruitingClass(careerId) {
  const career = db.prepare('SELECT season_year, current_week, archetype, team_id FROM careers WHERE id=?').get(careerId);
  const classYear = career.season_year + 1;
  let recruits = db.prepare('SELECT * FROM recruits WHERE career_id=? AND class_year=?').all(careerId, classYear);
  if (!recruits.length) {
    generateRecruitClass(careerId, classYear);
    recruits = db.prepare('SELECT * FROM recruits WHERE career_id=? AND class_year=?').all(careerId, classYear);
  }

  const budget = getBudget(careerId);
  const isRecruiter = career.archetype === 'Recruiter';

  const view = recruits.map((r) => publicView(r, isRecruiter, career.team_id));
  const committed = view.filter((r) => r.committed_to_user);
  return {
    classYear,
    budget,
    recruits: view.filter((r) => !r.committed_team_id || r.committed_to_user),
    committed,
  };
}

// Apply fog-of-war: hide attributes/potential until scouted.
function publicView(r, isRecruiter, userTeamId) {
  const base = {
    id: r.id, first: r.first, last: r.last, position: r.position,
    interest: r.interest, scouted: !!r.scouted,
    committed_team_id: r.committed_team_id,
    committed_to_user: r.committed_team_id === userTeamId,
  };
  if (r.committed_team_id && !base.committed_to_user) {
    const t = db.prepare('SELECT name FROM teams WHERE id=?').get(r.committed_team_id);
    base.committed_team_name = t ? t.name : 'another program';
  }
  if (r.scouted) {
    const attrs = Object.fromEntries(ATTRS.map((k) => [k, r[k]]));
    base.potential = r.potential;
    base.tier = tierOf(r.potential);
    base.overall = computeOverall(r.position, attrs);
    base.strengths = r.strengths;
    base.weaknesses = r.weaknesses;
    Object.assign(base, attrs);
    // Recruiter sees an exact ceiling; others see a +/- range hint.
    base.potential_known = isRecruiter ? 'exact' : 'approx';
  } else {
    base.tier = null;
  }
  return base;
}

// ---- weekly action budget -----------------------------------------------

function getBudget(careerId) {
  const c = db.prepare('SELECT season_year, current_week FROM careers WHERE id=?').get(careerId);
  const row = db.prepare('SELECT count FROM recruit_actions WHERE career_id=? AND season_year=? AND week=?')
    .get(careerId, c.season_year, c.current_week);
  const used = row ? row.count : 0;
  return { used, max: WEEKLY_BUDGET, remaining: Math.max(0, WEEKLY_BUDGET - used), week: c.current_week };
}

function spendAction(careerId) {
  const c = db.prepare('SELECT season_year, current_week FROM careers WHERE id=?').get(careerId);
  db.prepare(`INSERT INTO recruit_actions (career_id, season_year, week, count)
    VALUES (?,?,?,1)
    ON CONFLICT(career_id, season_year, week) DO UPDATE SET count = count + 1`)
    .run(careerId, c.season_year, c.current_week);
}

// ---- player-facing actions ----------------------------------------------

function scoutRecruit(careerId, recruitId) {
  const r = db.prepare('SELECT * FROM recruits WHERE career_id=? AND id=?').get(careerId, recruitId);
  if (!r) throw new Error('Recruit not found.');
  if (r.committed_team_id) throw new Error('That recruit has already committed.');
  if (!r.scouted) {
    const budget = getBudget(careerId);
    if (budget.remaining <= 0) throw new Error('No recruiting actions left this week.');
    db.prepare('UPDATE recruits SET scouted=1 WHERE id=?').run(recruitId);
    spendAction(careerId);
  }
  const career = db.prepare('SELECT archetype, team_id FROM careers WHERE id=?').get(careerId);
  return publicView(db.prepare('SELECT * FROM recruits WHERE id=?').get(recruitId), career.archetype === 'Recruiter', career.team_id);
}

function recruitAction(careerId, recruitId, action) {
  const spec = ACTIONS[action];
  if (!spec) throw new Error('Unknown recruiting action.');
  const r = db.prepare('SELECT * FROM recruits WHERE career_id=? AND id=?').get(careerId, recruitId);
  if (!r) throw new Error('Recruit not found.');
  if (r.committed_team_id) throw new Error('That recruit has already committed.');

  const budget = getBudget(careerId);
  if (budget.remaining <= 0) throw new Error('No recruiting actions left this week.');

  const career = db.prepare('SELECT archetype FROM careers WHERE id=?').get(careerId);
  const mult = career.archetype === 'Recruiter' ? 1.35 : 1.0;
  const gain = Math.round(spec.gain * mult);
  const interest = Math.max(0, Math.min(100, r.interest + gain));

  db.prepare('UPDATE recruits SET interest=? WHERE id=?').run(interest, recruitId);
  spendAction(careerId);
  return { recruitId, action, gain, interest, budget: getBudget(careerId) };
}

// ---- end-of-season resolution -------------------------------------------

// Decide where uncommitted recruits land. Recruits the user courted (high
// interest) + a strong program reputation pull commits to the user team.
function resolveCommitments(careerId) {
  const career = db.prepare('SELECT seed, season_year, team_id, archetype, reputation FROM careers WHERE id=?').get(careerId);
  const classYear = career.season_year + 1;
  const rng = makeRng(mixSeed(career.seed, 7000 + classYear));
  const recruits = db.prepare('SELECT * FROM recruits WHERE career_id=? AND class_year=? AND committed_team_id IS NULL')
    .all(careerId, classYear);
  const aiTeams = db.prepare('SELECT id FROM teams WHERE career_id=? AND is_user_team=0').all(careerId).map((t) => t.id);

  const recruiterBonus = career.archetype === 'Recruiter' ? 14 : 0;
  const userCommits = [];

  const tx = db.transaction(() => {
    for (const r of recruits) {
      // Score the user's pull on this recruit.
      const score = r.interest + career.reputation * 0.25 + recruiterBonus + rng.gaussian(0, 8);
      const commitsToUser = r.interest >= 25 && rng.chance(Math.max(0.02, Math.min(0.95, score / 110)));
      if (commitsToUser && userCommits.length < 6) {
        db.prepare('UPDATE recruits SET committed_team_id=? WHERE id=?').run(career.team_id, r.id);
        userCommits.push(r);
      } else {
        // Everyone else commits somewhere (or nowhere for the weakest).
        if (r.potential >= 60 || rng.chance(0.5)) {
          db.prepare('UPDATE recruits SET committed_team_id=? WHERE id=?').run(rng.pick(aiTeams), r.id);
        }
      }
    }
  });
  tx();

  // News hook (Phase 7).
  if (recordCommitNews) {
    for (const r of userCommits) {
      try { recordCommitNews(careerId, r); } catch (e) { /* never break rollover */ }
    }
  }
  return { committedToUser: userCommits.length };
}

// Convert the user's committed recruits into grade-9 players. Called by the
// Phase 8 rollover after the season advances.
function signCommittedRecruits(careerId) {
  const career = db.prepare('SELECT season_year, team_id FROM careers WHERE id=?').get(careerId);
  // After advanceSeason increments season_year, the freshmen are those whose
  // class_year == the (new) season_year.
  const recruits = db.prepare('SELECT * FROM recruits WHERE career_id=? AND class_year=? AND committed_team_id=?')
    .all(careerId, career.season_year, career.team_id);

  const insert = db.prepare(`INSERT INTO players
    (career_id, team_id, first, last, position, grade,
     shooting, finishing, passing, defense, rebounding, athleticism, potential, overall)
    VALUES (?,?,?,?,?,9,?,?,?,?,?,?,?,?)`);

  const tx = db.transaction(() => {
    for (const r of recruits) {
      const attrs = { shooting: r.shooting, finishing: r.finishing, passing: r.passing, defense: r.defense, rebounding: r.rebounding, athleticism: r.athleticism };
      const overall = computeOverall(r.position, attrs);
      insert.run(careerId, career.team_id, r.first, r.last, r.position,
        r.shooting, r.finishing, r.passing, r.defense, r.rebounding, r.athleticism, r.potential, overall);
    }
  });
  tx();
  return { signed: recruits.length };
}

module.exports = {
  generateRecruitClass, getRecruitingClass, scoutRecruit, recruitAction,
  resolveCommitments, signCommittedRecruits, setNewsHook,
  WEEKLY_BUDGET, ACTIONS,
};
