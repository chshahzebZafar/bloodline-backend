-- Migration 007 — production safeguards & compliance
--
-- 1. Track Terms / Privacy acceptance per user (App Store / Play Store
--    compliance, plus audit trail when policies change).
-- 2. Defense-in-depth donation cooldown trigger so even direct DB writes
--    can't bypass the 56-day eligibility window enforced in the API.
-- 3. Index the FCM token column we look up on every push fan-out.

-- ------------------------------------------------------------------
-- 1. Policy acceptance timestamps
-- ------------------------------------------------------------------
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS policies_accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS policies_version     TEXT;

COMMENT ON COLUMN users.policies_accepted_at IS
  'When the user last accepted Terms & Privacy. NULL = never accepted (block sensitive flows).';
COMMENT ON COLUMN users.policies_version IS
  'Version string of the policies the user accepted (e.g. "2025-01-15"). Bump when text changes.';

-- ------------------------------------------------------------------
-- 2. Donation cooldown — trigger guard
-- ------------------------------------------------------------------
-- The API checks next_eligible_at, but a stolen service-role key or a
-- direct psql write could still insert too soon. This trigger blocks
-- the insert at the database level for whole-blood donations.

CREATE OR REPLACE FUNCTION enforce_donation_cooldown()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_eligible_at TIMESTAMPTZ;
BEGIN
  -- Plasma / platelets have shorter recovery windows; only enforce on whole.
  IF NEW.component <> 'whole' THEN
    RETURN NEW;
  END IF;

  SELECT next_eligible_at
    INTO v_eligible_at
    FROM users
   WHERE id = NEW.donor_id;

  IF v_eligible_at IS NOT NULL
     AND v_eligible_at::date > NEW.donation_date THEN
    RAISE EXCEPTION
      'Donor % not eligible until % (attempted %)',
      NEW.donor_id, v_eligible_at::date, NEW.donation_date
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_donation_cooldown ON donations;
CREATE TRIGGER trg_enforce_donation_cooldown
  BEFORE INSERT ON donations
  FOR EACH ROW EXECUTE FUNCTION enforce_donation_cooldown();

-- ------------------------------------------------------------------
-- 3. FCM token index — push fan-out filters by `fcm_token IS NOT NULL`.
-- ------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_users_fcm_token_present
  ON users (id)
  WHERE fcm_token IS NOT NULL;
