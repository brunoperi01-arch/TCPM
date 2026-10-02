-- Horaire souhaité différent du créneau + durée portée par la demande
ALTER TABLE match_requests
  ADD COLUMN IF NOT EXISTS preferred_time time,
  ADD COLUMN IF NOT EXISTS duration_min smallint;

-- Reprendre la durée des demandes déjà enregistrées depuis leur créneau
UPDATE match_requests r
SET duration_min = s.duration_min
FROM tournament_slots s
WHERE r.duration_min IS NULL
  AND s.slot_date = r.requested_date
  AND s.slot_time = r.requested_time;

-- Un terrain ne peut pas accueillir deux matchs dont les horaires se croisent
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE match_requests DROP CONSTRAINT IF EXISTS no_court_overlap;
ALTER TABLE match_requests ADD CONSTRAINT no_court_overlap
  EXCLUDE USING gist (
    court WITH =,
    tsrange(
      requested_date + requested_time,
      requested_date + requested_time + make_interval(mins => COALESCE(duration_min, 120))
    ) WITH &&
  ) WHERE (status = 'confirmed');
