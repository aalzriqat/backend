import { Request, Response } from 'express';
import { Shift, User } from '../models';
import { logger } from '../utils/logger';
import { ApiResponse, IShift } from '../types';

export const getUserSchedule = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    const { weekStart } = req.query;

    // Build query
    let query: any = { userId };

    if (weekStart) {
      // If weekStart is provided, get shifts for that week
      const startDate = new Date(weekStart as string);
      const endDate = new Date(startDate);
      endDate.setDate(startDate.getDate() + 6); // 7 days total

      query.date = {
        $gte: startDate.toISOString().split('T')[0],
        $lte: endDate.toISOString().split('T')[0]
      };
    }

    const shifts = await Shift.find(query).sort({ date: 1, startTime: 1 });

    // Group shifts by date for schedule format
    const schedule = {
      userId,
      weekStart: weekStart || null,
      shifts: shifts
    };

    res.json({
      success: true,
      data: schedule
    });
  } catch (error) {
    logger.error('Get user schedule error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error getting user schedule'
    });
  }
};

export const createShift = async (req: Request, res: Response): Promise<void> => {
  try {
    const shiftData = req.body;

    // Verify user exists
    const user = await User.findById(shiftData.userId);
    if (!user) {
      res.status(404).json({
        success: false,
        message: 'User not found'
      });
      return;
    }

    const shift = new Shift(shiftData);
    await shift.save();

    logger.info(`Shift created for user ${shiftData.userId} on ${shiftData.date}`);

    res.status(201).json({
      success: true,
      data: shift
    });
  } catch (error) {
    logger.error('Create shift error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error creating shift'
    });
  }
};

export const updateShift = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const shift = await Shift.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!shift) {
      res.status(404).json({
        success: false,
        message: 'Shift not found'
      });
      return;
    }

    logger.info(`Shift updated: ${shift._id}`);

    res.json({
      success: true,
      data: shift
    });
  } catch (error) {
    logger.error('Update shift error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error updating shift'
    });
  }
};

export const deleteShift = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const shift = await Shift.findByIdAndDelete(id);

    if (!shift) {
      res.status(404).json({
        success: false,
        message: 'Shift not found'
      });
      return;
    }

    logger.info(`Shift deleted: ${shift._id}`);

    res.json({
      success: true,
      message: 'Shift deleted successfully'
    });
  } catch (error) {
    logger.error('Delete shift error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error deleting shift'
    });
  }
};

export const getShifts = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId, date, marketplace } = req.query;

    // Build query
    let query: any = {};

    if (userId) query.userId = userId;
    if (date) query.date = date;
    if (marketplace) query.marketplace = marketplace;

    const shifts = await Shift.find(query)
      .populate('userId', 'firstName lastName email')
      .sort({ date: 1, startTime: 1 });

    res.json({
      success: true,
      data: shifts
    });
  } catch (error) {
    logger.error('Get shifts error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error getting shifts'
    });
  }
};
