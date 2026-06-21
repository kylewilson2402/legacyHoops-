// Template-driven news (no AI). Banks of headlines/bodies keyed by category,
// with {token} substitution. Hooked into simService (post-game) and
// recruitService (commitments) so the feed reacts to what happens in the game.

const db = require('../db/connection');
const { makeRng, mixSeed } = require('../lib/rng');
const simService = require('./simService');
const recruitService = require('./recruitService');

// ---- template banks ------------------------------------------------------
// Tokens: {team} {opp} {score} {player} {pts} {streak}
const TEMPLATES = {
  big_win: {
    tag: 'Recap',
    headlines: [
      '{team} take down {opp}, {score}',
      '{team} hold off {opp} {score}',
      '{player} leads {team} past {opp}',
    ],
    bodies: [
      '{team} grabbed a {score} win over {opp} behind {player}\'s {pts} points.',
      'A balanced effort carried {team} to a {score} victory against {opp}. {player} paced the offense with {pts}.',
      '{team} controlled the second half to beat {opp} {score}. {player} finished with {pts} points.',
    ],
  },
  blowout: {
    tag: 'Blowout',
    headlines: [
      '{team} run away from {opp}, {score}',
      '{team} bury {opp} in a {score} rout',
    ],
    bodies: [
      'It was never close. {team} dismantled {opp} {score}, led by {player}\'s {pts} points.',
      '{team} poured it on early and cruised past {opp} {score}. {player} dropped {pts}.',
    ],
  },
  upset: {
    tag: 'Upset',
    headlines: [
      'Stunner: {team} shock {opp}, {score}',
      'Upset alert — {team} knock off {opp}',
      '{team} pull the upset over {opp}, {score}',
    ],
    bodies: [
      'Few saw it coming. Underdog {team} stunned {opp} {score}, with {player} scoring {pts}.',
      '{team} weren\'t supposed to win this one — but they did, {score} over {opp}. {player} led the way with {pts}.',
    ],
  },
  loss: {
    tag: 'Recap',
    headlines: [
      '{opp} get past {team}, {score}',
      '{team} fall to {opp} {score}',
    ],
    bodies: [
      '{team} couldn\'t close it out, dropping a {score} decision to {opp}. {player} led {team} with {pts}.',
      '{opp} handed {team} a {score} loss. {player} had {pts} in the defeat.',
    ],
  },
  playoff_win: {
    tag: 'Playoffs',
    headlines: [
      '{team} advance past {opp}, {score}',
      'Playoffs: {team} eliminate {opp} {score}',
    ],
    bodies: [
      '{team} punched their ticket to the next round with a {score} win over {opp}. {player} led all scorers with {pts}.',
      'Win or go home — {team} delivered, beating {opp} {score} behind {player}\'s {pts}.',
    ],
  },
  title: {
    tag: 'Championship',
    headlines: [
      'CHAMPIONS! {team} win the state title',
      '{team} are state champions, beating {opp} {score}',
    ],
    bodies: [
      '{team} are state champions! They beat {opp} {score} in the final, with {player} scoring {pts}.',
      'The trophy belongs to {team}. A {score} win over {opp} sealed the championship, {player} leading the way with {pts}.',
    ],
  },
  commitment: {
    tag: 'Recruiting',
    headlines: [
      '{player} commits to {team}',
      '{team} land {player}',
      'Recruiting win: {player} picks {team}',
    ],
    bodies: [
      '{player}, a {pts} prospect, has committed to {team} and will join as a freshman next season.',
      '{team} have secured a commitment from {player} ({pts}). The {opp} will suit up next year.',
    ],
  },
  milestone: {
    tag: 'Milestone',
    headlines: [
      '{player} erupts for {pts}',
      '{player} goes off for {pts} points',
    ],
    bodies: [
      '{player} put on a show with {pts} points for {team} against {opp}.',
      'A career night for {player}: {pts} points in {team}\'s game with {opp}.',
    ],
  },
};

function fill(str, tokens) {
  return str.replace(/\{(\w+)\}/g, (_, k) => (tokens[k] != null ? tokens[k] : ''));
}

function addNews(careerId, category, tokens, week, rng) {
  const t = TEMPLATES[category];
  if (!t) return;
  const headline = fill(rng.pick(t.headlines), tokens);
  const body = fill(rng.pick(t.bodies), tokens);
  const c = db.prepare('SELECT season_year FROM careers WHERE id=?').get(careerId);
  db.prepare('INSERT INTO news (career_id, season_year, week, headline, body, category) VALUES (?,?,?,?,?,?)')
    .run(careerId, c.season_year, week, headline, body, t.tag);
}

// ---- hooks ---------------------------------------------------------------

