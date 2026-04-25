import { BloodType, getCompatibleDonorTypes, getRecipientTypesForDonor } from '../utils/bloodCompat';
import { findNearbyDonors } from './geo.service';
import {
  buildRequestNotification,
  recordNotificationsBatch,
  sendPushToTokens,
} from './notification.service';

export function compatibleDonorsFor(recipient: BloodType): BloodType[] {
  return getCompatibleDonorTypes(recipient);
}

export function canDonateTo(donor: BloodType): BloodType[] {
  return getRecipientTypesForDonor(donor);
}

export function canDonorServeRequest(donorType: BloodType, requestType: BloodType): boolean {
  return canDonateTo(donorType).includes(requestType);
}

/**
 * Fan-out push notifications + DB notification rows to every nearby donor
 * whose blood type can serve the request.
 *
 * Called from two places:
 *   1. requests.controller → createRequest (when mobile hits POST /v1/requests)
 *   2. internal.controller → onRequestCreated (when Supabase webhook fires
 *      because mobile inserted directly via the JS client)
 *
 * Idempotent-ish: invalid FCM tokens are auto-cleaned by sendPushToTokens.
 * Calling twice for the same request would double-send pushes — the webhook
 * path is the production trigger, the controller path exists for completeness
 * if/when mobile is migrated to the API gateway pattern.
 */
export async function notifyMatchingDonors(
  request: {
    id: string;
    blood_type: BloodType;
    hospital_name: string;
    urgency: string;
    search_radius_km: number;
    units_needed?: number;
  },
  lat: number,
  lng: number
): Promise<{ targeted: number; delivered: number }> {
  const compat = getCompatibleDonorTypes(request.blood_type);
  const donors = await findNearbyDonors(lat, lng, request.search_radius_km, compat, 500);
  const tokens = donors.map((d) => d.fcm_token).filter((t): t is string => !!t);
  const userIds = donors.map((d) => d.id);

  const payload = buildRequestNotification(
    { ...request, units_needed: request.units_needed ?? 1 },
    donors[0]?.distance_km ?? 0
  );
  const [delivered] = await Promise.all([
    sendPushToTokens(tokens, payload),
    recordNotificationsBatch(userIds, payload),
  ]);

  return { targeted: donors.length, delivered: delivered ?? 0 };
}
