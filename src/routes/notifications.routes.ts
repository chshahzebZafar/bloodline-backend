import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { requireAuth } from '../middleware/auth';
import { validateBody, validateQuery } from '../middleware/validate';
import { notificationsQuerySchema, updateNotifPrefsSchema } from './schemas';
import {
  getPrefs,
  listNotifications,
  markAllRead,
  updatePrefs,
} from '../controllers/notifications.controller';

const router = Router();

router.get('/', requireAuth, validateQuery(notificationsQuerySchema), asyncHandler(listNotifications));
router.put('/read-all', requireAuth, asyncHandler(markAllRead));
router.get('/prefs', requireAuth, asyncHandler(getPrefs));
router.put('/prefs', requireAuth, validateBody(updateNotifPrefsSchema), asyncHandler(updatePrefs));

export default router;
