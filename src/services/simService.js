// Game simulation engine — the core loop.
//
// MODEL (documented):
//  1. Each team fields a rotation (configured minutes, else top-8 by overall).
//  2. Effective OFFENSE/DEFENSE ratings are minute-weighted blends of player
//     attributes, nudged by strategy fit, tempo, coach archetype, and (home)
//     court. See effRatings().
//  3. Possessions come from both teams' tempo. Each team's points =
//     possessions * points-per-possession, where PPP scales with
//     (ownOffense − oppDefense) plus seeded gaussian noise → upsets happen.
//  4. Team points are distributed to rotation players by usage (minutes *
//     scoring skill), then each player's points are decomposed into makes/
//     attempts (2s + 3s; no free throws in this MVP, so PTS = 2*FG + 3PM and
//     player points always sum exactly to the team score). Rebounds, assists,
//     steals, blocks, turnovers are distributed by the relevant attributes.
//  5. team_game_stats are the sums of the player lines — internally consistent.

const db = require('../db/connection');
const { makeRng, mixSeed } = require('../lib/rng');
const { computeStandings, REG_WEEKS, PLAYOFF_WEEKS } = require('./scheduleService');

let recordGameNews = null; // wired by newsService in Phase 7 (optional hook)
function setNewsHook(fn) { recordGameNews = fn; }

// ---- helpers -------------------------------------------------------------

// Largest-remainder integer distribution: split `total` across `weights`,
// returning ints that sum exactly to total.
function distributeInt(total, weights) {
  const sum = weights.reduce((s, w) => s + w, 0) || 1;
  const raw = weights.map((w) => (w / sum) * total);
  const floors = raw.map((x) => Math.floor(x));
  let rem = total - floors.reduce((s, x) => s + x, 0);
  const order = raw.map((x, i) => [i, x - Math.floor(x)]).sort((a, b) => b[1] - a[1]);
  for (let k = 0; k < rem; k++) floors[order[k % order.length][0]]++;
  return floors;
}

const TEMPO_POSS = { Slow: -7, Balanced: 0, Fast: 8 };

// Strategy "fit" — does the style suit the rotation? Small, rewards Tacticians.
function strategyFit(off, rotation) {
  const avg = (k) => rotation.reduce((s, r) => s + r.player[k] * r.share, 0);
  const shoot = avg('shooting'), pass = avg('passing'), reb = avg('rebounding'), fin = avg('finishing');
  switch (off) {
    case 'Pace & Space': return (shoot - 60) * 0.15;
    case 'Inside-Out': return (reb + fin - 120) * 0.08;
    case 'Motion': return (pass - 58) * 0.15;
    case 'Iso-Heavy': return (fin - 60) * 0.12;
    default: return 0;
  }
}

// Build a team's rotation: [{ player, share }] with shares summing to 1.
function getRotation(careerId, teamId) {
  const players = db.prepare(
    `SELECT * FROM players WHERE career_id=? AND team_id=? AND status='active' ORDER BY overall DESC`
  ).all(careerId, teamId);

  const configured = players.filter((p) => p.minutes > 0);
  let pool, weights;
  if (configured.length >= 5) {
    pool = configured;
    weights = configured.map((p) => p.minutes);
  } else {
    // Default rotation: top 8, weighted by overall with a starter boost.
    pool = players.slice(0, 8);
    weights = pool.map((p, i) => p.overall * (i < 5 ? 1.15 : 0.75));
  }
  const sum = weights.reduce((s, w) => s + w, 0);
  return pool.map((p, i) => ({ player: p, share: weights[i] / sum }));
}

const scoringSkill = (p) => 0.34 * p.shooting + 0.34 * p.finishing + 0.18 * p.athleticism + 0.14 * p.passing;

