import { z } from 'zod';

export const bloodTypeZ = z.enum(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']);
export const componentZ = z.enum(['whole', 'plasma', 'platelets', 'rbc']);
export const urgencyZ = z.enum(['normal', 'urgent', 'critical']);
export const availabilityZ = z.enum(['available', 'busy', 'cooldown']);
export const msgTypeZ = z.enum(['text', 'location', 'system']);

export const latLngZ = {
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
};

export const registerSchema = z.object({
  email: z.string().email().optional(),
  phone: z.string().min(5).optional(),
  password: z.string().min(8),
  name: z.string().min(2).max(100),
  blood_type: bloodTypeZ,
  lat: latLngZ.lat.optional(),
  lng: latLngZ.lng.optional(),
  country_code: z.string().length(2).optional(),
  city: z.string().optional(),
  referred_by: z.string().optional(),
}).refine((d) => d.email || d.phone, { message: 'Email or phone required' });

export const loginSchema = z.object({
  email: z.string().email().optional(),
  phone: z.string().min(5).optional(),
  password: z.string().min(1),
}).refine((d) => d.email || d.phone, { message: 'Email or phone required' });

export const refreshSchema = z.object({ refresh_token: z.string().min(10) });

export const resetPasswordSchema = z.object({
  email: z.string().email(),
  redirect_to: z.string().url().optional(),
});

export const otpSendSchema = z.object({ phone: z.string().min(5) });
export const otpVerifySchema = z.object({ phone: z.string().min(5), token: z.string().min(4) });

export const updateMeSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  blood_type: bloodTypeZ.optional(),
  weight_kg: z.number().positive().max(500).optional(),
  dob: z.string().optional(),
  lang: z.string().length(2).optional(),
  active_role: z.enum(['donor', 'recipient']).optional(),
});

export const updateLocationSchema = z.object({
  lat: latLngZ.lat,
  lng: latLngZ.lng,
  country_code: z.string().length(2).optional(),
  city: z.string().optional(),
});

export const updateAvailabilitySchema = z.object({ availability: availabilityZ });

export const fcmTokenSchema = z.object({ fcm_token: z.string().min(10) });

export const eligibilitySchema = z.object({
  answers: z.object({
    recent_illness: z.boolean(),
    recent_travel_malaria: z.boolean(),
    current_medications: z.string().default(''),
    tattoo_or_piercing_recent: z.boolean(),
    pregnant_or_postpartum: z.boolean(),
    recent_surgery: z.boolean(),
  }),
});

export const createRequestSchema = z.object({
  blood_type: bloodTypeZ,
  component: componentZ.default('whole'),
  units_needed: z.number().int().min(1).max(10),
  hospital_name: z.string().min(2).max(200),
  hospital_lat: latLngZ.lat,
  hospital_lng: latLngZ.lng,
  ward: z.string().optional(),
  urgency: urgencyZ.default('normal'),
  expires_in_hours: z.number().int().min(1).max(72).default(24),
  search_radius_km: z.number().positive().max(500).optional(),
  country_code: z.string().length(2).optional(),
  city: z.string().optional(),
  notes: z.string().max(500).optional(),
});

export const updateRequestSchema = z.object({
  urgency: urgencyZ.optional(),
  search_radius_km: z.number().positive().max(500).optional(),
  notes: z.string().max(500).optional(),
  expires_in_hours: z.number().int().min(1).max(72).optional(),
});

export const nearbyQuerySchema = z.object({
  lat: latLngZ.lat,
  lng: latLngZ.lng,
  radius_km: z.coerce.number().positive().max(500).default(25),
  blood_type: bloodTypeZ.optional(),
  urgency: urgencyZ.optional(),
  limit: z.coerce.number().int().positive().max(100).default(30),
});

export const donorsNearbyQuerySchema = z.object({
  lat: latLngZ.lat,
  lng: latLngZ.lng,
  radius_km: z.coerce.number().positive().max(500).default(25),
  blood_type: bloodTypeZ.optional(),
  limit: z.coerce.number().int().positive().max(100).default(50),
});

export const leaderboardQuerySchema = z.object({
  scope: z.enum(['city', 'country', 'global']).default('global'),
  country_code: z.string().length(2).optional(),
  city: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).default(50),
});

export const logDonationSchema = z.object({
  hospital_name: z.string().min(2),
  donation_date: z.string(),
  blood_type: bloodTypeZ,
  component: componentZ.default('whole'),
  units: z.number().int().min(1).max(10).default(1),
  request_id: z.string().uuid().optional(),
  notes: z.string().max(500).optional(),
});

export const sendMessageSchema = z.object({
  msg_type: msgTypeZ.default('text'),
  content: z.string().optional(),
  lat: latLngZ.lat.optional(),
  lng: latLngZ.lng.optional(),
});

export const hospitalsQuerySchema = z.object({
  lat: latLngZ.lat,
  lng: latLngZ.lng,
  country_code: z.string().length(2).optional(),
  name: z.string().optional(),
  radius_km: z.coerce.number().positive().max(200).default(50),
});

export const updateStockSchema = z.object({
  stock: z.record(z.string(), z.number().int().nonnegative()),
});

export const eventsQuerySchema = z.object({
  country_code: z.string().length(2).optional(),
  city: z.string().optional(),
  from_date: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).default(50),
});

export const notificationsQuerySchema = z.object({
  unread_only: z.coerce.boolean().default(false),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export const updateNotifPrefsSchema = z.object({
  radius_km: z.number().positive().max(500).optional(),
  blood_types: z.array(bloodTypeZ).optional(),
  quiet_from: z.string().optional(),
  quiet_to: z.string().optional(),
  enabled: z.boolean().optional(),
});
