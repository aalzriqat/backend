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

export interface SimpleJob {
  id: string;
  data: JobData;
  attempts: number;
  maxAttempts: number;
  createdAt: Date;
  status: 'waiting' | 'active' | 'completed' | 'failed';
}

/**
 * Simple in-memory job queue service for development
 * This is a fallback when Redis is not available
 */
export class SimpleJobQueueService {
  private jobs: Map<string, SimpleJob> = new Map();
  private jobCounter: number = 0;
  private automatedMatchingService: AutomatedMatchingService;
  private notificationService: NotificationService;
  private isProcessing: boolean = false;

  constructor() {
    // Initialize services
    this.automatedMatchingService = new AutomatedMatchingService();
    this.notificationService = new NotificationService();

    // Start processing jobs
    this.startProcessing();

    logger.info('🚀 Simple Job Queue Service initialized (In-Memory Mode)');
  }

  /**
   * Add a matching job to the queue
   */
  async addMatchingJob(
    type: 'MATCH_ALL_INTENTS' | 'MATCH_PRIORITY_INTENTS' | 'CLEANUP_EXPIRED',
    payload?: any
  ): Promise<SimpleJob> {
    const job: SimpleJob = {
      id: `job_${++this.jobCounter}`,
      data: { type, payload },
      attempts: 0,
      maxAttempts: 3,
      createdAt: new Date(),
      status: 'waiting'
    };

    this.jobs.set(job.id, job);
    logger.info(`📋 Added matching job ${job.id}: ${type}`);

    // Trigger processing
    this.processJobs();

    return job;
  }

  /**
   * Add a notification job to the queue
   */
  async addNotificationJob(
    userId: string,
    notificationType: string,
    payload: any
  ): Promise<SimpleJob> {
    const job: SimpleJob = {
      id: `job_${++this.jobCounter}`,
      data: {
        type: 'SEND_NOTIFICATIONS',
        userId,
        payload: { notificationType, ...payload }
      },
      attempts: 0,
      maxAttempts: 2,
      createdAt: new Date(),
      status: 'waiting'
    };

    this.jobs.set(job.id, job);
    logger.info(`📬 Added notification job ${job.id} for user ${userId}`);

    // Trigger processing
    this.processJobs();

    return job;
  }

  /**
   * Start processing jobs
   */
  private startProcessing(): void {
    // Process jobs every 5 seconds
    setInterval(() => {
      this.processJobs();
    }, 5000);
  }

  /**
   * Process waiting jobs
   */
  private async processJobs(): Promise<void> {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;

    try {
      const waitingJobs = Array.from(this.jobs.values())
        .filter(job => job.status === 'waiting')
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

      for (const job of waitingJobs.slice(0, 3)) { // Process max 3 jobs at once
        await this.processJob(job);
      }
    } catch (error) {
      logger.error('Error processing jobs:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Process a single job
   */
  private async processJob(job: SimpleJob): Promise<void> {
    job.status = 'active';
    job.attempts++;

    try {
      let result: JobResult;

      switch (job.data.type) {
        case 'MATCH_ALL_INTENTS':
          result = await this.processMatchAllIntents(job);
          break;
        case 'MATCH_PRIORITY_INTENTS':
          result = await this.processMatchPriorityIntents(job);
          break;
        case 'CLEANUP_EXPIRED':
          result = await this.processCleanupExpired(job);
          break;
        case 'SEND_NOTIFICATIONS':
          result = await this.processSendNotifications(job);
          break;
        default:
          throw new Error(`Unknown job type: ${job.data.type}`);
      }

      if (result.success) {
        job.status = 'completed';
        logger.info(`✅ Job ${job.id} completed:`, {
          type: job.data.type,
          processingTime: result.processingTime,
          success: result.success
        });
      } else {
        throw new Error(result.error || 'Job failed');
      }

    } catch (error) {
      logger.error(`❌ Job ${job.id} failed (attempt ${job.attempts}/${job.maxAttempts}):`, error);

      if (job.attempts >= job.maxAttempts) {
        job.status = 'failed';
      } else {
        job.status = 'waiting'; // Retry
      }
    }
  }

  /**
   * Process match all intents job
   */
  private async processMatchAllIntents(job: SimpleJob): Promise<JobResult> {
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
  private async processMatchPriorityIntents(job: SimpleJob): Promise<JobResult> {
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
  private async processCleanupExpired(job: SimpleJob): Promise<JobResult> {
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
  private async processSendNotifications(job: SimpleJob): Promise<JobResult> {
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
    const jobs = Array.from(this.jobs.values());
    
    const matchingJobs = jobs.filter(job => 
      ['MATCH_ALL_INTENTS', 'MATCH_PRIORITY_INTENTS', 'CLEANUP_EXPIRED'].includes(job.data.type)
    );
    
    const notificationJobs = jobs.filter(job => job.data.type === 'SEND_NOTIFICATIONS');

    return {
      matching: {
        waiting: matchingJobs.filter(job => job.status === 'waiting').length,
        active: matchingJobs.filter(job => job.status === 'active').length,
        completed: matchingJobs.filter(job => job.status === 'completed').length,
        failed: matchingJobs.filter(job => job.status === 'failed').length
      },
      notifications: {
        waiting: notificationJobs.filter(job => job.status === 'waiting').length,
        active: notificationJobs.filter(job => job.status === 'active').length,
        completed: notificationJobs.filter(job => job.status === 'completed').length,
        failed: notificationJobs.filter(job => job.status === 'failed').length
      }
    };
  }

  /**
   * Clean up completed and failed jobs
   */
  async cleanupJobs(): Promise<void> {
    const now = Date.now();
    const oneDayAgo = now - (24 * 60 * 60 * 1000);
    const oneWeekAgo = now - (7 * 24 * 60 * 60 * 1000);

    for (const [id, job] of this.jobs.entries()) {
      const jobTime = job.createdAt.getTime();
      
      if (job.status === 'completed' && jobTime < oneDayAgo) {
        this.jobs.delete(id);
      } else if (job.status === 'failed' && jobTime < oneWeekAgo) {
        this.jobs.delete(id);
      }
    }

    logger.info('🧹 Job cleanup completed');
  }

  /**
   * Gracefully close service
   */
  async close(): Promise<void> {
    // Stop processing and clear jobs
    this.jobs.clear();
    logger.info('🔒 Simple job queue service closed');
  }
}
