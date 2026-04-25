import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { requireAuth } from '../middleware/auth';
import { writeLimiter } from '../middleware/rateLimit';
import { validateBody } from '../middleware/validate';
import { sendMessageSchema } from './schemas';
import {
  getChat,
  listChats,
  listMessages,
  markRead,
  sendMessage,
} from '../controllers/chat.controller';

const router = Router();

router.get('/', requireAuth, asyncHandler(listChats));
router.get('/:requestId', requireAuth, asyncHandler(getChat));
router.get('/:requestId/messages', requireAuth, asyncHandler(listMessages));
router.post('/:requestId/messages', requireAuth, writeLimiter, validateBody(sendMessageSchema), asyncHandler(sendMessage));
router.put('/:requestId/read', requireAuth, asyncHandler(markRead));

export default router;
