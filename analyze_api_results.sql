-- Database Queries to Analyze API Test Results
-- Run these queries after testing your API endpoints

-- ==================================================================
-- 1. User Registration Analysis
-- ==================================================================
-- Check if test user was created
SELECT 
    'User Registration Check' as test,
    email,
    name,
    blood_type,
    city,
    country_code,
    created_at,
    is_verified,
    points,
    total_donations
FROM users 
WHERE email = 'test@bloodlink.com';

-- Count total users
SELECT 
    'Total Users' as metric,
    COUNT(*) as count
FROM users;

-- ==================================================================
-- 2. Blood Requests Analysis
-- ==================================================================
-- Check blood requests created
SELECT 
    'Blood Requests' as test,
    id,
    blood_type,
    units_needed,
    hospital_name,
    urgency,
    status,
    created_at,
    expires_at,
    recipient_id
FROM blood_requests 
WHERE hospital_name = 'Test Hospital'
ORDER BY created_at DESC;

-- Count requests by status
SELECT 
    status,
    COUNT(*) as count
FROM blood_requests 
GROUP BY status;

-- ==================================================================
-- 3. Location Data Analysis
-- ==================================================================
-- Check user locations (geography data)
SELECT 
    'User Locations' as test,
    name,
    city,
    country_code,
    ST_AsText(location) as location_coordinates,
    location IS NOT NULL as has_location
FROM users 
WHERE location IS NOT NULL;

-- Check hospital locations
SELECT 
    'Hospital Locations' as test,
    name,
    city,
    ST_AsText(location) as location_coordinates,
    location IS NOT NULL as has_location
FROM hospitals 
WHERE location IS NOT NULL;

-- Test distance calculation between user and hospital
SELECT 
    'Distance Test' as test,
    u.name as user_name,
    h.name as hospital_name,
    ST_Distance(u.location, h.location) as distance_meters,
    (ST_Distance(u.location, h.location) / 1000)::FLOAT as distance_km
FROM users u, hospitals h
WHERE u.email = 'test@bloodlink.com' 
  AND h.name = 'Test Hospital'
LIMIT 1;

-- ==================================================================
-- 4. Points and Donations Analysis
-- ==================================================================
-- Check user points after donations
SELECT 
    'Points Analysis' as test,
    email,
    name,
    points,
    total_donations,
    last_donation_at,
    next_eligible_at
FROM users 
WHERE email = 'test@bloodlink.com';

-- Check donation records
SELECT 
    'Donation Records' as test,
    id,
    donor_id,
    request_id,
    hospital_name,
    donation_date,
    blood_type,
    units,
    points_earned,
    created_at
FROM donations 
ORDER BY created_at DESC;

-- Sum of points awarded
SELECT 
    'Total Points Awarded' as metric,
    SUM(points_earned) as total_points,
    COUNT(*) as total_donations
FROM donations;

-- ==================================================================
-- 5. API Function Tests
-- ==================================================================
-- Test find_nearby_donors function
SELECT 
    'Find Nearby Donors Test' as test,
    COUNT(*) as donors_found,
    AVG(distance_km) as avg_distance_km
FROM find_nearby_donors(67.0011, 24.8607, 50000, ARRAY['O+', 'A+']);

-- Test find_nearby_hospitals function  
SELECT 
    'Find Nearby Hospitals Test' as test,
    COUNT(*) as hospitals_found,
    AVG(distance_km) as avg_distance_km
FROM find_nearby_hospitals(67.0011, 24.8607, 50000);

-- Test find_nearby_requests function
SELECT 
    'Find Nearby Requests Test' as test,
    COUNT(*) as requests_found,
    AVG(distance_km) as avg_distance_km
FROM find_nearby_requests(67.0011, 24.8607, 50000, ARRAY['O+']);

-- ==================================================================
-- 6. Database Performance Analysis
-- ==================================================================
-- Check table sizes
SELECT 
    'Table Sizes' as test,
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- Check index usage
SELECT 
    'Index Usage' as test,
    schemaname,
    tablename,
    indexname,
    idx_scan as index_scans,
    idx_tup_read as tuples_read,
    idx_tup_fetch as tuples_fetched
FROM pg_stat_user_indexes 
WHERE schemaname = 'public'
ORDER BY idx_scan DESC;

-- ==================================================================
-- 7. Data Integrity Checks
-- ==================================================================
-- Check foreign key constraints
SELECT 
    'Foreign Key Check - Users' as test,
    COUNT(*) as total_users,
    COUNT(CASE WHEN auth_id IS NOT NULL THEN 1 END) as users_with_auth
FROM users;

SELECT 
    'Foreign Key Check - Requests' as test,
    COUNT(*) as total_requests,
    COUNT(CASE WHEN recipient_id IS NOT NULL THEN 1 END) as requests_with_recipient
FROM blood_requests;

SELECT 
    'Foreign Key Check - Donations' as test,
    COUNT(*) as total_donations,
    COUNT(CASE WHEN donor_id IS NOT NULL THEN 1 END) as donations_with_donor
FROM donations;

-- ==================================================================
-- 8. Summary Report
-- ==================================================================
SELECT 
    'Summary Report' as section,
    'Users' as metric,
    COUNT(*) as value
FROM users
UNION ALL
SELECT 
    'Summary Report' as section,
    'Blood Requests' as metric,
    COUNT(*) as value
FROM blood_requests
UNION ALL
SELECT 
    'Summary Report' as section,
    'Donations' as metric,
    COUNT(*) as value
FROM donations
UNION ALL
SELECT 
    'Summary Report' as section,
    'Hospitals' as metric,
    COUNT(*) as value
FROM hospitals
UNION ALL
SELECT 
    'Summary Report' as section,
    'Total Points Awarded' as metric,
    COALESCE(SUM(points_earned), 0) as value
FROM donations;

-- Test complete
SELECT '🩸 API Analysis Complete - Review results above!' as status;
