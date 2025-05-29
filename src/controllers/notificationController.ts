import { Request, Response } from 'express';
import { logger } from '../utils/logger';
import { NotificationService } from '../services/notificationService';
import { testEmailSending, testNotificationTemplates, generateTestEmailCredentials } from '../utils/emailTestSetup';
import { User } from '../models/User';
import { UserPreferences } from '../models/UserPreferences';

export class NotificationController {
  private notificationService: NotificationService;

  constructor() {
    this.notificationService = new NotificationService();
  }

  /**
   * Test email system functionality
   */
  async testEmailSystem(req: Request, res: Response): Promise<void> {
    try {
      logger.info('🧪 Testing email system via API request');

      // Test basic email sending
      const emailTest = await testEmailSending();
      
      if (!emailTest.success) {
        res.status(500).json({
          success: false,
          message: 'Email system test failed',
          error: emailTest.error
        });
        return;
      }

      // Test notification templates
      const templateTest = await testNotificationTemplates();

      res.json({
        success: true,
        message: 'Email system test completed',
        data: {
          emailTest: {
            success: emailTest.success,
            messageId: emailTest.messageId,
            previewUrl: emailTest.previewUrl,
            testAccount: emailTest.credentials?.auth.user
          },
          templateTest: {
            success: templateTest.success,
            summary: templateTest.summary,
            tests: templateTest.tests
          }
        }
      });

    } catch (error) {
      logger.error('❌ Email system test failed:', error);
      res.status(500).json({
        success: false,
        message: 'Email system test failed',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Send test notification to specific user
   */
  async sendTestNotification(req: Request, res: Response): Promise<void> {
    try {
      const { userId, type = 'matches' } = req.body;

      if (!userId) {
        res.status(400).json({
          success: false,
          message: 'User ID is required'
        });
        return;
      }

      // Verify user exists
      const user = await User.findById(userId);
      if (!user) {
        res.status(404).json({
          success: false,
          message: 'User not found'
        });
        return;
      }

      // Check user preferences
      let preferences = await UserPreferences.findOne({ userId });
      if (!preferences) {
        // Create default preferences
        preferences = new UserPreferences({
          userId,
          autoMatchEnabled: true,
          preferredTimeSlots: ['any'],
          preferredMarketplaces: [],
          skillFlexibility: false,
          maxSwapsPerWeek: 2,
          notificationSettings: {
            email: true,
            push: true,
            sms: false,
            newMatches: true,
            chainOpportunities: true,
            approvalRequests: true,
            expiringAlerts: true
          },
          blacklistedUsers: []
        });
        await preferences.save();
      }

      let result = 0;
      let notificationType = '';

      switch (type) {
        case 'matches':
          // Send test match notification
          const sampleMatches = [
            {
              targetUser: { firstName: 'Test', lastName: 'User' },
              matchScore: 92,
              compatibility: 'Excellent',
              reason: 'Perfect skill alignment and time preferences',
              factors: {
                skillCompatibility: { score: 95, status: 'positive' },
                timePreferences: { score: 90, status: 'positive' },
                marketplaceAlignment: { score: 90, status: 'positive' }
              }
            }
          ];
          result = await this.notificationService.notifyNewMatches(userId, sampleMatches as any);
          notificationType = 'New Matches';
          break;

        case 'chains':
          // Send test chain notification
          const sampleChains = [
            {
              chainId: 'test-chain-123',
              chainScore: 85,
              participants: [
                { firstName: 'Alice', lastName: 'Johnson' },
                { firstName: 'Bob', lastName: 'Wilson' }
              ],
              status: 'pending',
              expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
            }
          ];
          result = await this.notificationService.notifyNewChains(userId, sampleChains as any);
          notificationType = 'Chain Opportunities';
          break;

        case 'approval':
          // Send test approval request
          const sampleChain = {
            chainId: 'approval-test-456',
            chainScore: 88,
            participants: [
              { firstName: 'Carol', lastName: 'Davis' },
              { firstName: 'David', lastName: 'Miller' }
            ],
            status: 'pending',
            expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000)
          };
          result = await this.notificationService.notifyChainApprovalRequest(userId, sampleChain as any);
          notificationType = 'Approval Request';
          break;

        case 'expiring':
          // Send test expiring notification
          const expiringItem = {
            expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000) // 2 hours from now
          };
          result = await this.notificationService.notifyExpiring(userId, 'intent', expiringItem);
          notificationType = 'Expiring Alert';
          break;

        default:
          res.status(400).json({
            success: false,
            message: 'Invalid notification type. Use: matches, chains, approval, or expiring'
          });
          return;
      }

      res.json({
        success: true,
        message: `Test ${notificationType} notification sent`,
        data: {
          userId,
          userEmail: user.email,
          notificationType,
          notificationsSent: result,
          emailEnabled: preferences.notificationSettings.email
        }
      });

    } catch (error) {
      logger.error('❌ Test notification failed:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to send test notification',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get notification system status
   */
  async getNotificationStatus(req: Request, res: Response): Promise<void> {
    try {
      // Check environment configuration
      const emailConfig = {
        enabled: process.env.EMAIL_NOTIFICATIONS_ENABLED === 'true',
        smtpHost: process.env.SMTP_HOST || 'Not configured',
        smtpPort: process.env.SMTP_PORT || 'Not configured',
        fromEmail: process.env.FROM_EMAIL || 'Not configured'
      };

      // Check notification service status
      const serviceStatus = {
        initialized: !!this.notificationService,
        emailTransporter: 'Checking...'
      };

      // Test SMTP connection
      try {
        const credentials = await generateTestEmailCredentials();
        serviceStatus.emailTransporter = 'Available';
      } catch (error) {
        serviceStatus.emailTransporter = 'Failed to initialize';
      }

      // Get user notification preferences summary
      const totalUsers = await User.countDocuments();
      const usersWithPreferences = await UserPreferences.countDocuments();
      const emailEnabledUsers = await UserPreferences.countDocuments({
        'notificationSettings.email': true
      });

      const userStats = {
        totalUsers,
        usersWithPreferences,
        emailEnabledUsers,
        configurationRate: totalUsers > 0 ? Math.round((usersWithPreferences / totalUsers) * 100) : 0
      };

      res.json({
        success: true,
        data: {
          emailConfig,
          serviceStatus,
          userStats,
          availableNotificationTypes: [
            'newMatches',
            'chainOpportunities', 
            'approvalRequests',
            'expiringAlerts'
          ]
        }
      });

    } catch (error) {
      logger.error('❌ Failed to get notification status:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get notification status',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Update user notification preferences
   */
  async updateNotificationPreferences(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user._id;
      const { notificationSettings } = req.body;

      if (!notificationSettings) {
        res.status(400).json({
          success: false,
          message: 'Notification settings are required'
        });
        return;
      }

      // Find or create user preferences
      let preferences = await UserPreferences.findOne({ userId });
      
      if (!preferences) {
        preferences = new UserPreferences({
          userId,
          autoMatchEnabled: true,
          preferredTimeSlots: ['any'],
          preferredMarketplaces: [],
          skillFlexibility: false,
          maxSwapsPerWeek: 2,
          notificationSettings: {
            email: true,
            push: true,
            sms: false,
            newMatches: true,
            chainOpportunities: true,
            approvalRequests: true,
            expiringAlerts: true
          },
          blacklistedUsers: []
        });
      }

      // Update notification settings
      preferences.notificationSettings = {
        ...preferences.notificationSettings,
        ...notificationSettings
      };

      await preferences.save();

      res.json({
        success: true,
        message: 'Notification preferences updated successfully',
        data: {
          userId,
          notificationSettings: preferences.notificationSettings
        }
      });

    } catch (error) {
      logger.error('❌ Failed to update notification preferences:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update notification preferences',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}

// Create controller instance
const notificationController = new NotificationController();

// Export controller methods
export const testEmailSystem = notificationController.testEmailSystem.bind(notificationController);
export const sendTestNotification = notificationController.sendTestNotification.bind(notificationController);
export const getNotificationStatus = notificationController.getNotificationStatus.bind(notificationController);
export const updateNotificationPreferences = notificationController.updateNotificationPreferences.bind(notificationController);
