import cron from 'node-cron';
import { logger } from '../utils/logger';
import { JobQueueService } from './jobQueueService';
import { SimpleJobQueueService } from './simpleJobQueueService';
import { AutomatedMatchingService } from './automatedMatchingService';

export interface SchedulerConfig {
  enabled: boolean;
  timezone: string;
  schedules: {
    fullMatching: string;
    priorityMatching: string;
    cleanup: string;
    notifications: string;
    healthCheck: string;
  };
}

export class SchedulerService {
  private jobQueueService: JobQueueService | SimpleJobQueueService;
  private automatedMatchingService: AutomatedMatchingService;
  private config: SchedulerConfig;
  private scheduledTasks: Map<string, cron.ScheduledTask> = new Map();
  private isRunning: boolean = false;
  private useRedis: boolean = false;

  constructor() {
    // Try to use Redis-based queue, fallback to simple queue
    this.useRedis = process.env.REDIS_HOST !== undefined && process.env.REDIS_HOST !== '';

    if (this.useRedis) {
      try {
        this.jobQueueService = new JobQueueService();
        logger.info('📋 Using Redis-based job queue');
      } catch (error) {
        logger.warn('⚠️ Redis not available, falling back to simple queue:', error);
        this.jobQueueService = new SimpleJobQueueService();
        this.useRedis = false;
      }
    } else {
      this.jobQueueService = new SimpleJobQueueService();
      logger.info('📋 Using simple in-memory job queue');
    }

    this.automatedMatchingService = new AutomatedMatchingService();

    // Default configuration
    this.config = {
      enabled: process.env.SCHEDULER_ENABLED !== 'false',
      timezone: process.env.SCHEDULER_TIMEZONE || 'America/New_York',
      schedules: {
        // Every 2 hours during business hours (8 AM - 8 PM)
        fullMatching: '0 8-20/2 * * *',
        // Every 30 minutes for priority intents
        priorityMatching: '*/30 * * * *',
        // Daily cleanup at 2 AM
        cleanup: '0 2 * * *',
        // Notification processing every 15 minutes
        notifications: '*/15 * * * *',
        // Health check every 5 minutes
        healthCheck: '*/5 * * * *'
      }
    };

    logger.info('📅 Scheduler Service initialized', {
      enabled: this.config.enabled,
      timezone: this.config.timezone,
      queueType: this.useRedis ? 'Redis' : 'In-Memory'
    });
  }

  /**
   * Start all scheduled tasks
   */
  start(): void {
    if (!this.config.enabled) {
      logger.info('📅 Scheduler is disabled');
      return;
    }

    if (this.isRunning) {
      logger.warn('⚠️ Scheduler is already running');
      return;
    }

    this.setupScheduledTasks();
    this.isRunning = true;

    logger.info('🚀 Scheduler started with tasks:', {
      tasks: Array.from(this.scheduledTasks.keys()),
      timezone: this.config.timezone
    });
  }

  /**
   * Stop all scheduled tasks
   */
  stop(): void {
    if (!this.isRunning) {
      logger.info('📅 Scheduler is not running');
      return;
    }

    this.scheduledTasks.forEach((task, name) => {
      task.stop();
      logger.info(`🛑 Stopped scheduled task: ${name}`);
    });

    this.scheduledTasks.clear();
    this.isRunning = false;

    logger.info('🔒 Scheduler stopped');
  }

  /**
   * Setup all scheduled tasks
   */
  private setupScheduledTasks(): void {
    // Full matching task - comprehensive matching for all active intents
    const fullMatchingTask = cron.schedule(
      this.config.schedules.fullMatching,
      async () => {
        try {
          logger.info('🔄 Starting scheduled full matching task');
          await this.jobQueueService.addMatchingJob('MATCH_ALL_INTENTS', {
            source: 'scheduled',
            timestamp: new Date().toISOString()
          });
        } catch (error) {
          logger.error('❌ Error in full matching task:', error);
        }
      },
      {
        scheduled: false,
        timezone: this.config.timezone
      }
    );

    // Priority matching task - frequent matching for high-priority and expiring intents
    const priorityMatchingTask = cron.schedule(
      this.config.schedules.priorityMatching,
      async () => {
        try {
          logger.info('⚡ Starting scheduled priority matching task');
          await this.jobQueueService.addMatchingJob('MATCH_PRIORITY_INTENTS', {
            source: 'scheduled',
            timestamp: new Date().toISOString()
          });
        } catch (error) {
          logger.error('❌ Error in priority matching task:', error);
        }
      },
      {
        scheduled: false,
        timezone: this.config.timezone
      }
    );

    // Cleanup task - remove expired data and optimize database
    const cleanupTask = cron.schedule(
      this.config.schedules.cleanup,
      async () => {
        try {
          logger.info('🧹 Starting scheduled cleanup task');
          await this.jobQueueService.addMatchingJob('CLEANUP_EXPIRED', {
            source: 'scheduled',
            timestamp: new Date().toISOString()
          });

          // Also clean up job queues
          await this.jobQueueService.cleanupJobs();
        } catch (error) {
          logger.error('❌ Error in cleanup task:', error);
        }
      },
      {
        scheduled: false,
        timezone: this.config.timezone
      }
    );

    // Health check task - monitor system health and performance
    const healthCheckTask = cron.schedule(
      this.config.schedules.healthCheck,
      async () => {
        try {
          await this.performHealthCheck();
        } catch (error) {
          logger.error('❌ Error in health check task:', error);
        }
      },
      {
        scheduled: false,
        timezone: this.config.timezone
      }
    );

    // Store tasks
    this.scheduledTasks.set('fullMatching', fullMatchingTask);
    this.scheduledTasks.set('priorityMatching', priorityMatchingTask);
    this.scheduledTasks.set('cleanup', cleanupTask);
    this.scheduledTasks.set('healthCheck', healthCheckTask);

    // Start all tasks
    this.scheduledTasks.forEach((task, name) => {
      task.start();
      logger.info(`✅ Started scheduled task: ${name}`);
    });
  }

