import { logger } from '../utils/logger';
import { SwapIntent } from '../models/SwapIntent';
import { SwapChain } from '../models/SwapChain';
import { User } from '../models/User';
import { UserPreferences } from '../models/UserPreferences';
import { SmartMatchingService } from './smartMatchingService';
import { ChainDetectionService } from './chainDetectionService';
import { NotificationService } from './notificationService';
import { ISwapIntent, IUser, ISwapChain } from '../types';

export interface MatchingJobResult {
  intentId: string;
  directMatches: number;
  chainMatches: number;
  notificationsSent: number;
  processingTime: number;
  errors: string[];
}

export interface BatchMatchingResult {
  totalIntentsProcessed: number;
  totalDirectMatches: number;
  totalChainMatches: number;
  totalNotificationsSent: number;
  totalProcessingTime: number;
  successfulJobs: number;
  failedJobs: number;
  errors: string[];
}

export class AutomatedMatchingService {
  private smartMatchingService: SmartMatchingService;
  private chainDetectionService: ChainDetectionService;
  private notificationService: NotificationService;

  constructor() {
    this.smartMatchingService = new SmartMatchingService();
    this.chainDetectionService = new ChainDetectionService();
    this.notificationService = new NotificationService();
  }

  /**
   * Process automated matching for all active intents
   */
  async processAllActiveIntents(): Promise<BatchMatchingResult> {
    const startTime = Date.now();
    logger.info('🔄 Starting automated matching for all active intents');

    const result: BatchMatchingResult = {
      totalIntentsProcessed: 0,
      totalDirectMatches: 0,
      totalChainMatches: 0,
      totalNotificationsSent: 0,
      totalProcessingTime: 0,
      successfulJobs: 0,
      failedJobs: 0,
      errors: []
    };

    try {
      // Get all active intents that haven't been processed recently
      const activeIntents = await this.getIntentsForProcessing();
      logger.info(`📋 Found ${activeIntents.length} intents to process`);

      result.totalIntentsProcessed = activeIntents.length;

      // Process each intent
      for (const intent of activeIntents) {
        try {
          const jobResult = await this.processIntentMatching(intent);

          result.totalDirectMatches += jobResult.directMatches;
          result.totalChainMatches += jobResult.chainMatches;
          result.totalNotificationsSent += jobResult.notificationsSent;
          result.successfulJobs++;

          // Update intent's last processed timestamp
          await SwapIntent.findByIdAndUpdate(intent._id, {
            lastProcessedAt: new Date()
          });

        } catch (error) {
          logger.error(`❌ Error processing intent ${intent._id}:`, error);
          result.failedJobs++;
          result.errors.push(`Intent ${intent._id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      result.totalProcessingTime = Date.now() - startTime;

      logger.info(`✅ Automated matching completed:`, {
        processed: result.totalIntentsProcessed,
        directMatches: result.totalDirectMatches,
        chainMatches: result.totalChainMatches,
        notifications: result.totalNotificationsSent,
        time: `${result.totalProcessingTime}ms`,
        success: result.successfulJobs,
        failed: result.failedJobs
      });

      return result;

    } catch (error) {
      logger.error('❌ Fatal error in automated matching:', error);
      result.errors.push(`Fatal error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      result.totalProcessingTime = Date.now() - startTime;
      return result;
    }
  }

  /**
   * Process matching for a specific intent
   */
  async processIntentMatching(intent: ISwapIntent): Promise<MatchingJobResult> {
    const startTime = Date.now();
    const result: MatchingJobResult = {
      intentId: intent._id.toString(),
      directMatches: 0,
      chainMatches: 0,
      notificationsSent: 0,
      processingTime: 0,
      errors: []
    };

    try {
      logger.info(`🎯 Processing matches for intent ${intent._id}`);

      // Check if user has auto-matching enabled
      const userPrefs = await UserPreferences.findOne({ userId: intent.userId });
      if (!userPrefs?.autoMatchEnabled) {
        logger.info(`⏭️ Auto-matching disabled for user ${intent.userId}`);
        return result;
      }

      // Find direct matches
      const directMatches = await this.smartMatchingService.findMatches(intent._id.toString());
      result.directMatches = directMatches.length;

      if (directMatches.length > 0) {
        logger.info(`🎯 Found ${directMatches.length} direct matches for intent ${intent._id}`);

        // Send notifications for new direct matches
        const notificationCount = await this.notificationService.notifyNewMatches(
          intent.userId.toString(),
          directMatches
        );
        result.notificationsSent += notificationCount;
      }

      // Detect multi-hop chains
      const chains = await this.chainDetectionService.findSwapChains(
        intent._id.toString(),
        {
          maxChainLength: 5,
          minChainScore: 70,
          includePartialMatches: true,
          timeWindowDays: 30
        }
      );

      result.chainMatches = chains.length;

      if (chains.length > 0) {
        logger.info(`🔗 Found ${chains.length} chain opportunities for intent ${intent._id}`);

        // Send notifications for new chains
        const chainNotificationCount = await this.notificationService.notifyNewChains(
          intent.userId.toString(),
          chains
        );
        result.notificationsSent += chainNotificationCount;
      }

      result.processingTime = Date.now() - startTime;
      return result;

    } catch (error) {
      logger.error(`❌ Error processing intent ${intent._id}:`, error);
      result.errors.push(error instanceof Error ? error.message : 'Unknown error');
      result.processingTime = Date.now() - startTime;
      return result;
    }
  }

  /**
   * Get intents that need processing
   */
  private async getIntentsForProcessing(): Promise<ISwapIntent[]> {
    const cutoffTime = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago

    return await SwapIntent.find({
      status: 'active',
      expiresAt: { $gt: new Date() },
      $or: [
        { lastProcessedAt: { $exists: false } },
        { lastProcessedAt: { $lt: cutoffTime } }
      ]
    }).populate('userId').populate('originalShiftId');
  }

  /**
   * Clean up expired intents and chains
   */
  async cleanupExpiredData(): Promise<{ expiredIntents: number; expiredChains: number }> {
    logger.info('🧹 Starting cleanup of expired data');

    try {
      // Mark expired intents as expired
      const expiredIntentsResult = await SwapIntent.updateMany(
        {
          status: 'active',
          expiresAt: { $lt: new Date() }
        },
        {
          status: 'expired',
          updatedAt: new Date()
        }
      );

      // Mark expired chains as expired
      const expiredChainsResult = await SwapChain.updateMany(
        {
          status: { $in: ['pending', 'approved'] },
          expiresAt: { $lt: new Date() }
        },
        {
          status: 'expired',
          updatedAt: new Date()
        }
      );

      logger.info(`🧹 Cleanup completed: ${expiredIntentsResult.modifiedCount} intents, ${expiredChainsResult.modifiedCount} chains expired`);

      return {
        expiredIntents: expiredIntentsResult.modifiedCount,
        expiredChains: expiredChainsResult.modifiedCount
      };

    } catch (error) {
      logger.error('❌ Error during cleanup:', error);
      return { expiredIntents: 0, expiredChains: 0 };
    }
  }

  /**
   * Process priority intents (high priority or expiring soon)
   */
  async processPriorityIntents(): Promise<BatchMatchingResult> {
    logger.info('⚡ Processing priority intents');

    const priorityIntents = await SwapIntent.find({
      status: 'active',
      expiresAt: { $gt: new Date() },
      $or: [
        { priority: { $gte: 4 } }, // High priority
        { expiresAt: { $lt: new Date(Date.now() + 24 * 60 * 60 * 1000) } } // Expires within 24 hours
      ]
    }).populate('userId').populate('originalShiftId');

    logger.info(`⚡ Found ${priorityIntents.length} priority intents`);

    const result: BatchMatchingResult = {
      totalIntentsProcessed: priorityIntents.length,
      totalDirectMatches: 0,
      totalChainMatches: 0,
      totalNotificationsSent: 0,
      totalProcessingTime: 0,
      successfulJobs: 0,
      failedJobs: 0,
      errors: []
    };

    const startTime = Date.now();

    for (const intent of priorityIntents) {
      try {
        const jobResult = await this.processIntentMatching(intent);

        result.totalDirectMatches += jobResult.directMatches;
        result.totalChainMatches += jobResult.chainMatches;
        result.totalNotificationsSent += jobResult.notificationsSent;
        result.successfulJobs++;

      } catch (error) {
        logger.error(`❌ Error processing priority intent ${intent._id}:`, error);
        result.failedJobs++;
        result.errors.push(`Intent ${intent._id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    result.totalProcessingTime = Date.now() - startTime;
    return result;
  }

  /**
   * Get matching statistics
   */
  async getMatchingStats(): Promise<{
    activeIntents: number;
    pendingChains: number;
    recentMatches: number;
    avgProcessingTime: number;
  }> {
    const [activeIntents, pendingChains, recentMatches] = await Promise.all([
      SwapIntent.countDocuments({ status: 'active', expiresAt: { $gt: new Date() } }),
      SwapChain.countDocuments({ status: 'pending', expiresAt: { $gt: new Date() } }),
      SwapIntent.countDocuments({
        lastProcessedAt: { $gt: new Date(Date.now() - 24 * 60 * 60 * 1000) }
      })
    ]);

    return {
      activeIntents,
      pendingChains,
      recentMatches,
      avgProcessingTime: 0 // TODO: Calculate from historical data
    };
  }
}
