import { Router } from 'express';
import { getUserSchedule } from '../controllers/shiftController';
import { authenticate } from '../middleware/auth';

const router = Router();

// All schedule routes require authentication
router.use(authenticate);

// GET /api/schedules/user/:userId
router.get('/user/:userId', getUserSchedule);

export default router;
