-- ============================================================
-- Tournoi interne TCPM — table des demandes de créneau (Neon)
-- À coller dans Neon > SQL Editor > Run. Relançable sans risque.
-- ============================================================
CREATE TABLE IF NOT EXISTS match_requests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category        text NOT NULL CHECK (category IN ('hommes', 'femmes', 'mixte')),
  pool            text NOT NULL,
  player          text NOT NULL,
  opponent        text NOT NULL,
  requested_date  date NOT NULL,
  requested_time  time NOT NULL,
  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'confirmed', 'refused', 'cancelled')),
  court           text,
  refusal_reason  text,
  phone1          text,
  phone2          text,
  notified1_at    timestamptz,
  notified2_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  decided_at      timestamptz,
  CHECK (player <> opponent),
  CHECK (status <> 'confirmed' OR court IS NOT NULL)
);

-- Une seule demande active par match (Peri/Dupont = Dupont/Peri)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_match
  ON match_requests (category, pool, least(player, opponent), greatest(player, opponent))
  WHERE status IN ('pending', 'confirmed');

-- Un terrain = un seul match confirmé par créneau
CREATE UNIQUE INDEX IF NOT EXISTS uniq_court_slot
  ON match_requests (requested_date, requested_time, court)
  WHERE status = 'confirmed';

CREATE INDEX IF NOT EXISTS idx_slot
  ON match_requests (requested_date, requested_time, status);

CREATE INDEX IF NOT EXISTS idx_phone_recent
  ON match_requests (phone1, created_at);

-- ------------------------------------------------------------
-- FIN DU TOURNOI (à lancer à la main, après export CSV) :
-- UPDATE match_requests SET phone1 = NULL, phone2 = NULL;
-- ------------------------------------------------------------
