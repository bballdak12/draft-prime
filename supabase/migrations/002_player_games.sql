CREATE TABLE player_games (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  player_season_id  UUID REFERENCES player_seasons(id) ON DELETE CASCADE,
  player_id         UUID REFERENCES players(id) ON DELETE CASCADE,
  season            INTEGER NOT NULL,
  week              INTEGER NOT NULL,
  game_date         DATE,
  opponent          TEXT,
  home_away         TEXT CHECK (home_away IN ('home', 'away', 'neutral')),
  is_playoff        BOOLEAN DEFAULT FALSE,

  -- Raw stats
  pass_att          INTEGER DEFAULT 0,
  pass_comp         INTEGER DEFAULT 0,
  pass_yds          INTEGER DEFAULT 0,
  pass_td           INTEGER DEFAULT 0,
  pass_int          INTEGER DEFAULT 0,
  rush_att          INTEGER DEFAULT 0,
  rush_yds          INTEGER DEFAULT 0,
  rush_td           INTEGER DEFAULT 0,
  targets           INTEGER DEFAULT 0,
  receptions        INTEGER DEFAULT 0,
  rec_yds           INTEGER DEFAULT 0,
  rec_td            INTEGER DEFAULT 0,

  -- Kicker
  fg_att_under40    INTEGER DEFAULT 0,
  fg_made_under40   INTEGER DEFAULT 0,
  fg_att_40_49      INTEGER DEFAULT 0,
  fg_made_40_49     INTEGER DEFAULT 0,
  fg_att_50plus     INTEGER DEFAULT 0,
  fg_made_50plus    INTEGER DEFAULT 0,
  pat_att           INTEGER DEFAULT 0,
  pat_made          INTEGER DEFAULT 0,

  -- DST
  dst_sacks         NUMERIC(4,1) DEFAULT 0,
  dst_tfl           INTEGER DEFAULT 0,
  dst_int           INTEGER DEFAULT 0,
  dst_fumble_rec    INTEGER DEFAULT 0,
  dst_def_td        INTEGER DEFAULT 0,
  dst_safety        INTEGER DEFAULT 0,

  -- Calculated
  half_ppr_raw      NUMERIC(6,2),
  half_ppr_adjusted NUMERIC(6,2),
  injury_flag       BOOLEAN DEFAULT FALSE,
  snaps_played      INTEGER,

  created_at        TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (player_season_id, season, week)
);

CREATE INDEX idx_player_games_player_id ON player_games(player_id);
CREATE INDEX idx_player_games_player_season_id ON player_games(player_season_id);
CREATE INDEX idx_player_games_season_week ON player_games(season, week);
