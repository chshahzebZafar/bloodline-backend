import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { requireAuth } from '../middleware/auth';
import { validateBody, validateQuery } from '../middleware/validate';
import { hospitalsQuerySchema, updateStockSchema } from './schemas';
import { getHospital, listHospitals, updateStock } from '../controllers/hospitals.controller';

const router = Router();

router.get('/', requireAuth, validateQuery(hospitalsQuerySchema), asyncHandler(listHospitals));
router.get('/:id', requireAuth, asyncHandler(getHospital));
router.put('/:id/stock', requireAuth, validateBody(updateStockSchema), asyncHandler(updateStock));

export default router;