  /**
   * Perform system health check
   */
  private async performHealthCheck(): Promise<void> {
    try {
      const [queueStats, matchingStats] = await Promise.all([
        this.jobQueueService.getQueueStats(),
        this.automatedMatchingService.getMatchingStats()
      ]);

      const healthData = {
        timestamp: new Date().toISOString(),
        queues: queueStats,
        matching: matchingStats,
        scheduler: {
          isRunning: this.isRunning,
          activeTasks: this.scheduledTasks.size,
          uptime: process.uptime()
        }
      };

      // Log health status
      logger.info('💓 System health check:', healthData);

      // Check for potential issues
      this.checkSystemHealth(healthData);

    } catch (error) {
      logger.error('❌ Health check failed:', error);
    }
  }

  /**
   * Check system health and alert on issues
   */
  private checkSystemHealth(healthData: any): void {
    const issues: string[] = [];

    // Check queue backlogs
    if (healthData.queues.matching.waiting > 50) {
      issues.push(`High matching queue backlog: ${healthData.queues.matching.waiting} jobs`);
    }

    if (healthData.queues.notifications.waiting > 100) {
      issues.push(`High notification queue backlog: ${healthData.queues.notifications.waiting} jobs`);
    }

    // Check failed jobs
    if (healthData.queues.matching.failed > 10) {
      issues.push(`High matching job failure rate: ${healthData.queues.matching.failed} failed jobs`);
    }

    // Check active intents
    if (healthData.matching.activeIntents > 1000) {
      issues.push(`High number of active intents: ${healthData.matching.activeIntents}`);
    }

    // Log issues
    if (issues.length > 0) {
      logger.warn('⚠️ System health issues detected:', issues);

      // TODO: Send alerts to administrators
      // this.sendHealthAlerts(issues);
    }
  }

  /**
   * Update scheduler configuration
   */
  updateConfig(newConfig: Partial<SchedulerConfig>): void {
    const wasRunning = this.isRunning;

    if (wasRunning) {
      this.stop();
    }

    this.config = { ...this.config, ...newConfig };

    if (wasRunning && this.config.enabled) {
      this.start();
    }

    logger.info('🔧 Scheduler configuration updated:', this.config);
  }

  /**
   * Get scheduler status
   */
  getStatus(): {
    isRunning: boolean;
    config: SchedulerConfig;
    activeTasks: string[];
    uptime: number;
  } {
    return {
      isRunning: this.isRunning,
      config: this.config,
      activeTasks: Array.from(this.scheduledTasks.keys()),
      uptime: process.uptime()
    };
  }

  /**
   * Manually trigger a specific task
   */
  async triggerTask(taskName: string): Promise<void> {
    logger.info(`🎯 Manually triggering task: ${taskName}`);

    switch (taskName) {
      case 'fullMatching':
        await this.jobQueueService.addMatchingJob('MATCH_ALL_INTENTS', {
          source: 'manual',
          timestamp: new Date().toISOString()
        });
        break;

      case 'priorityMatching':
        await this.jobQueueService.addMatchingJob('MATCH_PRIORITY_INTENTS', {
          source: 'manual',
          timestamp: new Date().toISOString()
        });
        break;

      case 'cleanup':
        await this.jobQueueService.addMatchingJob('CLEANUP_EXPIRED', {
          source: 'manual',
          timestamp: new Date().toISOString()
        });
        break;

      case 'healthCheck':
        await this.performHealthCheck();
        break;

      default:
        throw new Error(`Unknown task: ${taskName}`);
    }

    logger.info(`✅ Task triggered: ${taskName}`);
  }

  /**
   * Get next execution times for all tasks
   */
  getNextExecutions(): Record<string, string | null> {
    const nextExecutions: Record<string, string | null> = {};

    this.scheduledTasks.forEach((task, name) => {
      try {
        // Note: node-cron doesn't provide a direct way to get next execution time
        // This is a simplified implementation
        nextExecutions[name] = 'Next execution time calculation not implemented';
      } catch (error) {
        nextExecutions[name] = null;
      }
    });

    return nextExecutions;
  }

  /**
   * Gracefully shutdown scheduler
   */
  async shutdown(): Promise<void> {
    logger.info('🔄 Shutting down scheduler...');

    this.stop();
    await this.jobQueueService.close();

    logger.info('✅ Scheduler shutdown complete');
  }
}
