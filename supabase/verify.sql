-- BloodLink DB Health Check
-- Run this AFTER migrations to verify everything is operational.
-- Expected output: every section returns "OK" or the expected count.

-- ===================================================================
-- 1. Extensions installed
-- ===================================================================
SELECT
  string_agg(extname, ', ' ORDER BY extname) AS extensions
FROM pg_extension
WHERE extname IN ('uuid-ossp', 'postgis', 'pg_trgm');
-- Expect: pg_trgm, postgis, uuid-ossp

-- ===================================================================
-- 2. Enums present
-- ===================================================================
SELECT
  typname
FROM pg_type
WHERE typtype = 'e'
  AND typname IN (
    'blood_type_enum','role_enum','availability_enum',
    'urgency_enum','req_status_enum','component_enum','msg_type_enum'
  )
ORDER BY typname;
-- Expect: 7 rows

-- ===================================================================
-- 3. Tables present
-- ===================================================================
SELECT
  table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'users','blood_requests','donations','messages',
    'hospitals','donation_events','event_rsvps',
    'notifications','notification_prefs'
  )
ORDER BY table_name;
-- Expect: 9 rows

-- ===================================================================
-- 4. RLS enabled on every table
-- ===================================================================
SELECT
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relname IN (
    'users','blood_requests','donations','messages',
    'hospitals','donation_events','event_rsvps',
    'notifications','notification_prefs'
  )
ORDER BY c.relname;
-- Expect: all rows rls_enabled = true

-- ===================================================================
-- 5. Policies count per table
-- ===================================================================
SELECT
  schemaname, tablename, COUNT(*) AS policy_count
FROM pg_policies
WHERE schemaname = 'public'
GROUP BY schemaname, tablename
ORDER BY tablename;

-- ===================================================================
-- 6. Geo indexes
-- ===================================================================
SELECT
  indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname IN (
    'idx_users_location','idx_requests_location',
    'idx_hospitals_location','idx_events_location'
  )
ORDER BY indexname;
-- Expect: 4 rows

-- ===================================================================
-- 7. RPC functions present
-- ===================================================================
SELECT
  proname
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND proname IN (
    'increment_points','find_nearby_donors',
    'find_nearby_requests','find_nearby_hospitals',
    'update_updated_at','bump_event_rsvp_count'
  )
ORDER BY proname;
-- Expect: 6 rows

-- ===================================================================
-- 8. users.next_eligible_at is a GENERATED column
-- ===================================================================
SELECT
  column_name,
  is_generated,
  generation_expression
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'users'
  AND column_name = 'next_eligible_at';
-- Expect: is_generated = 'ALWAYS'

-- ===================================================================
-- 9. Smoke test: can find_nearby_donors run?
-- ===================================================================
-- (Karachi center, 50km radius, all types — returns empty if no donors)
SELECT COUNT(*) AS donor_count
FROM find_nearby_donors(
  67.0011, 24.8607, 50000,
  ARRAY['A+','A-','B+','B-','AB+','AB-','O+','O-']
);

-- ===================================================================
-- 10. Smoke test: find_nearby_hospitals
-- ===================================================================
SELECT COUNT(*) AS hospital_count
FROM find_nearby_hospitals(67.0011, 24.8607, 50000);
-- Expect: >= 5 if seed ran
