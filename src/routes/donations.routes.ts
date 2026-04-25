import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { requireAuth } from '../middleware/auth';
import { writeLimiter } from '../middleware/rateLimit';
import { validateBody } from '../middleware/validate';
import { logDonationSchema } from './schemas';
import {
  deleteDonation,
  getDonationStats,
  getMyDonations,
  logDonation,
} from '../controllers/donations.controller';

const router = Router();

router.post('/', requireAuth, writeLimiter, validateBody(logDonationSchema), asyncHandler(logDonation));
router.get('/mine', requireAuth, asyncHandler(getMyDonations));
router.get('/stats', requireAuth, asyncHandler(getDonationStats));
router.delete('/:id', requireAuth, asyncHandler(deleteDonation));

export default router;
