-- Verified-donor application requests
-- Users submit a short form; admins review and flip users.is_verified.

CREATE TABLE IF NOT EXISTS verification_requests (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  full_name        TEXT NOT NULL,
  id_document_url  TEXT,
  medical_proof_url TEXT,
  phone            TEXT,
  city             TEXT,
  country_code     CHAR(2),
  notes            TEXT,
  status           TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewer_id      UUID REFERENCES users(id),
  reviewed_at      TIMESTAMPTZ,
  reviewer_notes   TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_verifications_user    ON verification_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_verifications_status  ON verification_requests(status);

-- Keep updated_at in sync
DROP TRIGGER IF EXISTS verification_requests_updated_at ON verification_requests;
CREATE TRIGGER verification_requests_updated_at
  BEFORE UPDATE ON verification_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS — users read/insert their own only; admins updated via service role
ALTER TABLE verification_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "verif_select_own" ON verification_requests;
CREATE POLICY "verif_select_own" ON verification_requests FOR SELECT
  USING (user_id = (SELECT id FROM users WHERE auth_id = auth.uid()));

DROP POLICY IF EXISTS "verif_insert_own" ON verification_requests;
CREATE POLICY "verif_insert_own" ON verification_requests FOR INSERT
  WITH CHECK (user_id = (SELECT id FROM users WHERE auth_id = auth.uid()));

-- When approved, a trigger flips users.is_verified.
CREATE OR REPLACE FUNCTION apply_verification_decision()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'approved' AND (OLD.status IS NULL OR OLD.status <> 'approved') THEN
    UPDATE users SET is_verified = TRUE WHERE id = NEW.user_id;
  ELSIF NEW.status = 'rejected' AND (OLD.status IS NULL OR OLD.status <> 'rejected') THEN
    -- keep is_verified untouched on rejection
    NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS apply_verification_decision_trg ON verification_requests;
CREATE TRIGGER apply_verification_decision_trg
  AFTER UPDATE OF status ON verification_requests
  FOR EACH ROW EXECUTE FUNCTION apply_verification_decision();
