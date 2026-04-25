import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { requireAuth } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import {
  eligibilitySchema,
  fcmTokenSchema,
  updateAvailabilitySchema,
  updateLocationSchema,
  updateMeSchema,
} from './schemas';
import {
  checkEligibility,
  downloadPassport,
  getMe,
  getPublicProfile,
  updateAvailability,
  updateFcmToken,
  updateLocation,
  updateMe,
} from '../controllers/users.controller';

const router = Router();

router.get('/me', requireAuth, asyncHandler(getMe));
router.put('/me', requireAuth, validateBody(updateMeSchema), asyncHandler(updateMe));
router.put('/me/location', requireAuth, validateBody(updateLocationSchema), asyncHandler(updateLocation));
router.put('/me/availability', requireAuth, validateBody(updateAvailabilitySchema), asyncHandler(updateAvailability));
router.put('/me/fcm-token', requireAuth, validateBody(fcmTokenSchema), asyncHandler(updateFcmToken));
router.post('/me/eligibility', requireAuth, validateBody(eligibilitySchema), asyncHandler(checkEligibility));
router.get('/me/passport', requireAuth, asyncHandler(downloadPassport));
router.get('/:id', requireAuth, asyncHandler(getPublicProfile));

export default router;