// Effective ratings for a team in a game.
function effRatings(rotation, settings, archetype, isHome) {
  const off = rotation.reduce((s, r) => s + scoringSkill(r.player) * r.share, 0);
  const def = rotation.reduce((s, r) =>
    s + (0.55 * r.player.defense + 0.27 * r.player.rebounding + 0.18 * r.player.athleticism) * r.share, 0);

  let offAdj = 0;
  // Tactician: rewarded for strategy fit; everyone gets a smaller slice of it.
  const fit = strategyFit(settings.offensive_style, rotation);
  offAdj += archetype === 'Tactician' ? fit : fit * 0.4;
  // Motivator: small steady offensive lift (clutch handled at scoring time).
  if (archetype === 'Motivator') offAdj += 2;
  if (isHome) offAdj += 3; // home court

  const tempoPoss = TEMPO_POSS[settings.tempo] ?? 0;
  return { off: off + offAdj, def, tempoPoss, archetype };
}

// Decompose a player's target points into a full stat line.
function buildPlayerLine(p, pts, share, rng) {
  const posBias = { PG: 0.16, SG: 0.18, SF: 0.06, PF: -0.06, C: -0.18 }[p.position] || 0;
  let threeTend = Math.max(0.05, Math.min(0.62, (p.shooting - 50) / 110 + posBias));

  // threes made: parity must match pts (since 2*FG + 3PM = PTS).
  let tm = Math.round((pts * threeTend) / 3);
  tm = Math.max(0, Math.min(Math.floor(pts / 3), tm));
  if ((tm % 2) !== (pts % 2)) { // fix parity
    if (tm > 0) tm -= 1; else if (3 <= pts) tm += 1;
  }
  if ((tm % 2) !== (pts % 2)) tm = pts % 2; // last resort (pts 1 → 1 three? clamp)
  tm = Math.max(0, Math.min(Math.floor(pts / 3), tm));
  if ((pts - 3 * tm) % 2 !== 0) tm = Math.max(0, tm - 1);
  const twoMade = Math.max(0, (pts - 3 * tm) / 2);
  const fg = twoMade + tm;

  const twoPct = Math.max(0.35, Math.min(0.62, 0.46 + (p.finishing - 55) / 220));
  const tpPct = Math.max(0.22, Math.min(0.45, 0.30 + (p.shooting - 55) / 300));
  const minutesBox = Math.round(share * 160); // ~5*32 player-minutes/team

  let twoAtt = Math.max(twoMade, Math.round(twoMade / twoPct)) + rng.randInt(0, Math.max(0, Math.round(minutesBox / 14)));
  let threeAtt = tm > 0 ? Math.max(tm, Math.round(tm / tpPct)) : rng.randInt(0, Math.round(minutesBox / 16));
  const fga = twoAtt + threeAtt;
  const threes_a = threeAtt;

  return {
    player_id: p.id, team_id: p.team_id, min: minutesBox,
    pts, fg, fga, threes: tm, threes_a,
    reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, // filled by team distribution
  };
}

