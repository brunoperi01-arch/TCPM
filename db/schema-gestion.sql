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

CREATE TABLE IF NOT EXISTS player_contacts (
  name text PRIMARY KEY,
  phone text NOT NULL CHECK (phone ~ '^33[67][0-9]{8}$'),
  updated_at timestamptz NOT NULL DEFAULT now()
);
