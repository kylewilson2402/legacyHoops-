const express = require('express');
const { getRoster } = require('../services/rosterService');

const router = express.Router();

// GET /api/roster/:careerId/:teamId — a team's roster
router.get('/:careerId/:teamId', (req, res) => {
  try {
    const players = getRoster(Number(req.params.careerId), Number(req.params.teamId));
    res.json({ ok: true, data: players });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
