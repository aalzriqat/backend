import Bull, { Queue, Job } from 'bull';
import { logger } from '../utils/logger';
import { AutomatedMatchingService } from './automatedMatchingService';
import { NotificationService } from './notificationService';

export interface JobData {
  type: 'MATCH_ALL_INTENTS' | 'MATCH_PRIORITY_INTENTS' | 'CLEANUP_EXPIRED' | 'SEND_NOTIFICATIONS';
  payload?: any;
  userId?: string;
  intentId?: string;
}

export interface JobResult {
  success: boolean;
  data?: any;
  error?: string;
  processingTime: number;
}

export class JobQueueService {
  private matchingQueue: Queue;
  private notificationQueue: Queue;
  private automatedMatchingService: AutomatedMatchingService;
  private notificationService: NotificationService;

  constructor() {
    // Initialize Redis connection for Bull queues
    const redisConfig = {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB || '0'),
      maxRetriesPerRequest: 3,
      retryDelayOnFailover: 100,
      lazyConnect: true
    };

    // Create queues
    this.matchingQueue = new Bull('matching-jobs', { redis: redisConfig });
    this.notificationQueue = new Bull('notification-jobs', { redis: redisConfig });

    // Initialize services
    this.automatedMatchingService = new AutomatedMatchingService();
    this.notificationService = new NotificationService();

    // Setup job processors
    this.setupJobProcessors();
    this.setupEventListeners();

