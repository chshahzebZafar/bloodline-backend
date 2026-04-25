-- BloodLink indexes for performance

-- Geo indexes (GiST for spatial queries)
CREATE INDEX IF NOT EXISTS idx_users_location        ON users USING GIST(location);
CREATE INDEX IF NOT EXISTS idx_requests_location     ON blood_requests USING GIST(hospital_location);
CREATE INDEX IF NOT EXISTS idx_hospitals_location    ON hospitals USING GIST(location);
CREATE INDEX IF NOT EXISTS idx_events_location       ON donation_events USING GIST(location);

-- Filter indexes
CREATE INDEX IF NOT EXISTS idx_users_blood_type      ON users(blood_type);
CREATE INDEX IF NOT EXISTS idx_users_availability    ON users(availability);
CREATE INDEX IF NOT EXISTS idx_users_country         ON users(country_code);
CREATE INDEX IF NOT EXISTS idx_users_active_role     ON users(active_role);

CREATE INDEX IF NOT EXISTS idx_requests_status       ON blood_requests(status);
CREATE INDEX IF NOT EXISTS idx_requests_blood_type   ON blood_requests(blood_type);
CREATE INDEX IF NOT EXISTS idx_requests_expires_at   ON blood_requests(expires_at);
CREATE INDEX IF NOT EXISTS idx_requests_recipient    ON blood_requests(recipient_id);
CREATE INDEX IF NOT EXISTS idx_requests_accepted_by  ON blood_requests(accepted_by);

CREATE INDEX IF NOT EXISTS idx_messages_request_id   ON messages(request_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at   ON messages(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_donations_donor_id    ON donations(donor_id);
CREATE INDEX IF NOT EXISTS idx_donations_date        ON donations(donation_date DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_user    ON notifications(user_id, read_at, created_at DESC);

-- Text search (trigram)
CREATE INDEX IF NOT EXISTS idx_hospitals_name_trgm   ON hospitals USING GIN(name gin_trgm_ops);

-- Leaderboard ordering
CREATE INDEX IF NOT EXISTS idx_users_leaderboard     ON users(total_donations DESC) WHERE active_role = 'donor';
