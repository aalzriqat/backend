import { Router } from 'express';
import { getShifts, createShift, updateShift, deleteShift } from '../controllers/shiftController';
import { authenticate, authorize } from '../middleware/auth';
import { validate, schemas } from '../middleware/validation';

const router = Router();

// All shift routes require authentication
router.use(authenticate);

// GET /api/shifts
router.get('/', getShifts);

// POST /api/shifts - Managers and above can create shifts
router.post('/', authorize('Manager', 'WorkFlowManagement', 'Developer'), validate(schemas.createShift), createShift);

// PUT /api/shifts/:id - Managers and above can update shifts
router.put('/:id', authorize('Manager', 'WorkFlowManagement', 'Developer'), updateShift);

// DELETE /api/shifts/:id - Managers and above can delete shifts
router.delete('/:id', authorize('Manager', 'WorkFlowManagement', 'Developer'), deleteShift);

export default router;