    logger.info('🚀 Job Queue Service initialized');
  }

  /**
   * Setup job processors for different job types
   */
  private setupJobProcessors() {
    // Matching job processor
    this.matchingQueue.process('MATCH_ALL_INTENTS', 1, async (job: Job<JobData>) => {
      return await this.processMatchAllIntents(job);
    });

    this.matchingQueue.process('MATCH_PRIORITY_INTENTS', 2, async (job: Job<JobData>) => {
      return await this.processMatchPriorityIntents(job);
    });

    this.matchingQueue.process('CLEANUP_EXPIRED', 1, async (job: Job<JobData>) => {
      return await this.processCleanupExpired(job);
    });

    // Notification job processor
    this.notificationQueue.process('SEND_NOTIFICATIONS', 5, async (job: Job<JobData>) => {
      return await this.processSendNotifications(job);
    });

    logger.info('📋 Job processors configured');
  }

  /**
   * Setup event listeners for job monitoring
   */
  private setupEventListeners() {
    // Matching queue events
    this.matchingQueue.on('completed', (job: Job, result: JobResult) => {
      logger.info(`✅ Matching job ${job.id} completed:`, {
        type: job.data.type,
        processingTime: result.processingTime,
        success: result.success
      });
    });

    this.matchingQueue.on('failed', (job: Job, err: Error) => {
      logger.error(`❌ Matching job ${job.id} failed:`, {
        type: job.data.type,
        error: err.message
      });
    });

    // Notification queue events
    this.notificationQueue.on('completed', (job: Job, result: JobResult) => {
      logger.info(`📬 Notification job ${job.id} completed:`, {
        type: job.data.type,
        success: result.success
      });
    });

    this.notificationQueue.on('failed', (job: Job, err: Error) => {
      logger.error(`❌ Notification job ${job.id} failed:`, {
        type: job.data.type,
        error: err.message
      });
    });
  }

  /**
   * Add a matching job to the queue
   */
  async addMatchingJob(
    type: 'MATCH_ALL_INTENTS' | 'MATCH_PRIORITY_INTENTS' | 'CLEANUP_EXPIRED',
    payload?: any,
    options?: Bull.JobOptions
  ): Promise<Job<JobData>> {
    const jobData: JobData = { type, payload };

    const defaultOptions: Bull.JobOptions = {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000
      },
      removeOnComplete: 10,
      removeOnFail: 5
    };

    const job = await this.matchingQueue.add(type, jobData, { ...defaultOptions, ...options });
    logger.info(`📋 Added matching job ${job.id}: ${type}`);

    return job;
  }

  /**
   * Add a notification job to the queue
   */
  async addNotificationJob(
    userId: string,
    notificationType: string,
    payload: any,
    options?: Bull.JobOptions
  ): Promise<Job<JobData>> {
    const jobData: JobData = {
      type: 'SEND_NOTIFICATIONS',
      userId,
      payload: { notificationType, ...payload }
    };

    const defaultOptions: Bull.JobOptions = {
      attempts: 2,
      backoff: {
        type: 'fixed',
        delay: 5000
      },
      removeOnComplete: 20,
      removeOnFail: 10
    };

    const job = await this.notificationQueue.add('SEND_NOTIFICATIONS', jobData, { ...defaultOptions, ...options });
    logger.info(`📬 Added notification job ${job.id} for user ${userId}`);

    return job;
  }

  /**
   * Process match all intents job
   */
  private async processMatchAllIntents(job: Job<JobData>): Promise<JobResult> {
    const startTime = Date.now();

    try {
      logger.info(`🔄 Processing match all intents job ${job.id}`);

      const result = await this.automatedMatchingService.processAllActiveIntents();

      return {
        success: true,
        data: result,
        processingTime: Date.now() - startTime
      };

    } catch (error) {
      logger.error(`❌ Match all intents job ${job.id} failed:`, error);

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime: Date.now() - startTime
      };
    }
  }

  /**
   * Process priority intents job
   */
  private async processMatchPriorityIntents(job: Job<JobData>): Promise<JobResult> {
    const startTime = Date.now();

    try {
      logger.info(`⚡ Processing priority intents job ${job.id}`);

      const result = await this.automatedMatchingService.processPriorityIntents();

      return {
        success: true,
        data: result,
        processingTime: Date.now() - startTime
      };

    } catch (error) {
      logger.error(`❌ Priority intents job ${job.id} failed:`, error);

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime: Date.now() - startTime
      };
    }
  }

  /**
   * Process cleanup expired job
   */
  private async processCleanupExpired(job: Job<JobData>): Promise<JobResult> {
    const startTime = Date.now();

    try {
      logger.info(`🧹 Processing cleanup expired job ${job.id}`);

      const result = await this.automatedMatchingService.cleanupExpiredData();

      return {
        success: true,
        data: result,
        processingTime: Date.now() - startTime
      };

    } catch (error) {
      logger.error(`❌ Cleanup expired job ${job.id} failed:`, error);

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime: Date.now() - startTime
      };
    }
  }

  /**
   * Process send notifications job
   */
  private async processSendNotifications(job: Job<JobData>): Promise<JobResult> {
    const startTime = Date.now();

    try {
      logger.info(`📬 Processing notification job ${job.id} for user ${job.data.userId}`);

      const { userId, payload } = job.data;
      if (!userId || !payload) {
        throw new Error('Missing userId or payload for notification job');
      }

      let result = 0;

      switch (payload.notificationType) {
        case 'NEW_MATCHES':
          result = await this.notificationService.notifyNewMatches(userId, payload.matches);
          break;
        case 'NEW_CHAINS':
          result = await this.notificationService.notifyNewChains(userId, payload.chains);
          break;
        case 'APPROVAL_REQUEST':
          result = await this.notificationService.notifyChainApprovalRequest(userId, payload.chain);
          break;
        case 'EXPIRING':
          result = await this.notificationService.notifyExpiring(userId, payload.type, payload.item);
          break;
        default:
          throw new Error(`Unknown notification type: ${payload.notificationType}`);
      }

      return {
        success: true,
        data: { notificationsSent: result },
        processingTime: Date.now() - startTime
      };

    } catch (error) {
      logger.error(`❌ Notification job ${job.id} failed:`, error);

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime: Date.now() - startTime
      };
    }
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(): Promise<{
    matching: { waiting: number; active: number; completed: number; failed: number };
    notifications: { waiting: number; active: number; completed: number; failed: number };
  }> {
    const [matchingStats, notificationStats] = await Promise.all([
      {
        waiting: await this.matchingQueue.getWaiting(),
        active: await this.matchingQueue.getActive(),
        completed: await this.matchingQueue.getCompleted(),
        failed: await this.matchingQueue.getFailed()
      },
      {
        waiting: await this.notificationQueue.getWaiting(),
        active: await this.notificationQueue.getActive(),
        completed: await this.notificationQueue.getCompleted(),
        failed: await this.notificationQueue.getFailed()
      }
    ]);

    return {
      matching: {
        waiting: matchingStats.waiting.length,
        active: matchingStats.active.length,
        completed: matchingStats.completed.length,
        failed: matchingStats.failed.length
      },
      notifications: {
        waiting: notificationStats.waiting.length,
        active: notificationStats.active.length,
        completed: notificationStats.completed.length,
        failed: notificationStats.failed.length
      }
    };
  }

  /**
   * Clean up completed and failed jobs
   */
  async cleanupJobs(): Promise<void> {
    await Promise.all([
      this.matchingQueue.clean(24 * 60 * 60 * 1000, 'completed'), // Keep completed jobs for 24 hours
      this.matchingQueue.clean(7 * 24 * 60 * 60 * 1000, 'failed'), // Keep failed jobs for 7 days
      this.notificationQueue.clean(24 * 60 * 60 * 1000, 'completed'),
      this.notificationQueue.clean(7 * 24 * 60 * 60 * 1000, 'failed')
    ]);

    logger.info('🧹 Job cleanup completed');
  }

  /**
   * Gracefully close queues
   */
  async close(): Promise<void> {
    await Promise.all([
      this.matchingQueue.close(),
      this.notificationQueue.close()
    ]);

    logger.info('🔒 Job queues closed');
  }
}
