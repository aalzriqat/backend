import { logger } from '../utils/logger';
import { User } from '../models/User';
import { UserPreferences } from '../models/UserPreferences';
import { ISmartMatch, ISwapChain, IUser } from '../types';
import nodemailer from 'nodemailer';

export interface NotificationTemplate {
  subject: string;
  html: string;
  text: string;
}

export interface NotificationResult {
  sent: boolean;
  method: 'email' | 'push' | 'sms' | 'in-app';
  error?: string;
}

export class NotificationService {
  private emailTransporter: nodemailer.Transporter | null = null;

  constructor() {
    this.initializeEmailTransporter();
  }

  /**
   * Initialize email transporter
   */
  private initializeEmailTransporter() {
    try {
      // For development, use a test account or configure with real SMTP
      this.emailTransporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.ethereal.email',
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: false,
        auth: {
          user: process.env.SMTP_USER || 'test@smartswap.local',
          pass: process.env.SMTP_PASS || 'testpassword'
        }
      });

      logger.info('📧 Email transporter initialized');
    } catch (error) {
      logger.error('❌ Failed to initialize email transporter:', error);
    }
  }

  /**
   * Notify user about new direct matches
   */
  async notifyNewMatches(userId: string, matches: ISmartMatch[]): Promise<number> {
    try {
      const user = await User.findById(userId);
      const preferences = await UserPreferences.findOne({ userId });

      if (!user || !preferences) {
        logger.warn(`⚠️ User or preferences not found for ${userId}`);
        return 0;
      }

      if (matches.length === 0) {
        return 0;
      }

      const template = this.generateMatchNotificationTemplate(user, matches);
      const results = await this.sendNotifications(user, preferences, template);

      const sentCount = results.filter(r => r.sent).length;
      logger.info(`📬 Sent ${sentCount} match notifications to ${user.email}`);

      return sentCount;

    } catch (error) {
      logger.error('❌ Error sending match notifications:', error);
      return 0;
    }
  }

  /**
   * Notify user about new chain opportunities
   */
  async notifyNewChains(userId: string, chains: ISwapChain[]): Promise<number> {
    try {
      const user = await User.findById(userId);
      const preferences = await UserPreferences.findOne({ userId });

      if (!user || !preferences) {
        logger.warn(`⚠️ User or preferences not found for ${userId}`);
        return 0;
      }

      if (chains.length === 0) {
        return 0;
      }

      const template = this.generateChainNotificationTemplate(user, chains);
      const results = await this.sendNotifications(user, preferences, template);

      const sentCount = results.filter(r => r.sent).length;
      logger.info(`🔗 Sent ${sentCount} chain notifications to ${user.email}`);

      return sentCount;

    } catch (error) {
      logger.error('❌ Error sending chain notifications:', error);
      return 0;
    }
  }

  /**
   * Notify about chain approval requests
   */
  async notifyChainApprovalRequest(userId: string, chain: ISwapChain): Promise<number> {
    try {
      const user = await User.findById(userId);
      const preferences = await UserPreferences.findOne({ userId });

      if (!user || !preferences) {
        return 0;
      }

      const template = this.generateApprovalRequestTemplate(user, chain);
      const results = await this.sendNotifications(user, preferences, template);

      return results.filter(r => r.sent).length;

    } catch (error) {
      logger.error('❌ Error sending approval notifications:', error);
      return 0;
    }
  }

  /**
   * Notify about expiring intents or chains
   */
  async notifyExpiring(userId: string, type: 'intent' | 'chain', item: any): Promise<number> {
    try {
      const user = await User.findById(userId);
      const preferences = await UserPreferences.findOne({ userId });

      if (!user || !preferences) {
        return 0;
      }

      const template = this.generateExpiringTemplate(user, type, item);
      const results = await this.sendNotifications(user, preferences, template);

      return results.filter(r => r.sent).length;

    } catch (error) {
      logger.error('❌ Error sending expiring notifications:', error);
      return 0;
    }
  }

  /**
   * Send notifications via enabled channels
   */
  private async sendNotifications(
    user: IUser,
    preferences: any,
    template: NotificationTemplate
  ): Promise<NotificationResult[]> {
    const results: NotificationResult[] = [];

    // Check if notifications are globally enabled
    const notificationsEnabled = process.env.NOTIFICATIONS_ENABLED === 'true';
    const emailNotificationsEnabled = process.env.EMAIL_NOTIFICATIONS_ENABLED === 'true';

    if (!notificationsEnabled) {
      logger.warn('⚠️ Notifications are globally disabled');
      results.push({
        sent: false,
        method: 'email',
        error: 'Notifications globally disabled'
      });
      return results;
    }

    // Email notifications
    if (preferences.notificationSettings.email && emailNotificationsEnabled) {
      const emailResult = await this.sendEmail(user.email, template);
      results.push(emailResult);
    } else if (!emailNotificationsEnabled) {
      results.push({
        sent: false,
        method: 'email',
        error: 'Email notifications disabled in environment'
      });
    }

    // Push notifications (placeholder for future implementation)
    if (preferences.notificationSettings.push) {
      results.push({
        sent: false,
        method: 'push',
        error: 'Push notifications not implemented yet'
      });
    }

    // SMS notifications (placeholder for future implementation)
    if (preferences.notificationSettings.sms) {
      results.push({
        sent: false,
        method: 'sms',
        error: 'SMS notifications not implemented yet'
      });
    }

    return results;
  }

  /**
   * Send email notification
   */
  private async sendEmail(email: string, template: NotificationTemplate): Promise<NotificationResult> {
    if (!this.emailTransporter) {
      return {
        sent: false,
        method: 'email',
        error: 'Email transporter not initialized'
      };
    }

    try {
      await this.emailTransporter.sendMail({
        from: process.env.FROM_EMAIL || 'noreply@smartswap.local',
        to: email,
        subject: template.subject,
        text: template.text,
        html: template.html
      });

      return { sent: true, method: 'email' };

    } catch (error) {
      logger.error('❌ Email sending failed:', error);
      return {
        sent: false,
        method: 'email',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Generate match notification template
   */
  private generateMatchNotificationTemplate(user: IUser, matches: ISmartMatch[]): NotificationTemplate {
    const bestMatch = matches.reduce((best, current) =>
      current.matchScore > best.matchScore ? current : best
    );

    const subject = `🎯 ${matches.length} New Swap Match${matches.length > 1 ? 'es' : ''} Found!`;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb;">New Swap Matches Available!</h2>
        <p>Hi ${user.firstName || user.email},</p>
        <p>Great news! We found <strong>${matches.length}</strong> new swap match${matches.length > 1 ? 'es' : ''} for your request.</p>

        <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #1f2937;">Best Match</h3>
          <p><strong>Compatibility:</strong> ${bestMatch.matchScore}% - ${bestMatch.compatibility}</p>
          <p><strong>Reason:</strong> ${bestMatch.reason}</p>
        </div>

        <p>
          <a href="${process.env.FRONTEND_URL || 'http://localhost:8081'}/smart-match"
             style="background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
            View All Matches
          </a>
        </p>

        <p style="color: #6b7280; font-size: 14px;">
          This is an automated notification from SmartSwap Scheduler.
          You can manage your notification preferences in your account settings.
        </p>
      </div>
    `;

    const text = `
New Swap Matches Available!

Hi ${user.firstName || user.email},

Great news! We found ${matches.length} new swap match${matches.length > 1 ? 'es' : ''} for your request.

Best Match:
- Compatibility: ${bestMatch.matchScore}% - ${bestMatch.compatibility}
- Reason: ${bestMatch.reason}

View all matches at: ${process.env.FRONTEND_URL || 'http://localhost:8081'}/smart-match

This is an automated notification from SmartSwap Scheduler.
    `;

    return { subject, html, text };
  }

  /**
   * Generate chain notification template
   */
  private generateChainNotificationTemplate(user: IUser, chains: ISwapChain[]): NotificationTemplate {
    const bestChain = chains.reduce((best, current) =>
      current.chainScore > best.chainScore ? current : best
    );

    const subject = `🔗 ${chains.length} Multi-hop Swap Chain${chains.length > 1 ? 's' : ''} Detected!`;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #7c3aed;">Multi-hop Swap Opportunities!</h2>
        <p>Hi ${user.firstName || user.email},</p>
        <p>Exciting news! We discovered <strong>${chains.length}</strong> multi-hop swap chain${chains.length > 1 ? 's' : ''} that could solve your scheduling needs.</p>

        <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #1f2937;">Best Chain Opportunity</h3>
          <p><strong>Chain Score:</strong> ${bestChain.chainScore}%</p>
          <p><strong>Participants:</strong> ${bestChain.participants.length} people</p>
          <p><strong>Status:</strong> ${bestChain.status}</p>
        </div>

        <p>Multi-hop swaps involve multiple participants and can solve complex scheduling conflicts that simple swaps cannot.</p>

        <p>
          <a href="${process.env.FRONTEND_URL || 'http://localhost:8081'}/smart-match"
             style="background: #7c3aed; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
            Review Chain Opportunities
          </a>
        </p>

        <p style="color: #6b7280; font-size: 14px;">
          This is an automated notification from SmartSwap Scheduler.
        </p>
      </div>
    `;

    const text = `
Multi-hop Swap Opportunities!

Hi ${user.firstName || user.email},

Exciting news! We discovered ${chains.length} multi-hop swap chain${chains.length > 1 ? 's' : ''} that could solve your scheduling needs.

Best Chain Opportunity:
- Chain Score: ${bestChain.chainScore}%
- Participants: ${bestChain.participants.length} people
- Status: ${bestChain.status}

Multi-hop swaps involve multiple participants and can solve complex scheduling conflicts that simple swaps cannot.

Review opportunities at: ${process.env.FRONTEND_URL || 'http://localhost:8081'}/smart-match

This is an automated notification from SmartSwap Scheduler.
    `;

    return { subject, html, text };
  }

  /**
   * Generate approval request template
   */
  private generateApprovalRequestTemplate(user: IUser, chain: ISwapChain): NotificationTemplate {
    const subject = `⏰ Swap Chain Approval Required`;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #dc2626;">Action Required: Swap Chain Approval</h2>
        <p>Hi ${user.firstName || user.email},</p>
        <p>You have been included in a multi-hop swap chain that requires your approval.</p>

        <div style="background: #fef2f2; border: 1px solid #fecaca; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #dc2626;">Chain Details</h3>
          <p><strong>Chain Score:</strong> ${chain.chainScore}%</p>
          <p><strong>Total Participants:</strong> ${chain.participants.length}</p>
          <p><strong>Expires:</strong> ${new Date(chain.expiresAt).toLocaleDateString()}</p>
        </div>

        <p><strong>Please review and approve/reject this chain as soon as possible.</strong></p>

        <p>
          <a href="${process.env.FRONTEND_URL || 'http://localhost:8081'}/chains"
             style="background: #dc2626; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
            Review & Approve
          </a>
        </p>
      </div>
    `;

    const text = `
Action Required: Swap Chain Approval

Hi ${user.firstName || user.email},

You have been included in a multi-hop swap chain that requires your approval.

Chain Details:
- Chain Score: ${chain.chainScore}%
- Total Participants: ${chain.participants.length}
- Expires: ${new Date(chain.expiresAt).toLocaleDateString()}

Please review and approve/reject this chain as soon as possible.

Review at: ${process.env.FRONTEND_URL || 'http://localhost:8081'}/chains
    `;

    return { subject, html, text };
  }

  /**
   * Generate expiring notification template
   */
  private generateExpiringTemplate(user: IUser, type: 'intent' | 'chain', item: any): NotificationTemplate {
    const subject = `⏰ Your ${type === 'intent' ? 'Swap Request' : 'Swap Chain'} Expires Soon`;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #d97706;">Expiring Soon!</h2>
        <p>Hi ${user.firstName || user.email},</p>
        <p>Your ${type === 'intent' ? 'swap request' : 'swap chain'} will expire soon.</p>

        <div style="background: #fef3c7; border: 1px solid #fcd34d; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p><strong>Expires:</strong> ${new Date(item.expiresAt).toLocaleString()}</p>
          <p>Take action now to avoid missing this opportunity!</p>
        </div>

        <p>
          <a href="${process.env.FRONTEND_URL || 'http://localhost:8081'}/smart-match"
             style="background: #d97706; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
            Take Action Now
          </a>
        </p>
      </div>
    `;

    const text = `
Expiring Soon!

Hi ${user.firstName || user.email},

Your ${type === 'intent' ? 'swap request' : 'swap chain'} will expire soon.

Expires: ${new Date(item.expiresAt).toLocaleString()}

Take action now to avoid missing this opportunity!

Visit: ${process.env.FRONTEND_URL || 'http://localhost:8081'}/smart-match
    `;

    return { subject, html, text };
  }
}