function rosterAvgOverall(lines) {
  // Use the box-score lines' players' season overalls via a lookup.
  const ids = lines.map((l) => l.player_id);
  if (!ids.length) return 0;
  const rows = db.prepare(`SELECT overall FROM players WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids);
  return rows.reduce((s, r) => s + r.overall, 0) / rows.length;
}

function topScorerOf(lines) {
  return lines.reduce((best, l) => (l.pts > best.pts ? l : best), lines[0]);
}
function playerName(careerId, playerId) {
  const p = db.prepare('SELECT first, last FROM players WHERE id=?').get(playerId);
  return p ? `${p.first} ${p.last}` : 'A player';
}

// Called from simService after each game.
function recordGameNews(careerId, ctx) {
  const { game, home, away, homeScore, awayScore, homeLines, awayLines } = ctx;
  const career = db.prepare('SELECT seed, team_id FROM careers WHERE id=?').get(careerId);
  const rng = makeRng(mixSeed(career.seed, game.id * 7 + 13));

  const homeWon = homeScore > awayScore;
  const winner = homeWon ? home : away;
  const loser = homeWon ? away : home;
  const winLines = homeWon ? homeLines : awayLines;
  const wScore = Math.max(homeScore, awayScore);
  const lScore = Math.min(homeScore, awayScore);
  const margin = wScore - lScore;

  const winAvg = rosterAvgOverall(winLines);
  const loseAvg = rosterAvgOverall(homeWon ? awayLines : homeLines);
  const isUpset = (loseAvg - winAvg) >= 6;
  const isBlowout = margin >= 22;
  const userInvolved = home.id === career.team_id || away.id === career.team_id;
  const isFinal = game.is_playoff && game.round === 'Final';

  const top = topScorerOf(winLines);
  const tokens = {
    team: winner.name, opp: loser.name, score: `${wScore}-${lScore}`,
    player: playerName(careerId, top.player_id), pts: top.pts,
  };

  // Decide category (and whether to publish at all).
  let category = null;
  if (isFinal) category = 'title';
  else if (game.is_playoff) category = 'playoff_win';
  else if (isUpset) category = 'upset';
  else if (userInvolved) {
    const userWon = (homeWon && home.id === career.team_id) || (!homeWon && away.id === career.team_id);
    if (userWon) category = isBlowout ? 'blowout' : 'big_win';
    else {
      // user lost — frame from their perspective
      category = 'loss';
      tokens.team = home.id === career.team_id ? home.name : away.name;
      tokens.opp = winner.name;
      const userLines = home.id === career.team_id ? homeLines : awayLines;
      const userTop = topScorerOf(userLines);
      tokens.player = playerName(careerId, userTop.player_id);
      tokens.pts = userTop.pts;
    }
  } else if (isBlowout) category = 'blowout';

  if (category) addNews(careerId, category, tokens, game.week, rng);

  // Milestone: a 30+ point game from anyone in a user-involved game.
  if (userInvolved) {
    for (const l of [...homeLines, ...awayLines]) {
      if (l.pts >= 30) {
        addNews(careerId, 'milestone', {
          team: l.team_id === home.id ? home.name : away.name,
          opp: l.team_id === home.id ? away.name : home.name,
          player: playerName(careerId, l.player_id), pts: l.pts,
        }, game.week, rng);
        break;
      }
    }
  }
}

// Called from recruitService when a recruit commits to the user.
function recordCommitNews(careerId, recruit) {
  const career = db.prepare('SELECT seed, team_id, current_week FROM careers WHERE id=?').get(careerId);
  const team = db.prepare('SELECT name FROM teams WHERE id=?').get(career.team_id);
  const rng = makeRng(mixSeed(career.seed, recruit.id * 17 + 3));
  const tier = recruit.potential >= 90 ? '5-star' : recruit.potential >= 82 ? '4-star' : recruit.potential >= 74 ? '3-star' : '2-star';
  addNews(careerId, 'commitment', {
    team: team.name, opp: `${recruit.position}`,
    player: `${recruit.first} ${recruit.last}`, pts: tier,
  }, career.current_week, rng);
}

// ---- reads ---------------------------------------------------------------

function getNews(careerId, { page = 1, limit = 15, category = null } = {}) {
  const offset = (Math.max(1, page) - 1) * limit;
  const where = ['career_id=?'];
  const args = [careerId];
  if (category) { where.push('category=?'); args.push(category); }
  const whereSql = where.join(' AND ');
  const total = db.prepare(`SELECT COUNT(*) c FROM news WHERE ${whereSql}`).get(...args).c;
  const items = db.prepare(
    `SELECT * FROM news WHERE ${whereSql} ORDER BY id DESC LIMIT ? OFFSET ?`
  ).all(...args, limit, offset);
  return { items, page, limit, total, hasMore: offset + items.length < total };
}

// Register hooks with the producing services.
simService.setNewsHook(recordGameNews);
recruitService.setNewsHook(recordCommitNews);

module.exports = { generateNews: addNews, getNews, recordGameNews, recordCommitNews, TEMPLATES };
