-- Legacy Hoops schema. Every game-data table carries career_id so a single
-- SQLite file can hold many independent careers. Standings are COMPUTED on the
-- fly from the games table (see scheduleService) — there is intentionally no
-- standings table.

CREATE TABLE IF NOT EXISTS careers (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  coach_first   TEXT NOT NULL,
  coach_last    TEXT NOT NULL,
  coach_age     INTEGER NOT NULL,
  archetype     TEXT NOT NULL,           -- Motivator | Recruiter | Tactician | Developer
  team_id       INTEGER,                 -- the player's team (teams.id), set after league gen
  seed          INTEGER NOT NULL,        -- master PRNG seed for this career
  season_year   INTEGER NOT NULL DEFAULT 1,
  current_week  INTEGER NOT NULL DEFAULT 1,
  reputation    INTEGER NOT NULL DEFAULT 50,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS teams (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  career_id       INTEGER NOT NULL,
  name            TEXT NOT NULL,         -- "City Mascot"
  city            TEXT NOT NULL,
  mascot          TEXT NOT NULL,
  abbrev          TEXT NOT NULL,
  color_primary   TEXT NOT NULL,
  color_secondary TEXT NOT NULL,
  is_user_team    INTEGER NOT NULL DEFAULT 0,
  coach_name      TEXT NOT NULL,
  coach_archetype TEXT NOT NULL,
  FOREIGN KEY (career_id) REFERENCES careers(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS players (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  career_id    INTEGER NOT NULL,
  team_id      INTEGER NOT NULL,
  first        TEXT NOT NULL,
  last         TEXT NOT NULL,
  position     TEXT NOT NULL,            -- PG SG SF PF C
  grade        INTEGER NOT NULL,         -- 9..12
  shooting     INTEGER NOT NULL,
  finishing    INTEGER NOT NULL,
  passing      INTEGER NOT NULL,
  defense      INTEGER NOT NULL,
  rebounding   INTEGER NOT NULL,
  athleticism  INTEGER NOT NULL,
  potential    INTEGER NOT NULL,         -- ceiling >= overall
  overall      INTEGER NOT NULL,         -- derived weighted blend
  is_starter   INTEGER NOT NULL DEFAULT 0,
  minutes      INTEGER NOT NULL DEFAULT 0, -- per-game allocation (sum <= 200)
  status       TEXT NOT NULL DEFAULT 'active', -- active | graduated
  FOREIGN KEY (career_id) REFERENCES careers(id) ON DELETE CASCADE,
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS seasons (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  career_id         INTEGER NOT NULL,
  year              INTEGER NOT NULL,
  champion_team_id  INTEGER,
  FOREIGN KEY (career_id) REFERENCES careers(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS games (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  career_id     INTEGER NOT NULL,
  season_year   INTEGER NOT NULL,
  week          INTEGER NOT NULL,
  home_team_id  INTEGER NOT NULL,
  away_team_id  INTEGER NOT NULL,
  home_score    INTEGER,
  away_score    INTEGER,
  played        INTEGER NOT NULL DEFAULT 0,
  is_playoff    INTEGER NOT NULL DEFAULT 0,
  round         TEXT,                    -- QF | SF | Final (playoffs only)
  FOREIGN KEY (career_id) REFERENCES careers(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS team_game_stats (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id   INTEGER NOT NULL,
  team_id   INTEGER NOT NULL,
  fg        INTEGER NOT NULL DEFAULT 0,
  fga       INTEGER NOT NULL DEFAULT 0,
  threes    INTEGER NOT NULL DEFAULT 0,
  threes_a  INTEGER NOT NULL DEFAULT 0,
  reb       INTEGER NOT NULL DEFAULT 0,
  ast       INTEGER NOT NULL DEFAULT 0,
  stl       INTEGER NOT NULL DEFAULT 0,
  blk       INTEGER NOT NULL DEFAULT 0,
  tov       INTEGER NOT NULL DEFAULT 0,
  pts       INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS player_game_stats (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id    INTEGER NOT NULL,
  player_id  INTEGER NOT NULL,
  team_id    INTEGER NOT NULL,
  min        INTEGER NOT NULL DEFAULT 0,
  pts        INTEGER NOT NULL DEFAULT 0,
  reb        INTEGER NOT NULL DEFAULT 0,
  ast        INTEGER NOT NULL DEFAULT 0,
  stl        INTEGER NOT NULL DEFAULT 0,
  blk        INTEGER NOT NULL DEFAULT 0,
  tov        INTEGER NOT NULL DEFAULT 0,
  fg         INTEGER NOT NULL DEFAULT 0,
  fga        INTEGER NOT NULL DEFAULT 0,
  threes     INTEGER NOT NULL DEFAULT 0,
  threes_a   INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
  FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS recruits (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  career_id         INTEGER NOT NULL,
  class_year        INTEGER NOT NULL,    -- season_year this class enters as freshmen
  first             TEXT NOT NULL,
  last              TEXT NOT NULL,
  position          TEXT NOT NULL,
  potential         INTEGER NOT NULL,
  strengths         TEXT,                -- comma-joined blurb
  weaknesses        TEXT,
  shooting          INTEGER NOT NULL,
  finishing         INTEGER NOT NULL,
  passing           INTEGER NOT NULL,
  defense           INTEGER NOT NULL,
  rebounding        INTEGER NOT NULL,
  athleticism       INTEGER NOT NULL,
  interest          INTEGER NOT NULL DEFAULT 0,  -- 0..100 toward user team
  committed_team_id INTEGER,
  scouted           INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (career_id) REFERENCES careers(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS news (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  career_id    INTEGER NOT NULL,
  season_year  INTEGER NOT NULL,
  week         INTEGER NOT NULL,
  headline     TEXT NOT NULL,
  body         TEXT NOT NULL,
  category     TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (career_id) REFERENCES careers(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS team_settings (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  career_id       INTEGER NOT NULL,
  team_id         INTEGER NOT NULL,
  offensive_style TEXT NOT NULL DEFAULT 'Motion',
  defensive_style TEXT NOT NULL DEFAULT 'Man-to-Man',
  tempo           TEXT NOT NULL DEFAULT 'Balanced',
  FOREIGN KEY (career_id) REFERENCES careers(id) ON DELETE CASCADE,
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS career_history (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  career_id         INTEGER NOT NULL,
  season_year       INTEGER NOT NULL,
  wins              INTEGER NOT NULL DEFAULT 0,
  losses            INTEGER NOT NULL DEFAULT 0,
  made_playoffs     INTEGER NOT NULL DEFAULT 0,
  won_championship  INTEGER NOT NULL DEFAULT 0,
  final_rank        INTEGER,
  FOREIGN KEY (career_id) REFERENCES careers(id) ON DELETE CASCADE
);

-- Per-week recruiting action budget tracker (resets implicitly each week
-- because rows are keyed by season_year + week).
CREATE TABLE IF NOT EXISTS recruit_actions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  career_id    INTEGER NOT NULL,
  season_year  INTEGER NOT NULL,
  week         INTEGER NOT NULL,
  count        INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (career_id) REFERENCES careers(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_recruit_actions ON recruit_actions(career_id, season_year, week);

-- Indexes for the hot lookups.
CREATE INDEX IF NOT EXISTS idx_teams_career    ON teams(career_id);
CREATE INDEX IF NOT EXISTS idx_players_career  ON players(career_id);
CREATE INDEX IF NOT EXISTS idx_players_team    ON players(team_id);
CREATE INDEX IF NOT EXISTS idx_games_career    ON games(career_id, season_year);
CREATE INDEX IF NOT EXISTS idx_games_week      ON games(career_id, season_year, week);
CREATE INDEX IF NOT EXISTS idx_tgs_game        ON team_game_stats(game_id);
CREATE INDEX IF NOT EXISTS idx_pgs_game        ON player_game_stats(game_id);
CREATE INDEX IF NOT EXISTS idx_pgs_player      ON player_game_stats(player_id);
CREATE INDEX IF NOT EXISTS idx_recruits_career ON recruits(career_id, class_year);
CREATE INDEX IF NOT EXISTS idx_news_career     ON news(career_id);
CREATE INDEX IF NOT EXISTS idx_history_career  ON career_history(career_id);
