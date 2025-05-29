import express from 'express';
import {
  testEmailSystem,
  sendTestNotification,
  getNotificationStatus,
  updateNotificationPreferences
} from '../controllers/notificationController';
import { authenticate, authorize } from '../middleware/auth';

const router = express.Router();

/**
 * @route GET /api/notifications/status
 * @desc Get notification system status
 * @access Manager, WorkFlowManagement, Developer
 */
router.get('/status',
  authenticate,
  authorize('Manager', 'WorkFlowManagement', 'Developer'),
  getNotificationStatus
);

/**
 * @route POST /api/notifications/test/email
 * @desc Test email system functionality
 * @access Public (for development testing)
 */
router.post('/test/email',
  testEmailSystem
);

/**
 * @route POST /api/notifications/test/send
 * @desc Send test notification to specific user
 * @access WorkFlowManagement, Developer
 * @body { userId: string, type: 'matches' | 'chains' | 'approval' | 'expiring' }
 */
router.post('/test/send',
  authenticate,
  authorize('WorkFlowManagement', 'Developer'),
  sendTestNotification
);

/**
 * @route PUT /api/notifications/preferences
 * @desc Update user notification preferences
 * @access All authenticated users
 * @body { notificationSettings: object }
 */
router.put('/preferences',
  authenticate,
  updateNotificationPreferences
);

/**
 * @route GET /api/notifications/preferences
 * @desc Get user notification preferences
 * @access All authenticated users
 */
router.get('/preferences', authenticate, async (req, res) => {
  try {
    const { UserPreferences } = await import('../models/UserPreferences');
    const userId = req.user._id;

    let preferences = await UserPreferences.findOne({ userId });

    if (!preferences) {
      // Return default preferences
      const defaultSettings = {
        email: true,
        push: true,
        sms: false,
        newMatches: true,
        chainOpportunities: true,
        approvalRequests: true,
        expiringAlerts: true
      };

      res.json({
        success: true,
        data: {
          userId,
          notificationSettings: defaultSettings
        }
      });
      return;
    }

    res.json({
      success: true,
      data: {
        userId,
        notificationSettings: preferences.notificationSettings
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get notification preferences',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
