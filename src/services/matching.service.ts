import { BloodType, getCompatibleDonorTypes, getRecipientTypesForDonor } from '../utils/bloodCompat';

export function compatibleDonorsFor(recipient: BloodType): BloodType[] {
  return getCompatibleDonorTypes(recipient);
}

export function canDonateTo(donor: BloodType): BloodType[] {
  return getRecipientTypesForDonor(donor);
}

export function canDonorServeRequest(donorType: BloodType, requestType: BloodType): boolean {
  return canDonateTo(donorType).includes(requestType);
}
