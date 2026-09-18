ALTER TABLE match_requests
  ADD COLUMN IF NOT EXISTS score jsonb,
  ADD COLUMN IF NOT EXISTS result_type text CHECK (result_type IN ('normal', 'wo', 'retired')),
  ADD COLUMN IF NOT EXISTS winner_side smallint CHECK (winner_side IN (1, 2)),
  ADD COLUMN IF NOT EXISTS score_at timestamptz,
  ADD COLUMN IF NOT EXISTS score_by text,
  ADD COLUMN IF NOT EXISTS validated_at timestamptz,
  ADD COLUMN IF NOT EXISTS reported_at timestamptz;
