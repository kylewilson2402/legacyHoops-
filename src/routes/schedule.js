const express = require('express');
const { getSchedule, computeStandings } = require('../services/scheduleService');

const router = express.Router();

// GET /api/schedule/:careerId/standings?season=YEAR — computed standings
router.get('/:careerId/standings', (req, res) => {
  try {
    const year = req.query.season ? Number(req.query.season) : undefined;
    res.json({ ok: true, data: computeStandings(Number(req.params.careerId), year) });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/schedule/:careerId?season=YEAR — full schedule
router.get('/:careerId', (req, res) => {
  try {
    const year = req.query.season ? Number(req.query.season) : undefined;
    res.json({ ok: true, data: getSchedule(Number(req.params.careerId), year) });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
