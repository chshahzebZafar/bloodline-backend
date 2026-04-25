import { supabaseAdmin } from '../config/supabase';
import { env } from '../config/env';
import { getCompatibleDonorTypes, BloodType } from '../utils/bloodCompat';

export interface NearbyDonor {
  id: string;
  name: string;
  blood_type: BloodType;
  availability: string;
  is_verified: boolean;
  total_donations: number;
  fcm_token: string | null;
  distance_km: number;
}

export interface NearbyRequest {
  id: string;
  blood_type: BloodType;
  urgency: string;
  units_needed: number;
  hospital_name: string;
  expires_at: string;
  status: string;
  recipient_id: string;
  distance_km: number;
}

export async function findNearbyDonors(
  lat: number,
  lng: number,
  radiusKm: number,
  bloodTypes: BloodType[],
  limit = 50
): Promise<NearbyDonor[]> {
  const { data, error } = await supabaseAdmin.rpc('find_nearby_donors', {
    p_lng: lng,
    p_lat: lat,
    p_radius_m: radiusKm * 1000,
    p_blood_types: bloodTypes,
  });

  if (error) throw error;
  return (data ?? []).slice(0, limit) as NearbyDonor[];
}

export async function findNearbyRequests(
  lat: number,
  lng: number,
  radiusKm: number,
  bloodTypes: BloodType[] = []
): Promise<NearbyRequest[]> {
  const { data, error } = await supabaseAdmin.rpc('find_nearby_requests', {
    p_lng: lng,
    p_lat: lat,
    p_radius_m: radiusKm * 1000,
    p_blood_types: bloodTypes,
  });

  if (error) throw error;
  return (data ?? []) as NearbyRequest[];
}

export async function findNearbyHospitals(
  lat: number,
  lng: number,
  opts: { countryCode?: string; nameSearch?: string; radiusKm?: number } = {}
) {
  const { data, error } = await supabaseAdmin.rpc('find_nearby_hospitals', {
    p_lng: lng,
    p_lat: lat,
    p_radius_m: (opts.radiusKm ?? 50) * 1000,
    p_name_search: opts.nameSearch ?? null,
    p_country_code: opts.countryCode ?? null,
  });

  if (error) throw error;
  return data ?? [];
}

export async function autoExpandRadius(
  lat: number,
  lng: number,
  recipientBloodType: BloodType,
  minDonors = 3
): Promise<{ donors: NearbyDonor[]; radiusUsedKm: number }> {
  const compatible = getCompatibleDonorTypes(recipientBloodType);
  const radii = [10, 25, 50, 100, Math.min(500, env.MAX_SEARCH_RADIUS_KM)];

  let donors: NearbyDonor[] = [];
  let radiusUsedKm = radii[0];

  for (const r of radii) {
    donors = await findNearbyDonors(lat, lng, r, compatible, 500);
    radiusUsedKm = r;
    if (donors.length >= minDonors) break;
  }

  return { donors, radiusUsedKm };
}

export function pointToGeog(lng: number, lat: number) {
  return `POINT(${lng} ${lat})`;
}
