import app from './app';
import connectDB from './config/database';
import { config } from './config';
import { logger } from './utils/logger';
import { SchedulerService } from './services/schedulerService';
import { performanceMonitor } from './services/performanceMonitoringService';

const startServer = async () => {
  let schedulerService: SchedulerService | null = null;

  try {
    // Connect to MongoDB
    try {
      await connectDB();
      logger.info('MongoDB connected successfully');
    } catch (dbError) {
      logger.warn('MongoDB connection failed, continuing without database:', dbError);
    }

    // Initialize and start the scheduler
    try {
      schedulerService = new SchedulerService();
      schedulerService.start();
      logger.info('🚀 Automated matching scheduler started');
    } catch (schedulerError) {
      logger.error('❌ Failed to start scheduler:', schedulerError);
      // Continue without scheduler - manual operations will still work
    }

    // Initialize performance monitoring
    try {
      performanceMonitor.startMonitoring(5); // 5-minute intervals
      logger.info('📊 Performance monitoring started');
    } catch (monitoringError) {
      logger.error('❌ Failed to start performance monitoring:', monitoringError);
      // Continue without monitoring - system will still work
    }

    // Start the server
    const server = app.listen(config.port, () => {
      logger.info(`Server running on port ${config.port} in ${config.nodeEnv} mode`);
      logger.info(`Frontend URL: ${config.frontendUrl}`);
      logger.info(`API Health Check: http://localhost:${config.port}/api/health`);
      logger.info('📅 Multi-hop Swaps: ACTIVE (Manual operations)');

      if (schedulerService) {
        logger.info('🤖 Automated matching: ENABLED');
        logger.info('📋 Job Queue: In-Memory (Development mode)');
      } else {
        logger.warn('⚠️ Automated matching: DISABLED (Failed to start)');
      }

      logger.info('📊 Performance monitoring: ACTIVE (5-minute intervals)');
      logger.info('📧 Email notifications: ENABLED');
      logger.info('📈 Advanced analytics: AVAILABLE');
    });

    // Graceful shutdown
    const gracefulShutdown = async (signal: string) => {
      logger.info(`Received ${signal}. Starting graceful shutdown...`);

      // Stop the scheduler first
      if (schedulerService) {
        try {
          schedulerService.stop();
          logger.info('📅 Scheduler shutdown complete');
        } catch (error) {
          logger.error('❌ Error shutting down scheduler:', error);
        }
      }

      // Close HTTP server
      server.close(() => {
        logger.info('HTTP server closed');
        process.exit(0);
      });

      // Force close after 10 seconds
      setTimeout(() => {
        logger.error('Could not close connections in time, forcefully shutting down');
        process.exit(1);
      }, 10000);
    };

    // Listen for termination signals
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Start the server
startServer();
