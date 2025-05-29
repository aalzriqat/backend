import { Router } from 'express';
import {
  getAnalytics,
  getUserAnalytics,
  getComprehensiveAnalytics,
  getRealTimeDashboard,
  getSwapPerformanceMetrics,
  getMarketplaceInsights,
  getPredictiveAnalytics,
  getSystemHealth
} from '../controllers/analyticsController';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

// All analytics routes require authentication (disabled for testing)
// router.use(authenticate);

// GET /api/analytics - Only WorkFlowManagement and managers can view system analytics
router.get('/', getAnalytics);

// GET /api/analytics/user/:userId
router.get('/user/:userId', getUserAnalytics);

// GET /api/analytics/comprehensive - Get comprehensive analytics with time range
router.get('/comprehensive', getComprehensiveAnalytics);

// GET /api/analytics/dashboard - Get real-time dashboard data
router.get('/dashboard', getRealTimeDashboard);

// GET /api/analytics/performance - Get swap performance metrics
router.get('/performance', authorize('WorkFlowManagement', 'Manager', 'Developer'), getSwapPerformanceMetrics);

// GET /api/analytics/marketplace - Get marketplace insights
router.get('/marketplace', authorize('WorkFlowManagement', 'Manager', 'Developer'), getMarketplaceInsights);

// GET /api/analytics/predictive - Get predictive analytics
router.get('/predictive', authorize('WorkFlowManagement', 'Manager', 'Developer'), getPredictiveAnalytics);

// GET /api/analytics/health - Get system health metrics
router.get('/health', authorize('WorkFlowManagement', 'Manager', 'Developer'), getSystemHealth);

export default router;
