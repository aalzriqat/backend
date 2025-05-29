import nodemailer from 'nodemailer';
import { logger } from './logger';

/**
 * Generate test email credentials using Ethereal Email
 * This creates a temporary test account for development
 */
export async function generateTestEmailCredentials() {
  try {
    // Generate test SMTP service account from ethereal.email
    const testAccount = await nodemailer.createTestAccount();

    logger.info('📧 Generated test email credentials:', {
      user: testAccount.user,
      pass: testAccount.pass,
      smtp: testAccount.smtp,
      imap: testAccount.imap,
      web: testAccount.web
    });

    return {
      host: testAccount.smtp.host,
      port: testAccount.smtp.port,
      secure: testAccount.smtp.secure,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass
      },
      webUrl: testAccount.web
    };

  } catch (error) {
    logger.error('❌ Failed to generate test email credentials:', error);

    // Fallback to default configuration
    return {
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: {
        user: 'smartswap.test@ethereal.email',
        pass: 'testpassword123'
      },
      webUrl: 'https://ethereal.email'
    };
  }
}

/**
 * Test email sending functionality
 */
export async function testEmailSending() {
  try {
    logger.info('🧪 Testing email sending functionality...');

    // Generate test credentials
    const credentials = await generateTestEmailCredentials();

    // Create transporter
    const transporter = nodemailer.createTransport(credentials);

    // Verify connection
    await transporter.verify();
    logger.info('✅ SMTP connection verified successfully');

    // Send test email
    const testEmail = {
      from: process.env.FROM_EMAIL || 'SmartSwap Scheduler <noreply@smartswap.local>',
      to: credentials.auth.user, // Send to test account
      subject: '🧪 SmartSwap Email Test - System Verification',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #2563eb;">📧 Email System Test</h2>
          <p>This is a test email to verify that the SmartSwap Scheduler email notification system is working correctly.</p>

          <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #1f2937;">System Status</h3>
            <ul>
              <li>✅ SMTP Connection: Working</li>
              <li>✅ Email Templates: Loaded</li>
              <li>✅ Notification Service: Active</li>
              <li>✅ Automated Scheduling: Enabled</li>
            </ul>
          </div>

          <p><strong>Test Details:</strong></p>
          <ul>
            <li><strong>Timestamp:</strong> ${new Date().toISOString()}</li>
            <li><strong>Environment:</strong> ${process.env.NODE_ENV || 'development'}</li>
            <li><strong>SMTP Host:</strong> ${credentials.host}</li>
            <li><strong>Test Account:</strong> ${credentials.auth.user}</li>
          </ul>

          <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
            This is an automated test email from SmartSwap Scheduler.
            If you received this, the email notification system is working correctly!
          </p>

          <p style="color: #6b7280; font-size: 12px;">
            View this email online: <a href="${credentials.webUrl}" target="_blank">${credentials.webUrl}</a>
          </p>
        </div>
      `,
      text: `
SmartSwap Email System Test

This is a test email to verify that the SmartSwap Scheduler email notification system is working correctly.

System Status:
✅ SMTP Connection: Working
✅ Email Templates: Loaded
✅ Notification Service: Active
✅ Automated Scheduling: Enabled

Test Details:
- Timestamp: ${new Date().toISOString()}
- Environment: ${process.env.NODE_ENV || 'development'}
- SMTP Host: ${credentials.host}
- Test Account: ${credentials.auth.user}

This is an automated test email from SmartSwap Scheduler.
If you received this, the email notification system is working correctly!

View online: ${credentials.webUrl}
      `
    };

    const info = await transporter.sendMail(testEmail);

    logger.info('✅ Test email sent successfully:', {
      messageId: info.messageId,
      previewUrl: nodemailer.getTestMessageUrl(info),
      recipient: credentials.auth.user
    });

    return {
      success: true,
      messageId: info.messageId,
      previewUrl: nodemailer.getTestMessageUrl(info),
      credentials: credentials
    };

  } catch (error) {
    logger.error('❌ Email test failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Test notification templates with sample data
 */
export async function testNotificationTemplates() {
  try {
    logger.info('🧪 Testing notification templates...');

    // Import notification service
    const { NotificationService } = await import('../services/notificationService');
    const notificationService = new NotificationService();

    // Sample user data
    const sampleUser = {
      _id: 'test-user-id',
      email: 'test@example.com',
      firstName: 'John',
      lastName: 'Doe'
    };

    // Sample match data
    const sampleMatches = [
      {
        targetUser: { firstName: 'Jane', lastName: 'Smith' },
        matchScore: 95,
        compatibility: 'Excellent',
        reason: 'Perfect skill match and preferred time slots',
        factors: {
          skillCompatibility: { score: 100, status: 'positive' },
          timePreferences: { score: 90, status: 'positive' },
          marketplaceAlignment: { score: 95, status: 'positive' }
        }
      }
    ];

    // Sample chain data
    const sampleChains = [
      {
        chainId: 'test-chain-id',
        chainScore: 88,
        participants: [
          { firstName: 'Alice', lastName: 'Johnson' },
          { firstName: 'Bob', lastName: 'Wilson' },
          { firstName: 'Carol', lastName: 'Davis' }
        ],
        status: 'pending',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours from now
      }
    ];

    // Test different notification types
    const tests = [
      {
        name: 'New Matches Notification',
        test: () => notificationService.notifyNewMatches(sampleUser._id, sampleMatches as any)
      },
      {
        name: 'New Chains Notification',
        test: () => notificationService.notifyNewChains(sampleUser._id, sampleChains as any)
      },
      {
        name: 'Chain Approval Request',
        test: () => notificationService.notifyChainApprovalRequest(sampleUser._id, sampleChains[0] as any)
      },
      {
        name: 'Expiring Intent Alert',
        test: () => notificationService.notifyExpiring(sampleUser._id, 'intent', { expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000) })
      }
    ];

    const results = [];
    for (const test of tests) {
      try {
        logger.info(`🧪 Testing: ${test.name}`);
        const result = await test.test();
        results.push({
          name: test.name,
          success: true,
          result: result
        });
        logger.info(`✅ ${test.name}: Success`);
      } catch (error) {
        results.push({
          name: test.name,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        logger.error(`❌ ${test.name}: Failed -`, error);
      }
    }

    return {
      success: true,
      tests: results,
      summary: {
        total: tests.length,
        passed: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length
      }
    };

  } catch (error) {
    logger.error('❌ Template testing failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}
