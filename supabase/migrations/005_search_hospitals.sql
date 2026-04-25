-- Hospital search RPC for the autocomplete in the mobile post-request flow.
-- Returns lng/lat as plain numeric columns (PostGIS hex EWKB is unusable client-side)
-- and supports country + radius filters.
--
-- Usage from JS:
--   supabase.rpc('search_hospitals', {
--     p_query: 'aga',
--     p_country_code: 'PK',
--     p_lng: 67.0011,
--     p_lat: 24.8607,
--     p_radius_m: 100000,
--     p_limit: 8,
--   });

CREATE OR REPLACE FUNCTION search_hospitals(
  p_query        TEXT DEFAULT NULL,
  p_country_code CHAR(2) DEFAULT NULL,
  p_lng          DOUBLE PRECISION DEFAULT NULL,
  p_lat          DOUBLE PRECISION DEFAULT NULL,
  p_radius_m     DOUBLE PRECISION DEFAULT 200000,
  p_limit        INT DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  address TEXT,
  city TEXT,
  country_code CHAR(2),
  is_partner BOOLEAN,
  lng DOUBLE PRECISION,
  lat DOUBLE PRECISION,
  distance_km DOUBLE PRECISION
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    h.id,
    h.name,
    h.address,
    h.city,
    h.country_code,
    h.is_partner,
    ST_X(h.location::geometry)::DOUBLE PRECISION AS lng,
    ST_Y(h.location::geometry)::DOUBLE PRECISION AS lat,
    CASE
      WHEN p_lng IS NOT NULL AND p_lat IS NOT NULL
      THEN ST_Distance(h.location, ST_MakePoint(p_lng, p_lat)::geography) / 1000.0
      ELSE NULL
    END AS distance_km
  FROM hospitals h
  WHERE
    (p_country_code IS NULL OR h.country_code = p_country_code)
    AND (p_query IS NULL OR p_query = '' OR h.name ILIKE '%' || p_query || '%')
    AND (
      p_lng IS NULL OR p_lat IS NULL
      OR ST_DWithin(h.location, ST_MakePoint(p_lng, p_lat)::geography, p_radius_m)
    )
  ORDER BY
    -- Partners first, then closest if we have a point, then alphabetical
    h.is_partner DESC,
    CASE
      WHEN p_lng IS NOT NULL AND p_lat IS NOT NULL
      THEN ST_Distance(h.location, ST_MakePoint(p_lng, p_lat)::geography)
      ELSE 0
    END ASC,
    h.name ASC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION search_hospitals(TEXT, CHAR(2), DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, INT) TO authenticated;
