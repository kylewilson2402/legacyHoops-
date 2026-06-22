const express = require('express');
const {
  getRoster, getTeamSettings, getPlayerProfile, getTeamLeaders,
  setLineup, setMinutes, setStrategy,
  OFFENSIVE_STYLES, DEFENSIVE_STYLES, TEMPOS, MAX_MINUTES,
} = require('../services/rosterService');

const router = express.Router();

// GET /api/roster/options — strategy option lists (for dropdowns)
router.get('/options', (req, res) => {
  res.json({ ok: true, data: {
    offensive: OFFENSIVE_STYLES, defensive: DEFENSIVE_STYLES, tempo: TEMPOS, maxMinutes: MAX_MINUTES,
  } });
});

// GET /api/roster/player/:careerId/:playerId — single player profile + stats
router.get('/player/:careerId/:playerId', (req, res) => {
  try {
    res.json({ ok: true, data: getPlayerProfile(Number(req.params.careerId), Number(req.params.playerId)) });
  } catch (err) {
    res.status(404).json({ ok: false, error: err.message });
  }
});

// GET /api/roster/:careerId/:teamId/leaders — per-game stat leaders
router.get('/:careerId/:teamId/leaders', (req, res) => {
  try {
    res.json({ ok: true, data: getTeamLeaders(Number(req.params.careerId), Number(req.params.teamId)) });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/roster/:careerId/:teamId — roster + team settings
router.get('/:careerId/:teamId', (req, res) => {
  try {
    const careerId = Number(req.params.careerId);
    const teamId = Number(req.params.teamId);
    res.json({ ok: true, data: {
      players: getRoster(careerId, teamId),
      settings: getTeamSettings(careerId, teamId),
    } });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// PUT /api/roster/:careerId/lineup  { starters: [ids] }
router.put('/:careerId/lineup', (req, res) => {
  try {
    res.json({ ok: true, data: setLineup(Number(req.params.careerId), (req.body || {}).starters) });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

// PUT /api/roster/:careerId/minutes  { allocations: [{playerId,minutes}] }
router.put('/:careerId/minutes', (req, res) => {
  try {
    res.json({ ok: true, data: setMinutes(Number(req.params.careerId), (req.body || {}).allocations) });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

// PUT /api/roster/:careerId/strategy  { offensive, defensive, tempo }
router.put('/:careerId/strategy', (req, res) => {
  try {
    res.json({ ok: true, data: setStrategy(Number(req.params.careerId), req.body || {}) });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

module.exports = router;
