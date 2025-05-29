import { Request, Response } from 'express';
import { SwapIntent, UserPreferences, Shift } from '../models';
import { smartMatchingService } from '../services/smartMatchingService';
import { logger } from '../utils/logger';

// Get all swap intents for a user
export const getUserSwapIntents = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    const { status } = req.query;

    let query: any = { userId };
    if (status) {
      query.status = status;
    }

    const intents = await SwapIntent.find(query)
      .populate('originalShiftId')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: intents
    });
  } catch (error) {
    logger.error('Get user swap intents error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error getting swap intents'
    });
  }
};

// Create a new swap intent
export const createSwapIntent = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      originalShiftId,
      preferredTimeSlots,
      preferredMarketplaces,
      skillFlexibility,
      maxDaysOut,
      priority,
      notes
    } = req.body;
    const userId = req.user._id;

    // Verify the shift exists and belongs to the user
    const shift = await Shift.findById(originalShiftId);
    if (!shift) {
      res.status(404).json({
        success: false,
        message: 'Shift not found'
      });
      return;
    }

    if (shift.userId !== userId.toString()) {
      res.status(403).json({
        success: false,
        message: 'You can only create intents for your own shifts'
      });
      return;
    }

    // Check if an active intent already exists for this shift
    const existingIntent = await SwapIntent.findOne({
      userId,
      originalShiftId,
      status: 'active'
    });

    if (existingIntent) {
      res.status(400).json({
        success: false,
        message: 'An active swap intent already exists for this shift'
      });
      return;
    }

    // Create the swap intent
    const swapIntent = new SwapIntent({
      userId,
      originalShiftId,
      preferredTimeSlots: preferredTimeSlots || ['any'],
      preferredMarketplaces: preferredMarketplaces || [],
      skillFlexibility: skillFlexibility || false,
      maxDaysOut: maxDaysOut || 14,
      priority: priority || 3,
      notes
    });

    await swapIntent.save();

    // Populate the created intent
    await swapIntent.populate('originalShiftId');

    logger.info(`Swap intent created: ${swapIntent._id} for user: ${userId}`);

    res.status(201).json({
      success: true,
      data: swapIntent
    });
  } catch (error) {
    logger.error('Create swap intent error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error creating swap intent'
    });
  }
};

// Update a swap intent
export const updateSwapIntent = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user._id;
    const updates = req.body;

    const swapIntent = await SwapIntent.findOne({ _id: id, userId });

    if (!swapIntent) {
      res.status(404).json({
        success: false,
        message: 'Swap intent not found'
      });
      return;
    }

    if (swapIntent.status !== 'active') {
      res.status(400).json({
        success: false,
        message: 'Can only update active swap intents'
      });
      return;
    }

    // Update allowed fields
    const allowedUpdates = [
      'preferredTimeSlots',
      'preferredMarketplaces',
      'skillFlexibility',
      'maxDaysOut',
      'priority',
      'notes'
    ];

    allowedUpdates.forEach(field => {
      if (updates[field] !== undefined) {
        swapIntent[field] = updates[field];
      }
    });

    await swapIntent.save();
    await swapIntent.populate('originalShiftId');

    res.json({
      success: true,
      data: swapIntent
    });
  } catch (error) {
    logger.error('Update swap intent error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error updating swap intent'
    });
  }
};

// Cancel a swap intent
export const cancelSwapIntent = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const swapIntent = await SwapIntent.findOne({ _id: id, userId });

    if (!swapIntent) {
      res.status(404).json({
        success: false,
        message: 'Swap intent not found'
      });
      return;
    }

    if (swapIntent.status !== 'active') {
      res.status(400).json({
        success: false,
        message: 'Can only cancel active swap intents'
      });
      return;
    }

    swapIntent.status = 'cancelled';
    await swapIntent.save();

    res.json({
      success: true,
      data: swapIntent
    });
  } catch (error) {
    logger.error('Cancel swap intent error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error cancelling swap intent'
    });
  }
};

// Find smart matches for a swap intent
export const findSmartMatches = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    // Verify the intent belongs to the user
    const swapIntent = await SwapIntent.findOne({ _id: id, userId });

    if (!swapIntent) {
      res.status(404).json({
        success: false,
        message: 'Swap intent not found'
      });
      return;
    }

    if (swapIntent.status !== 'active') {
      res.status(400).json({
        success: false,
        message: 'Can only find matches for active swap intents'
      });
      return;
    }

    // Find matches using the smart matching service
    const matches = await smartMatchingService.findMatches(id);

    res.json({
      success: true,
      data: {
        intentId: id,
        matches,
        totalMatches: matches.length,
        searchedAt: new Date()
      }
    });
  } catch (error) {
    logger.error('Find smart matches error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error finding matches'
    });
  }
};

// Get all active swap intents (for browsing)
export const getActiveSwapIntents = async (req: Request, res: Response): Promise<void> => {
  try {
    const { marketplace, timeSlot, skillFlexibility } = req.query;
    const userId = req.user._id;

    // Build query to exclude user's own intents
    let query: any = {
      status: 'active',
      expiresAt: { $gt: new Date() },
      userId: { $ne: userId }
    };

    // Add filters if provided
    if (marketplace) {
      query.preferredMarketplaces = marketplace;
    }

    if (timeSlot) {
      query.preferredTimeSlots = timeSlot;
    }

    if (skillFlexibility !== undefined) {
      query.skillFlexibility = skillFlexibility === 'true';
    }

    const intents = await SwapIntent.find(query)
      .populate('userId', 'firstName lastName')
      .populate('originalShiftId')
      .sort({ priority: -1, createdAt: -1 })
      .limit(50); // Limit results for performance

    res.json({
      success: true,
      data: intents
    });
  } catch (error) {
    logger.error('Get active swap intents error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error getting active intents'
    });
  }
};

// Get user preferences
export const getUserPreferences = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user._id;

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
          sms: false
        },
        blacklistedUsers: []
      });
      await preferences.save();
    }

    res.json({
      success: true,
      data: preferences
    });
  } catch (error) {
    logger.error('Get user preferences error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error getting preferences'
    });
  }
};

// Update user preferences
export const updateUserPreferences = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user._id;
    const updates = req.body;

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
          sms: false
        },
        blacklistedUsers: []
      });
    }

    // Update allowed fields
    const allowedUpdates = [
      'autoMatchEnabled',
      'preferredTimeSlots',
      'preferredMarketplaces',
      'skillFlexibility',
      'maxSwapsPerWeek',
      'notificationSettings'
    ];

    allowedUpdates.forEach(field => {
      if (updates[field] !== undefined) {
        preferences[field] = updates[field];
      }
    });

    await preferences.save();

    res.json({
      success: true,
      data: preferences
    });
  } catch (error) {
    logger.error('Update user preferences error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error updating preferences'
    });
  }
};
