const express = require('express');
const {
  getRecruitingClass, scoutRecruit, recruitAction, resolveCommitments, ACTIONS,
} = require('../services/recruitService');

const router = express.Router();

// GET /api/recruiting/:careerId — class (fog-of-war), budget, committed list
router.get('/:careerId', (req, res) => {
  try {
    res.json({ ok: true, data: getRecruitingClass(Number(req.params.careerId)) });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/recruiting/:careerId/actions — available action types + gains
router.get('/:careerId/actions', (req, res) => {
  res.json({ ok: true, data: Object.entries(ACTIONS).map(([key, v]) => ({ key, ...v })) });
});

// POST /api/recruiting/:careerId/scout { recruitId }
router.post('/:careerId/scout', (req, res) => {
  try {
    res.json({ ok: true, data: scoutRecruit(Number(req.params.careerId), Number((req.body || {}).recruitId)) });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

// POST /api/recruiting/:careerId/action { recruitId, action }
router.post('/:careerId/action', (req, res) => {
  try {
    const { recruitId, action } = req.body || {};
    res.json({ ok: true, data: recruitAction(Number(req.params.careerId), Number(recruitId), action) });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

// POST /api/recruiting/:careerId/resolve — resolve commitments (season end)
router.post('/:careerId/resolve', (req, res) => {
  try {
    res.json({ ok: true, data: resolveCommitments(Number(req.params.careerId)) });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

module.exports = router;
