import { Router, Request, Response, NextFunction } from 'express';
import {
  getSwapRequests,
  createSwapRequest,
  respondToSwapRequest,
  cancelSwapRequest
} from '../controllers/swapController';
import { authenticate } from '../middleware/auth';
import { validate, schemas } from '../middleware/validation';

const router = Router();

// All swap routes require authentication
router.use(authenticate);

// GET /api/swaps
router.get('/', getSwapRequests);

// POST /api/swaps
router.post('/', validate(schemas.createSwapRequest), createSwapRequest);

// PUT /api/swaps/:id/accept
router.put('/:id/accept', (req: Request, res: Response, next: NextFunction) => {
  req.params.action = 'accept';
  next();
}, respondToSwapRequest);

// PUT /api/swaps/:id/reject
router.put('/:id/reject', (req: Request, res: Response, next: NextFunction) => {
  req.params.action = 'reject';
  next();
}, respondToSwapRequest);

// DELETE /api/swaps/:id
router.delete('/:id', cancelSwapRequest);

export default router;