// Simulate one game. Writes scores + box scores, returns a recap object.
function simulateGame(careerId, gameId) {
  const game = db.prepare('SELECT * FROM games WHERE id=? AND career_id=?').get(gameId, careerId);
  if (!game) throw new Error('Game not found.');
  if (game.played) throw new Error('Game already played.');

  const career = db.prepare('SELECT seed FROM careers WHERE id=?').get(careerId);
  const rng = makeRng(mixSeed(career.seed, game.id * 31 + game.season_year));

  const teamRow = (id) => db.prepare('SELECT * FROM teams WHERE id=?').get(id);
  const settingsRow = (id) => db.prepare('SELECT * FROM team_settings WHERE career_id=? AND team_id=?').get(careerId, id)
    || { offensive_style: 'Motion', defensive_style: 'Man-to-Man', tempo: 'Balanced' };

  const home = teamRow(game.home_team_id);
  const away = teamRow(game.away_team_id);
  const homeRot = getRotation(careerId, home.id);
  const awayRot = getRotation(careerId, away.id);
  const homeEff = effRatings(homeRot, settingsRow(home.id), home.coach_archetype, true);
  const awayEff = effRatings(awayRot, settingsRow(away.id), away.coach_archetype, false);

  // Possessions (shared pace).
  const poss = Math.round(64 + (homeEff.tempoPoss + awayEff.tempoPoss) / 2 + rng.gaussianClamp(0, 3, -6, 6));

  // Points per possession from offense vs opposing defense + noise.
  const ppp = (offT, defO) => {
    const base = 0.95 + (offT - defO) * 0.0055;
    // Seeded game-to-game variance (float — this is what lets underdogs steal
    // games). Clamp the noise so it can't fully invert a huge talent gap.
    const noise = Math.max(-0.26, Math.min(0.26, rng.gaussian(0, 0.095)));
    return Math.max(0.62, Math.min(1.28, base + noise));
  };
  let homeScore = Math.round(poss * ppp(homeEff.off, awayEff.def));
  let awayScore = Math.round(poss * ppp(awayEff.off, homeEff.def));

  // Motivator clutch nudge in tight projected games.
  if (Math.abs(homeScore - awayScore) <= 4) {
    if (home.coach_archetype === 'Motivator') homeScore += rng.randInt(1, 3);
    if (away.coach_archetype === 'Motivator') awayScore += rng.randInt(1, 3);
  }

  homeScore = Math.max(38, Math.min(92, homeScore));
  awayScore = Math.max(38, Math.min(92, awayScore));
  if (homeScore === awayScore) { // no ties — edge to the better offense (or home)
    if (homeEff.off >= awayEff.off) homeScore += 1; else awayScore += 1;
  }

  const buildTeamBox = (rotation, teamTotal) => {
    const usage = rotation.map((r) => r.share * (0.55 + scoringSkill(r.player) / 130));
    const ptsArr = distributeInt(teamTotal, usage);
    const lines = rotation.map((r, i) => buildPlayerLine(r.player, ptsArr[i], r.share, rng));

    // Team rebound/assist/etc targets, distributed by attribute weights.
    const teamFg = lines.reduce((s, l) => s + l.fg, 0);
    const rebTotal = rng.gaussianClamp(32, 4, 22, 44);
    const astTotal = Math.min(teamFg, Math.round(teamFg * rng.gaussianClamp(0.55, 0.08, 0.3, 0.75) * 100) / 100);
    const stlTotal = rng.gaussianClamp(7, 2, 2, 14);
    const blkTotal = rng.gaussianClamp(3, 1.6, 0, 9);
    const tovTotal = rng.gaussianClamp(12, 3, 5, 22);

    const wReb = rotation.map((r) => (r.player.rebounding * 0.8 + r.player.athleticism * 0.2) * r.share);
    const wAst = rotation.map((r) => r.player.passing * r.share);
    const wStl = rotation.map((r) => (r.player.defense * 0.5 + r.player.athleticism * 0.5) * r.share);
    const wBlk = rotation.map((r) => (r.player.rebounding * 0.5 + r.player.defense * 0.5) * r.share);
    const wTov = rotation.map((r) => (1.2 - r.player.passing / 160) * r.share);

    const reb = distributeInt(Math.round(rebTotal), wReb);
    const ast = distributeInt(Math.round(astTotal), wAst);
    const stl = distributeInt(Math.round(stlTotal), wStl);
    const blk = distributeInt(Math.round(blkTotal), wBlk);
    const tov = distributeInt(Math.round(tovTotal), wTov);
    lines.forEach((l, i) => { l.reb = reb[i]; l.ast = ast[i]; l.stl = stl[i]; l.blk = blk[i]; l.tov = tov[i]; });
    return lines;
  };

  const homeLines = buildTeamBox(homeRot, homeScore);
  const awayLines = buildTeamBox(awayRot, awayScore);

  const teamAgg = (lines, teamId) => {
    const a = { game_id: gameId, team_id: teamId, fg: 0, fga: 0, threes: 0, threes_a: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pts: 0 };
    for (const l of lines) {
      a.fg += l.fg; a.fga += l.fga; a.threes += l.threes; a.threes_a += l.threes_a;
      a.reb += l.reb; a.ast += l.ast; a.stl += l.stl; a.blk += l.blk; a.tov += l.tov; a.pts += l.pts;
    }
    return a;
  };
  const homeAgg = teamAgg(homeLines, home.id);
  const awayAgg = teamAgg(awayLines, away.id);

  // Persist everything in one transaction.
  const insPgs = db.prepare(`INSERT INTO player_game_stats
    (game_id,player_id,team_id,min,pts,reb,ast,stl,blk,tov,fg,fga,threes,threes_a)
    VALUES (@game_id,@player_id,@team_id,@min,@pts,@reb,@ast,@stl,@blk,@tov,@fg,@fga,@threes,@threes_a)`);
  const insTgs = db.prepare(`INSERT INTO team_game_stats
    (game_id,team_id,fg,fga,threes,threes_a,reb,ast,stl,blk,tov,pts)
    VALUES (@game_id,@team_id,@fg,@fga,@threes,@threes_a,@reb,@ast,@stl,@blk,@tov,@pts)`);

  db.transaction(() => {
    db.prepare('UPDATE games SET home_score=?, away_score=?, played=1 WHERE id=?')
      .run(homeScore, awayScore, gameId);
    [...homeLines, ...awayLines].forEach((l) => insPgs.run({ game_id: gameId, ...l }));
    insTgs.run(homeAgg);
    insTgs.run(awayAgg);
  })();

  const topScorer = (lines) => lines.reduce((best, l) => (l.pts > best.pts ? l : best), lines[0]);
  const recap = {
    gameId, week: game.week, is_playoff: game.is_playoff, round: game.round,
    home: { id: home.id, abbrev: home.abbrev, name: home.name, color: home.color_primary, color2: home.color_secondary, score: homeScore },
    away: { id: away.id, abbrev: away.abbrev, name: away.name, color: away.color_primary, color2: away.color_secondary, score: awayScore },
    winner_team_id: homeScore > awayScore ? home.id : away.id,
  };

  // News hook (Phase 7).
  if (recordGameNews) {
    try { recordGameNews(careerId, { game, home, away, homeScore, awayScore, homeLines, awayLines, homeRot, awayRot, topScorer }); }
    catch (e) { /* news must never break a sim */ }
  }

  return recap;
}

