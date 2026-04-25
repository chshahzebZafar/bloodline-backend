-- BloodLink Row Level Security
-- Run AFTER 001_initial_schema.sql

ALTER TABLE users                ENABLE ROW LEVEL SECURITY;
ALTER TABLE blood_requests       ENABLE ROW LEVEL SECURITY;
ALTER TABLE donations            ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages             ENABLE ROW LEVEL SECURITY;
ALTER TABLE hospitals            ENABLE ROW LEVEL SECURITY;
ALTER TABLE donation_events      ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_rsvps          ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications        ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_prefs   ENABLE ROW LEVEL SECURITY;

-- ==================================================================
-- USERS
-- ==================================================================
DROP POLICY IF EXISTS "users_select_public" ON users;
CREATE POLICY "users_select_public" ON users FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "users_insert_self" ON users;
CREATE POLICY "users_insert_self" ON users FOR INSERT
  WITH CHECK (auth_id = auth.uid());

DROP POLICY IF EXISTS "users_update_own" ON users;
CREATE POLICY "users_update_own" ON users FOR UPDATE
  USING (auth_id = auth.uid());

-- ==================================================================
-- BLOOD REQUESTS
-- ==================================================================
DROP POLICY IF EXISTS "requests_select_auth" ON blood_requests;
CREATE POLICY "requests_select_auth" ON blood_requests FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "requests_insert_own" ON blood_requests;
CREATE POLICY "requests_insert_own" ON blood_requests FOR INSERT
  WITH CHECK (recipient_id = (SELECT id FROM users WHERE auth_id = auth.uid()));

DROP POLICY IF EXISTS "requests_update_own_or_accepted" ON blood_requests;
CREATE POLICY "requests_update_own_or_accepted" ON blood_requests FOR UPDATE
  USING (
    recipient_id = (SELECT id FROM users WHERE auth_id = auth.uid())
    OR accepted_by = (SELECT id FROM users WHERE auth_id = auth.uid())
  );

DROP POLICY IF EXISTS "requests_delete_own" ON blood_requests;
CREATE POLICY "requests_delete_own" ON blood_requests FOR DELETE
  USING (recipient_id = (SELECT id FROM users WHERE auth_id = auth.uid()));

-- ==================================================================
-- DONATIONS
-- ==================================================================
DROP POLICY IF EXISTS "donations_select_own" ON donations;
CREATE POLICY "donations_select_own" ON donations FOR SELECT
  USING (donor_id = (SELECT id FROM users WHERE auth_id = auth.uid()));

DROP POLICY IF EXISTS "donations_insert_own" ON donations;
CREATE POLICY "donations_insert_own" ON donations FOR INSERT
  WITH CHECK (donor_id = (SELECT id FROM users WHERE auth_id = auth.uid()));

DROP POLICY IF EXISTS "donations_delete_own_recent" ON donations;
CREATE POLICY "donations_delete_own_recent" ON donations FOR DELETE
  USING (
    donor_id = (SELECT id FROM users WHERE auth_id = auth.uid())
    AND created_at > NOW() - INTERVAL '24 hours'
  );

-- ==================================================================
-- MESSAGES
-- ==================================================================
DROP POLICY IF EXISTS "messages_select_participant" ON messages;
CREATE POLICY "messages_select_participant" ON messages FOR SELECT
  USING (
    request_id IN (
      SELECT id FROM blood_requests
      WHERE recipient_id = (SELECT id FROM users WHERE auth_id = auth.uid())
         OR accepted_by  = (SELECT id FROM users WHERE auth_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "messages_insert_participant" ON messages;
CREATE POLICY "messages_insert_participant" ON messages FOR INSERT
  WITH CHECK (
    sender_id = (SELECT id FROM users WHERE auth_id = auth.uid())
    AND request_id IN (
      SELECT id FROM blood_requests
      WHERE recipient_id = (SELECT id FROM users WHERE auth_id = auth.uid())
         OR accepted_by  = (SELECT id FROM users WHERE auth_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "messages_update_read_participant" ON messages;
CREATE POLICY "messages_update_read_participant" ON messages FOR UPDATE
  USING (
    request_id IN (
      SELECT id FROM blood_requests
      WHERE recipient_id = (SELECT id FROM users WHERE auth_id = auth.uid())
         OR accepted_by  = (SELECT id FROM users WHERE auth_id = auth.uid())
    )
  );

-- ==================================================================
-- HOSPITALS
-- ==================================================================
DROP POLICY IF EXISTS "hospitals_select_all" ON hospitals;
CREATE POLICY "hospitals_select_all" ON hospitals FOR SELECT
  USING (auth.role() = 'authenticated');

-- ==================================================================
-- EVENTS
-- ==================================================================
DROP POLICY IF EXISTS "events_select_all" ON donation_events;
CREATE POLICY "events_select_all" ON donation_events FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "rsvp_select_own_or_service" ON event_rsvps;
CREATE POLICY "rsvp_select_own_or_service" ON event_rsvps FOR SELECT
  USING (user_id = (SELECT id FROM users WHERE auth_id = auth.uid()));

DROP POLICY IF EXISTS "rsvp_all_own" ON event_rsvps;
CREATE POLICY "rsvp_all_own" ON event_rsvps FOR ALL
  USING (user_id = (SELECT id FROM users WHERE auth_id = auth.uid()))
  WITH CHECK (user_id = (SELECT id FROM users WHERE auth_id = auth.uid()));

-- ==================================================================
-- NOTIFICATIONS
-- ==================================================================
DROP POLICY IF EXISTS "notifications_select_own" ON notifications;
CREATE POLICY "notifications_select_own" ON notifications FOR SELECT
  USING (user_id = (SELECT id FROM users WHERE auth_id = auth.uid()));

DROP POLICY IF EXISTS "notifications_update_own" ON notifications;
CREATE POLICY "notifications_update_own" ON notifications FOR UPDATE
  USING (user_id = (SELECT id FROM users WHERE auth_id = auth.uid()));

DROP POLICY IF EXISTS "notif_prefs_all_own" ON notification_prefs;
CREATE POLICY "notif_prefs_all_own" ON notification_prefs FOR ALL
  USING (user_id = (SELECT id FROM users WHERE auth_id = auth.uid()))
  WITH CHECK (user_id = (SELECT id FROM users WHERE auth_id = auth.uid()));
