import { Request, Response } from 'express';
import { RealScheduleEntry } from '../models/RealScheduleEntry';
import { ShiftGenerationService } from '../services/shiftGenerationService';
import { logger } from '../utils/logger';

// Define authenticated request type
interface AuthenticatedRequest extends Request {
  user?: any;
}

// Get all schedule entries with pagination and filtering
export const getAllSchedules = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skill = req.query.skill as string;
    const userLogin = req.query.userLogin as string;
    const workingDay = req.query.workingDay as string;

    // Build filter object
    const filter: any = {};

    if (skill) {
      filter.skill = { $regex: skill, $options: 'i' };
    }

    if (userLogin) {
      filter.userLogin = { $regex: userLogin, $options: 'i' };
    }

    if (workingDay) {
      filter['dailyShifts'] = {
        $elemMatch: {
          day: workingDay,
          working: true
        }
      };
    }

    const skip = (page - 1) * limit;

    const [schedules, total] = await Promise.all([
      RealScheduleEntry.find(filter)
        .skip(skip)
        .limit(limit)
        .sort({ userLogin: 1 }),
      RealScheduleEntry.countDocuments(filter)
    ]);

    res.json({
      success: true,
      data: schedules,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    logger.error('Error fetching schedules:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching schedules',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Get authenticated user's own schedule
export const getMySchedule = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;

    if (!user?.userLogin) {
      res.status(404).json({
        success: false,
        message: 'No schedule data linked to your account. Please contact administrator.'
      });
      return;
    }

    const schedule = await RealScheduleEntry.findOne({ userLogin: user.userLogin });

    if (!schedule) {
      res.status(404).json({
        success: false,
        message: 'Schedule not found for your account'
      });
      return;
    }

    res.json({
      success: true,
      data: schedule
    });
  } catch (error) {
    logger.error('Error fetching user schedule:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Get authenticated user's shifts (auto-generates if needed)
export const getMyShifts = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;

    if (!user?.userLogin) {
      res.status(404).json({
        success: false,
        message: 'No schedule data linked to your account. Please contact administrator.'
      });
      return;
    }

    const shifts = await ShiftGenerationService.getUserShiftsForCurrentWeek(user.userLogin);

    res.json({
      success: true,
      data: shifts
    });
  } catch (error) {
    logger.error('Error fetching user shifts:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Get schedule by user login (for managers/admins)
export const getScheduleByUserLogin = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userLogin } = req.params;

    const schedule = await RealScheduleEntry.findOne({ userLogin });

    if (!schedule) {
      res.status(404).json({
        success: false,
        message: 'Schedule not found for this user'
      });
      return;
    }

    res.json({
      success: true,
      data: schedule
    });
  } catch (error) {
    logger.error('Error fetching schedule by user login:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching schedule',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Get schedules by skill
export const getSchedulesBySkill = async (req: Request, res: Response): Promise<void> => {
  try {
    const { skill } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    const skip = (page - 1) * limit;

    const [schedules, total] = await Promise.all([
      RealScheduleEntry.find({ skill: { $regex: skill, $options: 'i' } })
        .skip(skip)
        .limit(limit)
        .sort({ userLogin: 1 }),
      RealScheduleEntry.countDocuments({ skill: { $regex: skill, $options: 'i' } })
    ]);

    res.json({
      success: true,
      data: schedules,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    logger.error('Error fetching schedules by skill:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching schedules by skill',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Get available skills
export const getAvailableSkills = async (req: Request, res: Response): Promise<void> => {
  try {
    const skills = await RealScheduleEntry.distinct('skill');

    res.json({
      success: true,
      data: skills.sort()
    });
  } catch (error) {
    logger.error('Error fetching available skills:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching available skills',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Get schedule statistics
export const getScheduleStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const [
      totalEmployees,
      skillStats,
      workingDaysStats,
      shiftTimeStats
    ] = await Promise.all([
      RealScheduleEntry.countDocuments(),

      // Skill distribution
      RealScheduleEntry.aggregate([
        {
          $group: {
            _id: '$skill',
            count: { $sum: 1 }
          }
        },
        { $sort: { count: -1 } }
      ]),

      // Working days distribution
      RealScheduleEntry.aggregate([
        {
          $project: {
            workingDaysCount: {
              $size: {
                $filter: {
                  input: '$dailyShifts',
                  cond: { $eq: ['$$this.working', true] }
                }
              }
            }
          }
        },
        {
          $group: {
            _id: '$workingDaysCount',
            count: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ]),

      // Shift time patterns
      RealScheduleEntry.aggregate([
        { $unwind: '$dailyShifts' },
        { $match: { 'dailyShifts.working': true } },
        {
          $group: {
            _id: {
              start: '$dailyShifts.shiftStart',
              end: '$dailyShifts.shiftEnd'
            },
            count: { $sum: 1 }
          }
        },
        { $sort: { count: -1 } },
        { $limit: 10 }
      ])
    ]);

    res.json({
      success: true,
      data: {
        totalEmployees,
        skillDistribution: skillStats,
        workingDaysDistribution: workingDaysStats,
        commonShiftTimes: shiftTimeStats
      }
    });
  } catch (error) {
    logger.error('Error fetching schedule statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching schedule statistics',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Find potential swap matches for a user
export const findSwapMatches = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userLogin } = req.params;
    const { day } = req.query;

    const userSchedule = await RealScheduleEntry.findOne({ userLogin });

    if (!userSchedule) {
      res.status(404).json({
        success: false,
        message: 'User schedule not found'
      });
      return;
    }

    // Find users with similar skills who work on the requested day
    const potentialMatches = await RealScheduleEntry.find({
      userLogin: { $ne: userLogin },
      skill: userSchedule.skill,
      'dailyShifts': {
        $elemMatch: {
          day: day as string,
          working: true
        }
      }
    }).limit(10);

    res.json({
      success: true,
      data: potentialMatches
    });
  } catch (error) {
    logger.error('Error finding swap matches:', error);
    res.status(500).json({
      success: false,
      message: 'Error finding swap matches',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};
