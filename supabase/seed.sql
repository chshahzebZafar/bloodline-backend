-- BloodLink seed data — sample hospitals and events for development testing.
-- Run AFTER the schema migrations. Safe to re-run (uses ON CONFLICT).

-- ==================================================================
-- Sample hospitals (Karachi, Pakistan)
-- ==================================================================
INSERT INTO hospitals (name, location, country_code, city, address, phone, is_partner, stock)
VALUES
  ('Aga Khan University Hospital',
   ST_MakePoint(67.0626, 24.8946)::geography,
   'PK', 'Karachi', 'Stadium Rd, Karachi', '+92-21-34930051', TRUE,
   '{"A+": 12, "A-": 3, "B+": 15, "B-": 4, "AB+": 2, "AB-": 1, "O+": 18, "O-": 5}'::jsonb),

  ('Indus Hospital',
   ST_MakePoint(67.0837, 24.8607)::geography,
   'PK', 'Karachi', 'Plot C-76, Korangi Crossing', '+92-21-111-111-463', TRUE,
   '{"A+": 8, "O+": 10, "O-": 2}'::jsonb),

  ('Liaquat National Hospital',
   ST_MakePoint(67.0431, 24.8840)::geography,
   'PK', 'Karachi', 'Stadium Rd, Karachi', '+92-21-34412001', FALSE,
   '{}'::jsonb),

  ('Civil Hospital Karachi',
   ST_MakePoint(67.0164, 24.8738)::geography,
   'PK', 'Karachi', 'Baba-e-Urdu Rd', '+92-21-99215740', FALSE,
   '{}'::jsonb),

  ('Jinnah Postgraduate Medical Centre',
   ST_MakePoint(67.0321, 24.8693)::geography,
   'PK', 'Karachi', 'Rafiqui H J Shaheed Rd', '+92-21-99201300', FALSE,
   '{}'::jsonb)
ON CONFLICT DO NOTHING;

-- ==================================================================
-- Sample upcoming donation drives
-- ==================================================================
INSERT INTO donation_events
  (org_name, title, description, location, address, country_code, city, event_date, capacity)
VALUES
  ('Red Crescent PK',
   'City-wide Blood Drive',
   'Walk-in donations welcome. Free refreshments for all donors.',
   ST_MakePoint(67.0626, 24.8946)::geography,
   'Aga Khan University Hospital, Stadium Rd',
   'PK', 'Karachi', NOW() + INTERVAL '7 days', 200),

  ('Indus Hospital Foundation',
   'Ramadan Emergency Drive',
   'Urgent need for O- and AB+ donors.',
   ST_MakePoint(67.0837, 24.8607)::geography,
   'Plot C-76, Korangi Crossing',
   'PK', 'Karachi', NOW() + INTERVAL '14 days', 150)
ON CONFLICT DO NOTHING;
