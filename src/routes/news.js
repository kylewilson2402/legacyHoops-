const express = require('express');
const { getNews } = require('../services/newsService');

const router = express.Router();

// GET /api/news/:careerId?page=1&limit=15&category=Upset — newest first
router.get('/:careerId', (req, res) => {
  try {
    const { page, limit, category } = req.query;
    res.json({ ok: true, data: getNews(Number(req.params.careerId), {
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 15,
      category: category || null,
    }) });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