// ---- playoffs ------------------------------------------------------------

function weekToRound(week) {
  if (week === PLAYOFF_WEEKS.QF) return 'QF';
  if (week === PLAYOFF_WEEKS.SF) return 'SF';
  if (week === PLAYOFF_WEEKS.FINAL) return 'Final';
  return null;
}

function playoffGames(careerId, year, round) {
  return db.prepare('SELECT * FROM games WHERE career_id=? AND season_year=? AND is_playoff=1 AND round=?')
    .all(careerId, year, round);
}

function createGame(careerId, year, week, round, homeId, awayId) {
  return db.prepare(`INSERT INTO games
    (career_id,season_year,week,home_team_id,away_team_id,played,is_playoff,round)
    VALUES (?,?,?,?,?,0,1,?)`).run(careerId, year, week, homeId, awayId, round).lastInsertRowid;
}

// Seed the Quarterfinals from the top 8 of the standings (1v8,2v7,3v6,4v5).
function ensureQuarterfinals(careerId, year) {
  if (playoffGames(careerId, year, 'QF').length) return;
  const standings = computeStandings(careerId, year);
  const seeds = standings.slice(0, 8).map((s) => s.team_id);
  const pairs = [[0, 7], [3, 4], [1, 6], [2, 5]]; // bracket order
  pairs.forEach(([hi, lo]) => createGame(careerId, year, PLAYOFF_WEEKS.QF, 'QF', seeds[hi], seeds[lo]));
}

function winnerOf(game) {
  return game.home_score > game.away_score ? game.home_team_id : game.away_team_id;
}

