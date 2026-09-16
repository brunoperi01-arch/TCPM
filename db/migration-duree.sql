ALTER TABLE tournament_slots
  ADD COLUMN IF NOT EXISTS duration_min smallint NOT NULL DEFAULT 120
  CHECK (duration_min BETWEEN 30 AND 300);
