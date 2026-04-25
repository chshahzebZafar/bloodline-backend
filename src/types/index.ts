import type { BloodType } from '../utils/bloodCompat';

export type Role = 'donor' | 'recipient';
export type Availability = 'available' | 'busy' | 'cooldown';
export type Urgency = 'normal' | 'urgent' | 'critical';
export type RequestStatus = 'open' | 'accepted' | 'fulfilled' | 'expired' | 'cancelled';
export type Component = 'whole' | 'plasma' | 'platelets' | 'rbc';
export type MessageType = 'text' | 'location' | 'system';

export interface UserProfile {
  id: string;
  auth_id: string;
  email: string | null;
  phone: string | null;
  name: string;
  blood_type: BloodType;
  weight_kg: number | null;
  dob: string | null;
  active_role: Role;
  availability: Availability;
  last_donation_at: string | null;
  next_eligible_at: string | null;
  location: { type: 'Point'; coordinates: [number, number] } | null;
  country_code: string | null;
  city: string | null;
  is_verified: boolean;
  points: number;
  total_donations: number;
  fcm_token: string | null;
  lang: string;
  referral_code: string;
  referred_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface BloodRequest {
  id: string;
  recipient_id: string;
  blood_type: BloodType;
  component: Component;
  units_needed: number;
  hospital_name: string;
  hospital_location: { type: 'Point'; coordinates: [number, number] };
  ward: string | null;
  urgency: Urgency;
  status: RequestStatus;
  search_radius_km: number;
  expires_at: string;
  country_code: string | null;
  city: string | null;
  notes: string | null;
  accepted_by: string | null;
  accepted_at: string | null;
  fulfilled_at: string | null;
  created_at: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: UserProfile;
      accessToken?: string;
    }
  }
}

export {};
