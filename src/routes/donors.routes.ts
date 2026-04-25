import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { requireAuth } from '../middleware/auth';
import { validateQuery } from '../middleware/validate';
import { donorsNearbyQuerySchema, leaderboardQuerySchema } from './schemas';
import {
  getDonorProfile,
  getLeaderboard,
  getNearbyDonors,
} from '../controllers/donors.controller';

const router = Router();

router.get('/nearby', requireAuth, validateQuery(donorsNearbyQuerySchema), asyncHandler(getNearbyDonors));
router.get('/leaderboard', requireAuth, validateQuery(leaderboardQuerySchema), asyncHandler(getLeaderboard));
router.get('/:id', requireAuth, asyncHandler(getDonorProfile));

export default router;
