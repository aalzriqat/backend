import { Request, Response } from 'express';
import { logger } from '../utils/logger';
import { SchedulerService } from '../services/schedulerService';
import { JobQueueService } from '../services/jobQueueService';
import { SimpleJobQueueService } from '../services/simpleJobQueueService';
import { AutomatedMatchingService } from '../services/automatedMatchingService';

export class SchedulerController {
  private schedulerService: SchedulerService;
  private jobQueueService: JobQueueService | SimpleJobQueueService;
  private automatedMatchingService: AutomatedMatchingService;

  constructor() {
    this.schedulerService = new SchedulerService();

    // Use the same logic as SchedulerService for queue selection
    const useRedis = process.env.REDIS_HOST !== undefined && process.env.REDIS_HOST !== '';

    if (useRedis) {
      try {
        this.jobQueueService = new JobQueueService();
      } catch (error) {
        logger.warn('⚠️ Redis not available for controller, using simple queue:', error);
        this.jobQueueService = new SimpleJobQueueService();
      }
    } else {
      this.jobQueueService = new SimpleJobQueueService();
    }

    this.automatedMatchingService = new AutomatedMatchingService();
  }

  /**
   * Get scheduler status and statistics
   */
  getStatus = async (req: Request, res: Response): Promise<void> => {
    try {
      const [schedulerStatus, queueStats, matchingStats] = await Promise.all([
        this.schedulerService.getStatus(),
        this.jobQueueService.getQueueStats(),
        this.automatedMatchingService.getMatchingStats()
      ]);

      res.json({
        success: true,
        data: {
          scheduler: schedulerStatus,
          queues: queueStats,
          matching: matchingStats,
          timestamp: new Date().toISOString()
        }
      });

    } catch (error) {
      logger.error('Error getting scheduler status:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get scheduler status',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  };

  /**
   * Start the scheduler
   */
  start = async (req: Request, res: Response): Promise<void> => {
    try {
      this.schedulerService.start();

      res.json({
        success: true,
        message: 'Scheduler started successfully',
        data: this.schedulerService.getStatus()
      });

    } catch (error) {
      logger.error('Error starting scheduler:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to start scheduler',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  };

  /**
   * Stop the scheduler
   */
  stop = async (req: Request, res: Response): Promise<void> => {
    try {
      this.schedulerService.stop();

      res.json({
        success: true,
        message: 'Scheduler stopped successfully',
        data: this.schedulerService.getStatus()
      });

    } catch (error) {
      logger.error('Error stopping scheduler:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to stop scheduler',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  };

  /**
   * Update scheduler configuration
   */
  updateConfig = async (req: Request, res: Response): Promise<void> => {
    try {
      const { enabled, timezone, schedules } = req.body;

      const configUpdate: any = {};
      if (typeof enabled === 'boolean') configUpdate.enabled = enabled;
      if (typeof timezone === 'string') configUpdate.timezone = timezone;
      if (schedules && typeof schedules === 'object') configUpdate.schedules = schedules;

      this.schedulerService.updateConfig(configUpdate);

      res.json({
        success: true,
        message: 'Scheduler configuration updated successfully',
        data: this.schedulerService.getStatus()
      });

    } catch (error) {
      logger.error('Error updating scheduler config:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update scheduler configuration',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  };

  /**
   * Manually trigger a specific task
   */
  triggerTask = async (req: Request, res: Response): Promise<void> => {
    try {
      const { taskName } = req.params;

      if (!taskName) {
        res.status(400).json({
          success: false,
          message: 'Task name is required'
        });
        return;
      }

      await this.schedulerService.triggerTask(taskName);

      res.json({
        success: true,
        message: `Task '${taskName}' triggered successfully`,
        data: {
          taskName,
          triggeredAt: new Date().toISOString()
        }
      });

    } catch (error) {
      logger.error(`Error triggering task ${req.params.taskName}:`, error);
      res.status(500).json({
        success: false,
        message: `Failed to trigger task '${req.params.taskName}'`,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  };

  /**
   * Get next execution times for all tasks
   */
  getNextExecutions = async (req: Request, res: Response): Promise<void> => {
    try {
      const nextExecutions = this.schedulerService.getNextExecutions();

      res.json({
        success: true,
        data: {
          nextExecutions,
          timestamp: new Date().toISOString()
        }
      });

    } catch (error) {
      logger.error('Error getting next executions:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get next execution times',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  };

  /**
   * Run automated matching for all active intents (manual trigger)
   */
  runFullMatching = async (req: Request, res: Response): Promise<void> => {
    try {
      logger.info('Manual full matching triggered by admin');

      const result = await this.automatedMatchingService.processAllActiveIntents();

      res.json({
        success: true,
        message: 'Full matching completed successfully',
        data: result
      });

    } catch (error) {
      logger.error('Error running full matching:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to run full matching',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  };

  /**
   * Run priority matching (manual trigger)
   */
  runPriorityMatching = async (req: Request, res: Response): Promise<void> => {
    try {
      logger.info('Manual priority matching triggered by admin');

      const result = await this.automatedMatchingService.processPriorityIntents();

      res.json({
        success: true,
        message: 'Priority matching completed successfully',
        data: result
      });

    } catch (error) {
      logger.error('Error running priority matching:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to run priority matching',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  };

  /**
   * Clean up expired data (manual trigger)
   */
  runCleanup = async (req: Request, res: Response): Promise<void> => {
    try {
      logger.info('Manual cleanup triggered by admin');

      const result = await this.automatedMatchingService.cleanupExpiredData();

      res.json({
        success: true,
        message: 'Cleanup completed successfully',
        data: result
      });

    } catch (error) {
      logger.error('Error running cleanup:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to run cleanup',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  };

  /**
   * Get job queue statistics
   */
  getQueueStats = async (req: Request, res: Response): Promise<void> => {
    try {
      const queueStats = await this.jobQueueService.getQueueStats();

      res.json({
        success: true,
        data: {
          queues: queueStats,
          timestamp: new Date().toISOString()
        }
      });

    } catch (error) {
      logger.error('Error getting queue stats:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get queue statistics',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  };

  /**
   * Clean up job queues
   */
  cleanupQueues = async (req: Request, res: Response): Promise<void> => {
    try {
      await this.jobQueueService.cleanupJobs();

      res.json({
        success: true,
        message: 'Job queues cleaned up successfully',
        data: {
          cleanedAt: new Date().toISOString()
        }
      });

    } catch (error) {
      logger.error('Error cleaning up queues:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to clean up job queues',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  };

  /**
   * Get automated matching statistics
   */
  getMatchingStats = async (req: Request, res: Response): Promise<void> => {
    try {
      const matchingStats = await this.automatedMatchingService.getMatchingStats();

      res.json({
        success: true,
        data: {
          matching: matchingStats,
          timestamp: new Date().toISOString()
        }
      });

    } catch (error) {
      logger.error('Error getting matching stats:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get matching statistics',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  };
}
