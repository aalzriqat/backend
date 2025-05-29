import { Router } from 'express';
import { getDashboardStats, getDetailedStats } from '../controllers/dashboardController';
import { authenticate } from '../middleware/auth';

const router = Router();

// All dashboard routes require authentication
router.use(authenticate);

// GET /api/dashboard/stats - Get basic dashboard statistics
router.get('/stats', getDashboardStats);

// GET /api/dashboard/detailed - Get detailed statistics (for admin/manager views)
router.get('/detailed', getDetailedStats);

export default router;
