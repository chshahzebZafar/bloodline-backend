import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { requireAuth } from '../middleware/auth';
import { writeLimiter } from '../middleware/rateLimit';
import { validateBody, validateQuery } from '../middleware/validate';
import {
  createRequestSchema,
  nearbyQuerySchema,
  updateRequestSchema,
} from './schemas';
import {
  acceptRequest,
  cancelRequest,
  createRequest,
  fulfillRequest,
  getMyRequests,
  getNearbyRequests,
  getRequestById,
  updateRequest,
} from '../controllers/requests.controller';

const router = Router();

router.post('/', requireAuth, writeLimiter, validateBody(createRequestSchema), asyncHandler(createRequest));
router.get('/nearby', requireAuth, validateQuery(nearbyQuerySchema), asyncHandler(getNearbyRequests));
router.get('/mine', requireAuth, asyncHandler(getMyRequests));
router.get('/:id', requireAuth, asyncHandler(getRequestById));
router.put('/:id', requireAuth, writeLimiter, validateBody(updateRequestSchema), asyncHandler(updateRequest));
router.delete('/:id', requireAuth, writeLimiter, asyncHandler(cancelRequest));
router.post('/:id/accept', requireAuth, writeLimiter, asyncHandler(acceptRequest));
router.post('/:id/fulfill', requireAuth, writeLimiter, asyncHandler(fulfillRequest));

export default router;
