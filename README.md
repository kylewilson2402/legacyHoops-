# 🏀 Legacy Hoops: High School Dynasty

A single-player, browser-based **high school basketball management simulation**.
Create a coach, take over a fictional program, and build a dynasty across
multiple seasons — manage your roster, set lineups and minutes, choose a game
plan, recruit incoming freshmen, develop your players, and chase state titles.

Games are **simulated, not played**: you make the decisions and click **Simulate**.

> Scope is strictly high school basketball — single-player, local, no accounts,
> no payments. Everything runs on your machine (or a single Node server).

---

## ✨ Features

- **Coach creation** with four archetypes (Motivator, Recruiter, Tactician, Developer), each with distinct gameplay bonuses.
- **Procedurally generated league** — 12 unique teams (names, colors, AI coaches) and 144 players, reproducible from a per-career seed.
- **Roster management** — sortable stat tables, starter selection, per-game minutes budget, and a strategy/game-plan (offense, defense, tempo).
- **Possession-based game engine** — realistic, internally consistent box scores (player points always sum to the team score), with seeded variance so underdogs can win.
- **Full season + playoffs** — a balanced 22-game schedule and an 8-team State Championship Tournament (QF → SF → Final).
- **Recruiting** — scout incoming freshman classes (fog-of-war), spend a weekly action budget to raise interest, and sign commits who join your roster next season.
- **Template-driven news** that reacts to results and recruiting (upsets, blowouts, titles, commitments, milestones).
- **Multi-season progression** — offseason player development, graduation, recruit signings, evolving coach reputation, and a league/dynasty history.
- **"Varsity Broadcast" UI** — a night-gym aesthetic with a reusable broadcast **scorebug**, responsive layout, keyboard focus states, and reduced-motion support.

---

## 🧱 Tech stack

- **Frontend:** HTML + CSS + vanilla JavaScript ES modules (no framework, no build step)
- **Backend:** Node.js + Express
- **Database:** SQLite via [`better-sqlite3`](https://github.com/WiseLibs/better-sqlite3)
- **Determinism:** a seeded PRNG (mulberry32) drives all generation and simulation

Every API route returns `{ ok: true, data }` or `{ ok: false, error }`. All
game state lives in SQLite, scoped by `career_id`, so multiple careers share one
database file.

---

## 🚀 Installation & running locally

Requires **Node.js 18+**.

```bash
git clone <your-repo-url> legacy-hoops
cd legacy-hoops
npm install
npm run dev      # starts with nodemon (auto-reload)
# or: npm start  # plain node
```

Then open **http://localhost:3000**.

The SQLite database is created automatically at `data/legacy-hoops.db` on first
boot (the `data/` directory is gitignored). Set `PORT` to change the port (see
`.env.example`).

### Quick start

On the **Home** screen, click **Demo career** to jump straight into a preset
program (Oak Hill Hawks, fixed seed) — handy for trying the core loop without
filling out the coach form.

---

## 🎮 How to play

1. **Create a coach** (or load the demo). Pick a name, age, archetype, and
   optionally a custom town/mascot and seed.
2. **Set your roster** — choose 5 starters, allocate minutes (200-minute budget),
   and pick your offensive style, defensive style, and tempo.
3. **Simulate** — use the top-bar **Simulate** button, or the Schedule view's
   "Simulate next / week / rest of season". Watch standings, box scores, and news
   update.
4. **Recruit** — open Recruiting, scout prospects, and spend your weekly actions
   (Send letter / Home visit / Offer scholarship) to raise interest.
5. **Win the title** — finish the regular season, make the 8-team bracket, and
   chase the championship.
6. **Advance the season** — from the Dashboard (or Settings) when the season is
   complete. Review the offseason recap (who developed, graduated, and signed),
   then run it back and build your dynasty.

---

## 🗂️ Project structure

```
legacy-hoops/
├── server.js                  # Express entry: static SPA + /api + migrate on boot
├── railway.json / vercel.json # deploy configs
├── data/                      # SQLite db (gitignored)
├── src/
│   ├── db/                    # connection (better-sqlite3), schema.sql, migrate
│   ├── lib/                   # rng.js (seeded PRNG), names.js (generation pools)
│   ├── services/              # career, league, roster, schedule, sim, recruit,
│   │                          #   develop, news, history (all game logic)
│   └── routes/                # careers, league, roster, schedule, sim,
│                              #   recruiting, news, history
└── public/
    ├── index.html             # SPA shell (sidebar + topbar + view container)
    ├── css/styles.css         # Varsity Broadcast design system
    └── js/
        ├── app.js             # hash router + topbar
        ├── api.js, state.js   # fetch wrappers + active-career cache
        ├── components/        # ui helpers, scorebug, active-career loader
        └── views/             # one module per screen (home, dashboard, …)
```

All game logic that affects saved state lives on the backend; the frontend is a
presentation + input layer.

---

## ☁️ Deployment

### Railway (recommended)

Railway runs a persistent Node process and lets you attach a volume for the
SQLite file, so saves survive restarts.

1. Push this repo to GitHub and create a new Railway project from it.
2. Railway auto-detects Node and uses `railway.json` (`startCommand: npm start`).
3. **Attach a volume** and mount it at, e.g., `/data`.
4. Add an environment variable `DB_PATH=/data/legacy-hoops.db` so the database is
   written to the persistent volume. (`PORT` is provided by Railway automatically.)
5. Deploy and open the generated URL.

### Vercel (with caveats)

`vercel.json` runs `server.js` as a serverless function. **Important limitation:**
Vercel's serverless filesystem is **ephemeral and read-only** except for `/tmp`,
which is not durable across invocations. That means **SQLite saves will not
persist** on Vercel — careers can disappear between cold starts.

Use Vercel only for a throwaway demo. For a stable, persistent demo, **prefer
Railway** (or any host that runs a long-lived Node process with a writable disk).

---

## 🧪 Notes on the simulation

- Each team's effective offense/defense is a minute-weighted blend of player
  attributes, adjusted for strategy fit, tempo, coach archetype, and home court.
- Scoring is possession-based: `points = possessions × points-per-possession`,
  where PPP scales with the talent gap plus seeded variance.
- Player points decompose into 2-pointers and 3-pointers (no free throws in this
  MVP), so a player's points always equal `2·FG + 3PM` and the player lines sum
  exactly to the team score.
- The full formula is documented in `src/services/simService.js`.

---

## 📄 License

MIT.
