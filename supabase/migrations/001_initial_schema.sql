-- BloodLink initial schema
-- Run in Supabase SQL editor (or via `supabase db push`)

-- ==================================================================
-- EXTENSIONS
-- ==================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ==================================================================
-- ENUMS
-- ==================================================================
DO $$ BEGIN
  CREATE TYPE blood_type_enum AS ENUM ('A+','A-','B+','B-','AB+','AB-','O+','O-');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE role_enum AS ENUM ('donor','recipient');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE availability_enum AS ENUM ('available','busy','cooldown');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE urgency_enum AS ENUM ('normal','urgent','critical');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE req_status_enum AS ENUM ('open','accepted','fulfilled','expired','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE component_enum AS ENUM ('whole','plasma','platelets','rbc');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE msg_type_enum AS ENUM ('text','location','system');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ==================================================================
-- TABLES
-- ==================================================================
CREATE TABLE IF NOT EXISTS users (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  auth_id             UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email               TEXT UNIQUE,
  phone               TEXT UNIQUE,
  name                TEXT NOT NULL,
  blood_type          blood_type_enum NOT NULL,
  weight_kg           FLOAT,
  dob                 DATE,
  active_role         role_enum DEFAULT 'donor',
  availability        availability_enum DEFAULT 'available',
  last_donation_at    TIMESTAMPTZ,
  next_eligible_at    TIMESTAMPTZ GENERATED ALWAYS AS
                      (last_donation_at + INTERVAL '56 days') STORED,
  location            GEOGRAPHY(POINT, 4326),
  country_code        CHAR(2),
  city                TEXT,
  is_verified         BOOLEAN DEFAULT FALSE,
  points              INTEGER DEFAULT 0,
  total_donations     INTEGER DEFAULT 0,
  fcm_token           TEXT,
  lang                TEXT DEFAULT 'en',
  referral_code       TEXT UNIQUE DEFAULT substring(md5(random()::text), 1, 8),
  referred_by         UUID REFERENCES users(id),
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS blood_requests (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  recipient_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blood_type          blood_type_enum NOT NULL,
  component           component_enum DEFAULT 'whole',
  units_needed        INTEGER NOT NULL CHECK (units_needed BETWEEN 1 AND 10),
  hospital_name       TEXT NOT NULL,
  hospital_location   GEOGRAPHY(POINT, 4326) NOT NULL,
  ward                TEXT,
  urgency             urgency_enum DEFAULT 'normal',
  status              req_status_enum DEFAULT 'open',
  search_radius_km    FLOAT DEFAULT 25,
  expires_at          TIMESTAMPTZ NOT NULL,
  country_code        CHAR(2),
  city                TEXT,
  notes               TEXT,
  accepted_by         UUID REFERENCES users(id),
  accepted_at         TIMESTAMPTZ,
  fulfilled_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS donations (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  donor_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  request_id      UUID REFERENCES blood_requests(id),
  hospital_name   TEXT NOT NULL,
  donation_date   DATE NOT NULL,
  blood_type      blood_type_enum NOT NULL,
  component       component_enum DEFAULT 'whole',
  units           INTEGER DEFAULT 1,
  points_earned   INTEGER DEFAULT 100,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS messages (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  request_id   UUID NOT NULL REFERENCES blood_requests(id) ON DELETE CASCADE,
  sender_id    UUID NOT NULL REFERENCES users(id),
  msg_type     msg_type_enum DEFAULT 'text',
  content      TEXT,
  location     GEOGRAPHY(POINT, 4326),
  read_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hospitals (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name              TEXT NOT NULL,
  location          GEOGRAPHY(POINT, 4326) NOT NULL,
  country_code      CHAR(2) NOT NULL,
  city              TEXT,
  address           TEXT,
  phone             TEXT,
  is_partner        BOOLEAN DEFAULT FALSE,
  stock             JSONB DEFAULT '{}'::jsonb,
  stock_updated_at  TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS donation_events (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_name      TEXT NOT NULL,
  title         TEXT NOT NULL,
  description   TEXT,
  location      GEOGRAPHY(POINT, 4326),
  address       TEXT,
  country_code  CHAR(2),
  city          TEXT,
  event_date    TIMESTAMPTZ NOT NULL,
  capacity      INTEGER,
  rsvp_count    INTEGER DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS event_rsvps (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id    UUID REFERENCES donation_events(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(event_id, user_id)
);

CREATE TABLE IF NOT EXISTS notifications (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  body        TEXT,
  data        JSONB DEFAULT '{}'::jsonb,
  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notification_prefs (
  user_id       UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  radius_km     FLOAT DEFAULT 25,
  blood_types   TEXT[] DEFAULT ARRAY[]::TEXT[],
  quiet_from    TIME,
  quiet_to      TIME,
  enabled       BOOLEAN DEFAULT TRUE,
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ==================================================================
-- TRIGGERS
-- ==================================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_updated_at ON users;
CREATE TRIGGER users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Keep event rsvp_count in sync
CREATE OR REPLACE FUNCTION bump_event_rsvp_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE donation_events SET rsvp_count = rsvp_count + 1 WHERE id = NEW.event_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE donation_events SET rsvp_count = GREATEST(rsvp_count - 1, 0) WHERE id = OLD.event_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS event_rsvps_count ON event_rsvps;
CREATE TRIGGER event_rsvps_count
  AFTER INSERT OR DELETE ON event_rsvps
  FOR EACH ROW EXECUTE FUNCTION bump_event_rsvp_count();

-- ==================================================================
-- RPC FUNCTIONS
-- ==================================================================
CREATE OR REPLACE FUNCTION increment_points(
  p_user_id UUID,
  p_points INT,
  p_increment_donations INT
)
RETURNS void AS $$
  UPDATE users SET
    points = points + p_points,
    total_donations = total_donations + COALESCE(p_increment_donations, 0)
  WHERE id = p_user_id;
$$ LANGUAGE sql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION find_nearby_donors(
  p_lng FLOAT,
  p_lat FLOAT,
  p_radius_m FLOAT,
  p_blood_types TEXT[]
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  blood_type blood_type_enum,
  availability availability_enum,
  is_verified BOOLEAN,
  total_donations INTEGER,
  fcm_token TEXT,
  distance_km FLOAT
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    u.id,
    u.name,
    u.blood_type,
    u.availability,
    u.is_verified,
    u.total_donations,
    u.fcm_token,
    (ST_Distance(u.location, ST_MakePoint(p_lng, p_lat)::geography) / 1000)::FLOAT AS distance_km
  FROM users u
  WHERE
    u.active_role = 'donor'
    AND u.availability = 'available'
    AND u.blood_type::TEXT = ANY(p_blood_types)
    AND u.location IS NOT NULL
    AND ST_DWithin(u.location, ST_MakePoint(p_lng, p_lat)::geography, p_radius_m)
    AND (u.next_eligible_at IS NULL OR u.next_eligible_at <= NOW())
  ORDER BY distance_km ASC
  LIMIT 500;
$$;

CREATE OR REPLACE FUNCTION find_nearby_requests(
  p_lng FLOAT,
  p_lat FLOAT,
  p_radius_m FLOAT,
  p_blood_types TEXT[]
)
RETURNS TABLE (
  id UUID,
  blood_type blood_type_enum,
  urgency urgency_enum,
  units_needed INTEGER,
  hospital_name TEXT,
  expires_at TIMESTAMPTZ,
  status req_status_enum,
  recipient_id UUID,
  distance_km FLOAT
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    r.id, r.blood_type, r.urgency, r.units_needed,
    r.hospital_name, r.expires_at, r.status, r.recipient_id,
    (ST_Distance(r.hospital_location, ST_MakePoint(p_lng, p_lat)::geography) / 1000)::FLOAT AS distance_km
  FROM blood_requests r
  WHERE
    r.status = 'open'
    AND r.expires_at > NOW()
    AND (p_blood_types IS NULL OR cardinality(p_blood_types) = 0
         OR r.blood_type::TEXT = ANY(p_blood_types))
    AND ST_DWithin(r.hospital_location, ST_MakePoint(p_lng, p_lat)::geography, p_radius_m)
  ORDER BY r.urgency DESC, distance_km ASC
  LIMIT 100;
$$;

CREATE OR REPLACE FUNCTION find_nearby_hospitals(
  p_lng FLOAT,
  p_lat FLOAT,
  p_radius_m FLOAT DEFAULT 50000,
  p_name_search TEXT DEFAULT NULL,
  p_country_code CHAR(2) DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  address TEXT,
  phone TEXT,
  is_partner BOOLEAN,
  stock JSONB,
  distance_km FLOAT
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    h.id, h.name, h.address, h.phone, h.is_partner, h.stock,
    (ST_Distance(h.location, ST_MakePoint(p_lng, p_lat)::geography) / 1000)::FLOAT AS distance_km
  FROM hospitals h
  WHERE
    (p_country_code IS NULL OR h.country_code = p_country_code)
    AND (p_name_search IS NULL OR h.name ILIKE '%' || p_name_search || '%')
    AND ST_DWithin(h.location, ST_MakePoint(p_lng, p_lat)::geography, p_radius_m)
  ORDER BY distance_km ASC
  LIMIT 20;
$$;
