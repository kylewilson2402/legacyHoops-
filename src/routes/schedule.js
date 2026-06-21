const express = require('express');
const { getSchedule } = require('../services/scheduleService');

const router = express.Router();

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