// Build the next round from the winners of the previous one (preserving order).
function createNextRound(careerId, year, fromRound, toRound, week) {
  if (playoffGames(careerId, year, toRound).length) return;
  const prev = playoffGames(careerId, year, fromRound).sort((a, b) => a.id - b.id);
  if (prev.some((g) => !g.played)) return;
  const winners = prev.map(winnerOf);
  for (let i = 0; i < winners.length; i += 2) {
    createGame(careerId, year, week, toRound, winners[i], winners[i + 1]);
  }
}

function crownChampion(careerId, year) {
  const final = playoffGames(careerId, year, 'Final')[0];
  if (!final || !final.played) return null;
  const champId = winnerOf(final);
  db.prepare('UPDATE seasons SET champion_team_id=? WHERE career_id=? AND year=?').run(champId, careerId, year);

  // Append career_history for the user team.
  const career = db.prepare('SELECT team_id FROM careers WHERE id=?').get(careerId);
  const standings = computeStandings(careerId, year);
  const userRow = standings.find((s) => s.team_id === career.team_id);
  const top8 = new Set(standings.slice(0, 8).map((s) => s.team_id));
  const exists = db.prepare('SELECT id FROM career_history WHERE career_id=? AND season_year=?').get(careerId, year);
  if (!exists && userRow) {
    db.prepare(`INSERT INTO career_history
      (career_id,season_year,wins,losses,made_playoffs,won_championship,final_rank)
      VALUES (?,?,?,?,?,?,?)`).run(
      careerId, year, userRow.wins, userRow.losses,
      top8.has(career.team_id) ? 1 : 0,
      champId === career.team_id ? 1 : 0,
      userRow.rank
    );
  }
  return champId;
}

// ---- controllers ---------------------------------------------------------

function getCareer(careerId) {
  return db.prepare('SELECT * FROM careers WHERE id=?').get(careerId);
}

// Simulate every unplayed game in the career's current week, then advance.
function simulateWeek(careerId) {
  const career = getCareer(careerId);
  const year = career.season_year;
  const week = career.current_week;

  if (week > PLAYOFF_WEEKS.FINAL) {
    return { done: true, message: 'Season complete. Advance to the next season.' };
  }

  let phase = 'regular';
  let results = [];

  if (week <= REG_WEEKS) {
    const games = db.prepare(
      'SELECT id FROM games WHERE career_id=? AND season_year=? AND week=? AND played=0'
    ).all(careerId, year, week);
    results = games.map((g) => simulateGame(careerId, g.id));
    db.prepare('UPDATE careers SET current_week=?, updated_at=datetime(\'now\') WHERE id=?').run(week + 1, careerId);
    if (week + 1 > REG_WEEKS) ensureQuarterfinals(careerId, year);
  } else {
    phase = 'playoffs';
    const round = weekToRound(week);
    if (round === 'QF') ensureQuarterfinals(careerId, year);
    const games = db.prepare(
      'SELECT id FROM games WHERE career_id=? AND season_year=? AND is_playoff=1 AND round=? AND played=0'
    ).all(careerId, year, round);
    results = games.map((g) => simulateGame(careerId, g.id));

    if (round === 'QF') createNextRound(careerId, year, 'QF', 'SF', PLAYOFF_WEEKS.SF);
    else if (round === 'SF') createNextRound(careerId, year, 'SF', 'Final', PLAYOFF_WEEKS.FINAL);
    else if (round === 'Final') crownChampion(careerId, year);

    db.prepare('UPDATE careers SET current_week=?, updated_at=datetime(\'now\') WHERE id=?').run(week + 1, careerId);
  }

  const champion = db.prepare('SELECT champion_team_id FROM seasons WHERE career_id=? AND year=?').get(careerId, year);
  return {
    phase, week, results,
    current_week: getCareer(careerId).current_week,
    champion_team_id: champion ? champion.champion_team_id : null,
  };
}

