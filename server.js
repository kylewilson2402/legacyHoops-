// Legacy Hoops: High School Dynasty — Express entry point.
// Serves the static SPA from /public and mounts the JSON API under /api.
// All API routes return { ok: true, data } or { ok: false, error }.

const path = require('path');
const express = require('express');
const migrate = require('./src/db/migrate');

// Ensure the schema exists before serving requests.
migrate();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------
// Health check — used by the testing plan to confirm the server is live.
app.get('/api/health', (req, res) => {
  res.json({ ok: true, data: { status: 'up', time: new Date().toISOString() } });
});

// Route stubs are mounted here as later phases add them.
// (Phase 3+ will mount careers/league/roster/schedule/etc.)

// ---------------------------------------------------------------------------
// Static SPA
// ---------------------------------------------------------------------------
const publicDir = path.join(__dirname, 'public');
app.use(express.static(publicDir));

// Client-side hash routing means the server only ever needs to return the
// shell for non-API, non-file requests. Express 4 + path-to-regexp v0 chokes
// on "*", so we use a RegExp catch-all that excludes /api.
app.get(/^\/(?!api\/).*/, (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

// JSON 404 for unknown API routes.
app.use('/api', (req, res) => {
  res.status(404).json({ ok: false, error: 'Not found' });
});

app.listen(PORT, () => {
  console.log(`Legacy Hoops running at http://localhost:${PORT}`);
});

module.exports = app;
