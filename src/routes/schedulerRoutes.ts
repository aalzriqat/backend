import { Router } from 'express';
import { SchedulerController } from '../controllers/schedulerController';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();
const schedulerController = new SchedulerController();

// Apply authentication to all routes
router.use(authenticate);

// Apply authorization - only WorkFlowManagement, Developer, and Manager roles can access scheduler
router.use(authorize('WorkFlowManagement', 'Developer', 'Manager'));

/**
 * @route   GET /api/scheduler/status
 * @desc    Get scheduler status and statistics
 * @access  Private (WorkFlowManagement, Developer, Manager)
 */
router.get('/status', schedulerController.getStatus);

/**
 * @route   POST /api/scheduler/start
 * @desc    Start the scheduler
 * @access  Private (WorkFlowManagement, Developer, Manager)
 */
router.post('/start', schedulerController.start);

/**
 * @route   POST /api/scheduler/stop
 * @desc    Stop the scheduler
 * @access  Private (WorkFlowManagement, Developer, Manager)
 */
router.post('/stop', schedulerController.stop);

/**
 * @route   PUT /api/scheduler/config
 * @desc    Update scheduler configuration
 * @access  Private (WorkFlowManagement, Developer, Manager)
 */
router.put('/config', schedulerController.updateConfig);

/**
 * @route   POST /api/scheduler/trigger/:taskName
 * @desc    Manually trigger a specific task
 * @access  Private (WorkFlowManagement, Developer, Manager)
 */
router.post('/trigger/:taskName', schedulerController.triggerTask);

/**
 * @route   GET /api/scheduler/next-executions
 * @desc    Get next execution times for all tasks
 * @access  Private (WorkFlowManagement, Developer, Manager)
 */
router.get('/next-executions', schedulerController.getNextExecutions);

/**
 * @route   POST /api/scheduler/run/full-matching
 * @desc    Run automated matching for all active intents (manual trigger)
 * @access  Private (WorkFlowManagement, Developer, Manager)
 */
router.post('/run/full-matching', schedulerController.runFullMatching);

/**
 * @route   POST /api/scheduler/run/priority-matching
 * @desc    Run priority matching (manual trigger)
 * @access  Private (WorkFlowManagement, Developer, Manager)
 */
router.post('/run/priority-matching', schedulerController.runPriorityMatching);

/**
 * @route   POST /api/scheduler/run/cleanup
 * @desc    Clean up expired data (manual trigger)
 * @access  Private (WorkFlowManagement, Developer, Manager)
 */
router.post('/run/cleanup', schedulerController.runCleanup);

/**
 * @route   GET /api/scheduler/queues/stats
 * @desc    Get job queue statistics
 * @access  Private (WorkFlowManagement, Developer, Manager)
 */
router.get('/queues/stats', schedulerController.getQueueStats);

/**
 * @route   POST /api/scheduler/queues/cleanup
 * @desc    Clean up job queues
 * @access  Private (WorkFlowManagement, Developer, Manager)
 */
router.post('/queues/cleanup', schedulerController.cleanupQueues);

/**
 * @route   GET /api/scheduler/matching/stats
 * @desc    Get automated matching statistics
 * @access  Private (WorkFlowManagement, Developer, Manager)
 */
router.get('/matching/stats', schedulerController.getMatchingStats);

export default router;
