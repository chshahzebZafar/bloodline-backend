-- Debug User Insert Test
-- Run this directly in Supabase SQL Editor to test user creation

-- Test 1: Try to insert a user directly without auth_id
INSERT INTO users (
  email, 
  phone, 
  name, 
  blood_type, 
  country_code, 
  city, 
  is_verified
) VALUES (
  'test@bloodlink.com',
  '+1234567890',
  'Test Donor',
  'O+',
  'PK',
  'Karachi',
  false
);

-- Check if user was created
SELECT * FROM users WHERE email = 'test@bloodlink.com';

-- Test 2: Try to insert with location
INSERT INTO users (
  email, 
  phone, 
  name, 
  blood_type, 
  location,
  country_code, 
  city, 
  is_verified
) VALUES (
  'test2@bloodlink.com',
  '+1234567891',
  'Test Donor 2',
  'O+',
  ST_MakePoint(67.0011, 24.8607)::geography,
  'PK',
  'Karachi',
  false
);

-- Check if user with location was created
SELECT * FROM users WHERE email = 'test2@bloodlink.com';

-- Test 3: Check table structure
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns 
WHERE table_name = 'users' 
  AND table_schema = 'public'
ORDER BY ordinal_position;

-- Test 4: Check if auth.users table exists and has records
SELECT COUNT(*) as auth_users_count FROM auth.users;

SELECT 'Debug test completed!' as status;
