CREATE TABLE IF NOT EXISTS fixtures (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pool_id text NOT NULL,
  round int NOT NULL DEFAULT 1 CHECK (round BETWEEN 1 AND 20),
  entry1 text NOT NULL,
  entry2 text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fixtures_pool ON fixtures (pool_id, round);
