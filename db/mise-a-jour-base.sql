-- ============================================================
-- Tournoi interne TCPM — mise à jour de la base (Neon)
-- À relancer EN ENTIER après chaque mise à jour de l'application.
-- Sans risque : ce qui existe déjà est ignoré, rien n'est effacé.
-- ============================================================

CREATE TABLE IF NOT EXISTS pools (
  id text PRIMARY KEY,
  category text NOT NULL CHECK (category IN ('hommes', 'femmes', 'mixte')),
  level text NOT NULL,
  number int NOT NULL,
  nom text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

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
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (slot_date, slot_time)
);

ALTER TABLE tournament_slots
  ADD COLUMN IF NOT EXISTS duration_min smallint NOT NULL DEFAULT 120
  CHECK (duration_min BETWEEN 30 AND 300);

CREATE TABLE IF NOT EXISTS player_contacts (
  name text PRIMARY KEY,
  phone text NOT NULL CHECK (phone ~ '^33[67][0-9]{8}$'),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE match_requests
  ADD COLUMN IF NOT EXISTS score jsonb,
  ADD COLUMN IF NOT EXISTS result_type text CHECK (result_type IN ('normal', 'wo', 'retired')),
  ADD COLUMN IF NOT EXISTS winner_side smallint CHECK (winner_side IN (1, 2)),
  ADD COLUMN IF NOT EXISTS score_at timestamptz,
  ADD COLUMN IF NOT EXISTS score_by text,
  ADD COLUMN IF NOT EXISTS validated_at timestamptz,
  ADD COLUMN IF NOT EXISTS reported_at timestamptz;

CREATE TABLE IF NOT EXISTS fixtures (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pool_id text NOT NULL,
  round int NOT NULL DEFAULT 1 CHECK (round BETWEEN 1 AND 20),
  entry1 text,
  entry2 text,
  src1 bigint,
  src2 bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fixtures_pool ON fixtures (pool_id, round);

ALTER TABLE fixtures
  ADD COLUMN IF NOT EXISTS src1 bigint,
  ADD COLUMN IF NOT EXISTS src2 bigint;
ALTER TABLE fixtures ALTER COLUMN entry1 DROP NOT NULL;
