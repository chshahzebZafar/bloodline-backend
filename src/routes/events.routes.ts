import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { requireAuth } from '../middleware/auth';
import { validateQuery } from '../middleware/validate';
import { eventsQuerySchema } from './schemas';
import {
  cancelRsvp,
  getEvent,
  listEvents,
  rsvp,
} from '../controllers/events.controller';

const router = Router();

router.get('/', requireAuth, validateQuery(eventsQuerySchema), asyncHandler(listEvents));
router.get('/:id', requireAuth, asyncHandler(getEvent));
router.post('/:id/rsvp', requireAuth, asyncHandler(rsvp));
router.delete('/:id/rsvp', requireAuth, asyncHandler(cancelRsvp));

export default router;
