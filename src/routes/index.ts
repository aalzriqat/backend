import { Router } from 'express';
import authRoutes from './auth';
import userRoutes from './users';
// import scheduleRoutes from './schedules';
import shiftRoutes from './shifts';
// import swapRoutes from './swaps';
import swapIntentRoutes from './swapIntents';
import swapChainRoutes from './swapChains';
import analyticsRoutes from './analytics';
import realScheduleRoutes from './realSchedules';
import dashboardRoutes from './dashboard';
import schedulerRoutes from './schedulerRoutes';
import notificationRoutes from './notifications';
import performanceRoutes from './performance';

console.log('Loading real schedule routes...');

const router = Router();

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'SmartSwap API is running',
    timestamp: new Date().toISOString()
  });
});

// Test real schedules endpoint
router.get('/test-real-schedules', (req, res) => {
  res.json({
    message: 'Real schedules test endpoint working!',
    timestamp: new Date().toISOString()
  });
});

// API routes
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
// router.use('/schedules', scheduleRoutes);
router.use('/shifts', shiftRoutes);
// router.use('/swaps', swapRoutes);
router.use('/swap-intents', swapIntentRoutes);
router.use('/swap-chains', swapChainRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/real-schedules', realScheduleRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/scheduler', schedulerRoutes);
router.use('/notifications', notificationRoutes);
router.use('/performance', performanceRoutes);

export default router;
