const express = require('express');
const { getHistory } = require('../services/historyService');

const router = express.Router();

// GET /api/history/:careerId — career dynasty timeline + league champions
router.get('/:careerId', (req, res) => {
  try {
    res.json({ ok: true, data: getHistory(Number(req.params.careerId)) });
  } catch (err) {
    res.status(404).json({ ok: false, error: err.message });
  }
});

module.exports = router;
