-- Extend the nearby-donors and nearby-requests RPCs to also return
-- lng/lat as plain numeric columns so the mobile map can plot them
-- without needing to parse PostGIS hex EWKB on the client.

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
  lng DOUBLE PRECISION,
  lat DOUBLE PRECISION,
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
    ST_X(u.location::geometry)::DOUBLE PRECISION AS lng,
    ST_Y(u.location::geometry)::DOUBLE PRECISION AS lat,
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
  lng DOUBLE PRECISION,
  lat DOUBLE PRECISION,
  distance_km FLOAT
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    r.id,
    r.blood_type,
    r.urgency,
    r.units_needed,
    r.hospital_name,
    r.expires_at,
    r.status,
    r.recipient_id,
    ST_X(r.hospital_location::geometry)::DOUBLE PRECISION AS lng,
    ST_Y(r.hospital_location::geometry)::DOUBLE PRECISION AS lat,
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

GRANT EXECUTE ON FUNCTION find_nearby_donors(FLOAT, FLOAT, FLOAT, TEXT[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION find_nearby_requests(FLOAT, FLOAT, FLOAT, TEXT[]) TO authenticated, service_role;
