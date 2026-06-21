const express = require('express');
const { getTeams } = require('../services/leagueService');

const router = express.Router();

// GET /api/league/:careerId/teams — all teams in a career's league
router.get('/:careerId/teams', (req, res) => {
  try {
    res.json({ ok: true, data: getTeams(Number(req.params.careerId)) });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
