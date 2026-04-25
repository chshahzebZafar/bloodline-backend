import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { requireWebhookSecret } from '../middleware/webhookAuth';
import {
  onMessageCreated,
  onRequestAccepted,
  onRequestCreated,
} from '../controllers/internal.controller';

/**
 * Internal endpoints driven by Supabase Database Webhooks. Auth is via
 * shared-secret header `x-webhook-secret`. NOT for public/mobile use.
 */
const router = Router();

router.use(requireWebhookSecret);

router.post('/request-created', asyncHandler(onRequestCreated));
router.post('/request-accepted', asyncHandler(onRequestAccepted));
router.post('/message-created', asyncHandler(onMessageCreated));

export default router;
