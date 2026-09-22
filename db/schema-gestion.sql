CREATE TABLE IF NOT EXISTS pool_entries (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pool_id text NOT NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pool_id, name)
);

CREATE TABLE IF NOT EXISTS tournament_slots (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slot_date date NOT NULL,
  slot_time time NOT NULL,
  capacity smallint NOT NULL CHECK (capacity BETWEEN 1 AND 6),
  duration_min smallint NOT NULL DEFAULT 120 CHECK (duration_min BETWEEN 30 AND 300),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (slot_date, slot_time)
);

CREATE TABLE IF NOT EXISTS player_contacts (
  name text PRIMARY KEY,
  phone text NOT NULL CHECK (phone ~ '^33[67][0-9]{8}$'),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pools (
  id text PRIMARY KEY,
  category text NOT NULL CHECK (category IN ('hommes', 'femmes', 'mixte')),
  level text NOT NULL,
  number int NOT NULL,
  nom text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fixtures (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pool_id text NOT NULL,
  round int NOT NULL DEFAULT 1 CHECK (round BETWEEN 1 AND 20),
  entry1 text NOT NULL,
  entry2 text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fixtures_pool ON fixtures (pool_id, round);
