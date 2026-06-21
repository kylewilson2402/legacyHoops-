const express = require('express');
const db = require('../db/connection');
const {
  simulateGame, simulateWeek, simulateNextGame, simulateToPlayoffs, simulateSeason,
} = require('../services/simService');

const router = express.Router();

// POST /api/sim/game/:gameId — simulate a single game (careerId from the row)
router.post('/game/:gameId', (req, res) => {
  try {
    const game = db.prepare('SELECT career_id FROM games WHERE id=?').get(Number(req.params.gameId));
    if (!game) return res.status(404).json({ ok: false, error: 'Game not found.' });
    res.json({ ok: true, data: simulateGame(game.career_id, Number(req.params.gameId)) });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

const careerAction = (fn) => (req, res) => {
  try {
    const careerId = Number((req.body || {}).careerId || req.query.careerId);
    if (!careerId) return res.status(400).json({ ok: false, error: 'careerId is required.' });
    res.json({ ok: true, data: fn(careerId) });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
};

router.post('/next', careerAction(simulateNextGame));
router.post('/week', careerAction(simulateWeek));
router.post('/to-playoffs', careerAction(simulateToPlayoffs));
router.post('/season', careerAction(simulateSeason));

// GET /api/sim/box/:careerId/:gameId — full box score for a played game
router.get('/box/:careerId/:gameId', (req, res) => {
  try {
    const careerId = Number(req.params.careerId);
    const gameId = Number(req.params.gameId);
    const game = db.prepare(`
      SELECT g.*, h.name home_name, h.abbrev home_abbrev, h.color_primary home_color, h.color_secondary home_color2,
             a.name away_name, a.abbrev away_abbrev, a.color_primary away_color, a.color_secondary away_color2
      FROM games g JOIN teams h ON h.id=g.home_team_id JOIN teams a ON a.id=g.away_team_id
      WHERE g.id=? AND g.career_id=?`).get(gameId, careerId);
    if (!game) return res.status(404).json({ ok: false, error: 'Game not found.' });
    const teamStats = db.prepare('SELECT * FROM team_game_stats WHERE game_id=?').all(gameId);
    const playerStats = db.prepare(`
      SELECT pgs.*, p.first, p.last, p.position
      FROM player_game_stats pgs JOIN players p ON p.id=pgs.player_id
      WHERE pgs.game_id=? ORDER BY pgs.pts DESC`).all(gameId);
    res.json({ ok: true, data: { game, teamStats, playerStats } });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
