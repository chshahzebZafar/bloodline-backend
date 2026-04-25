-- Test your BloodLink database with sample data
-- Run this to verify everything works correctly

-- Insert a test user (without auth_id constraint)
INSERT INTO users (
  email, phone, name, blood_type, 
  active_role, availability, location, 
  country_code, city, is_verified
) VALUES (
  'test@bloodlink.com',
  '+1234567890',
  'Test Donor',
  'O+',
  'donor',
  'available',
  ST_MakePoint(67.0011, 24.8607)::geography,
  'PK',
  'Karachi',
  true
);

-- Test increment_points function
SELECT increment_points(
  (SELECT id FROM users WHERE email = 'test@bloodlink.com'),
  100,
  1
);

-- Test find_nearby_donors function
SELECT * FROM find_nearby_donors(
  67.0011, 24.8607, 50000, 
  ARRAY['O+', 'A+']
);

-- Insert a test hospital
INSERT INTO hospitals (
  name, location, country_code, city, address, phone, is_partner
) VALUES (
  'Test Hospital',
  ST_MakePoint(67.0021, 24.8617)::geography,
  'PK',
  'Karachi',
  '123 Test Street',
  '+1234567891',
  true
);

-- Test find_nearby_hospitals function
SELECT * FROM find_nearby_hospitals(
  67.0011, 24.8607, 50000
);

-- Verify data was inserted correctly
SELECT 'Users count: ' || COUNT(*) FROM users;
SELECT 'Hospitals count: ' || COUNT(*) FROM hospitals;
SELECT 'Test user points: ' || points FROM users WHERE email = 'test@bloodlink.com';

SELECT 'Database test completed successfully!' as status;