// Simulate the user's next scheduled game only (then advance week if it was the
// last unplayed game of the week).
function simulateNextGame(careerId) {
  const career = getCareer(careerId);
  const year = career.season_year;
  if (career.current_week > PLAYOFF_WEEKS.FINAL) {
    return { done: true, message: 'Season complete.' };
  }
  const userTeam = career.team_id;
  // Find the user's next unplayed game in/after the current week.
  let game = db.prepare(`SELECT id FROM games
    WHERE career_id=? AND season_year=? AND played=0
      AND (home_team_id=? OR away_team_id=?)
    ORDER BY week, id LIMIT 1`).get(careerId, year, userTeam, userTeam);

  // If the user is eliminated from the playoffs, fall back to advancing weeks.
  if (!game) return simulateWeek(careerId);

  const target = db.prepare('SELECT week, is_playoff, round FROM games WHERE id=?').get(game.id);
  const recap = simulateGame(careerId, game.id);

  // Sim the rest of that week's slate too, so standings stay coherent.
  let rest;
  if (!target.is_playoff) {
    rest = db.prepare('SELECT id FROM games WHERE career_id=? AND season_year=? AND week=? AND played=0')
      .all(careerId, year, target.week);
  } else {
    rest = db.prepare('SELECT id FROM games WHERE career_id=? AND season_year=? AND is_playoff=1 AND round=? AND played=0')
      .all(careerId, year, target.round);
  }
  const others = rest.map((g) => simulateGame(careerId, g.id));

  // Advance week + handle playoff progression identically to simulateWeek.
  const week = target.is_playoff ? weekToRoundWeek(target.round) : target.week;
  if (!target.is_playoff) {
    if (week === career.current_week) {
      db.prepare('UPDATE careers SET current_week=?, updated_at=datetime(\'now\') WHERE id=?').run(week + 1, careerId);
      if (week + 1 > REG_WEEKS) ensureQuarterfinals(careerId, year);
    }
  } else {
    if (target.round === 'QF') createNextRound(careerId, year, 'QF', 'SF', PLAYOFF_WEEKS.SF);
    else if (target.round === 'SF') createNextRound(careerId, year, 'SF', 'Final', PLAYOFF_WEEKS.FINAL);
    else if (target.round === 'Final') crownChampion(careerId, year);
    if (week === career.current_week) {
      db.prepare('UPDATE careers SET current_week=?, updated_at=datetime(\'now\') WHERE id=?').run(week + 1, careerId);
    }
  }

  const champion = db.prepare('SELECT champion_team_id FROM seasons WHERE career_id=? AND year=?').get(careerId, year);
  return {
    recap, others, current_week: getCareer(careerId).current_week,
    champion_team_id: champion ? champion.champion_team_id : null,
  };
}

function weekToRoundWeek(round) {
  return PLAYOFF_WEEKS[round] || PLAYOFF_WEEKS[round?.toUpperCase()] || PLAYOFF_WEEKS.QF;
}

// Simulate every week up to (but not into) the playoffs.
function simulateToPlayoffs(careerId) {
  let guard = 0;
  while (getCareer(careerId).current_week <= REG_WEEKS && guard++ < 40) simulateWeek(careerId);
  return { current_week: getCareer(careerId).current_week };
}

// Simulate the entire season including the playoffs; returns the champion.
function simulateSeason(careerId) {
  let guard = 0;
  while (getCareer(careerId).current_week <= PLAYOFF_WEEKS.FINAL && guard++ < 60) simulateWeek(careerId);
  const career = getCareer(careerId);
  const champ = db.prepare('SELECT champion_team_id FROM seasons WHERE career_id=? AND year=?')
    .get(careerId, career.season_year);
  return { champion_team_id: champ ? champ.champion_team_id : null, current_week: career.current_week };
}

module.exports = {
  simulateGame, simulateWeek, simulateNextGame, simulateToPlayoffs, simulateSeason,
  ensureQuarterfinals, setNewsHook,
};
