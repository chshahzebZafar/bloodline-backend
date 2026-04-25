import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { validateBody } from '../middleware/validate';
import { requireAuth } from '../middleware/auth';
import { authLimiter } from '../middleware/rateLimit';
import {
  loginSchema,
  otpSendSchema,
  otpVerifySchema,
  refreshSchema,
  registerSchema,
  resetPasswordSchema,
} from './schemas';
import {
  deleteAccount,
  login,
  logout,
  refresh,
  register,
  resetPassword,
  sendOtp,
  verifyOtp,
} from '../controllers/auth.controller';

const router = Router();

// Tight rate limits on credential endpoints to slow brute-force attacks.
router.post('/register', authLimiter, validateBody(registerSchema), asyncHandler(register));
router.post('/login', authLimiter, validateBody(loginSchema), asyncHandler(login));
router.post('/refresh', validateBody(refreshSchema), asyncHandler(refresh));
router.post('/otp/send', authLimiter, validateBody(otpSendSchema), asyncHandler(sendOtp));
router.post('/otp/verify', authLimiter, validateBody(otpVerifySchema), asyncHandler(verifyOtp));
router.post('/reset-password', authLimiter, validateBody(resetPasswordSchema), asyncHandler(resetPassword));
router.post('/logout', asyncHandler(logout));
router.delete('/me', requireAuth, asyncHandler(deleteAccount));

export default router;
