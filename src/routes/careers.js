const express = require('express');
const { createCareer, getCareer, listCareers, deleteCareer } = require('../services/careerService');

const router = express.Router();

// POST /api/careers — create a new career (triggers league/roster/schedule gen)
router.post('/', (req, res) => {
  try {
    const data = createCareer(req.body || {});
    res.json({ ok: true, data });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

// GET /api/careers — list saved careers
router.get('/', (req, res) => {
  try {
    res.json({ ok: true, data: listCareers() });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/careers/:id — load one career (+ user team)
router.get('/:id', (req, res) => {
  try {
    res.json({ ok: true, data: getCareer(Number(req.params.id)) });
  } catch (err) {
    res.status(404).json({ ok: false, error: err.message });
  }
});

// DELETE /api/careers/:id — remove a career and all its data
router.delete('/:id', (req, res) => {
  try {
    const ok = deleteCareer(Number(req.params.id));
    if (!ok) return res.status(404).json({ ok: false, error: 'Career not found.' });
    res.json({ ok: true, data: { deleted: Number(req.params.id) } });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
