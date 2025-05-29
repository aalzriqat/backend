import express from 'express';
import { 
  getCurrentMetrics,
  getSystemHealth,
  getPerformanceTrends,
  getRecentAlerts,
  clearAlerts,
  getPerformanceSummary,
  startMonitoring,
  getPerformanceDashboard
} from '../controllers/performanceController';
import { authenticate, authorize } from '../middleware/auth';

const router = express.Router();

/**
 * @route GET /api/performance/metrics
 * @desc Get current performance metrics
 * @access WorkFlowManagement, Developer
 */
router.get('/metrics', getCurrentMetrics);

/**
 * @route GET /api/performance/health
 * @desc Get system health status
 * @access WorkFlowManagement, Developer
 */
router.get('/health', getSystemHealth);

/**
 * @route GET /api/performance/trends
 * @desc Get performance trends
 * @access WorkFlowManagement, Developer
 * @query hours - Number of hours to look back (default: 24)
 */
router.get('/trends', getPerformanceTrends);

/**
 * @route GET /api/performance/alerts
 * @desc Get recent performance alerts
 * @access WorkFlowManagement, Developer
 * @query limit - Number of alerts to return (default: 10)
 */
router.get('/alerts', getRecentAlerts);

/**
 * @route DELETE /api/performance/alerts
 * @desc Clear performance alerts
 * @access WorkFlowManagement, Developer
 */
router.delete('/alerts', clearAlerts);

/**
 * @route GET /api/performance/summary
 * @desc Get comprehensive performance summary
 * @access WorkFlowManagement, Developer
 */
router.get('/summary', getPerformanceSummary);

/**
 * @route POST /api/performance/start
 * @desc Start performance monitoring
 * @access WorkFlowManagement, Developer
 * @body { interval: number } - Monitoring interval in minutes (default: 5)
 */
router.post('/start', startMonitoring);

/**
 * @route GET /api/performance/dashboard
 * @desc Get performance dashboard data
 * @access WorkFlowManagement, Developer
 */
router.get('/dashboard', getPerformanceDashboard);

export default router;
