import { Shift } from '../models/Shift';
import { RealScheduleEntry } from '../models/RealScheduleEntry';
import { User } from '../models/User';
import { logger } from '../utils/logger';
import { ShiftType, Marketplace, Skill } from '../types';

interface GenerateShiftsOptions {
  weekStart?: Date;
  overwriteExisting?: boolean;
}

export class ShiftGenerationService {
  /**
   * Generate Shift documents from RealScheduleEntry data for a specific user
   */
  static async generateShiftsForUser(
    userLogin: string, 
    options: GenerateShiftsOptions = {}
  ): Promise<any[]> {
    try {
      // Find the user by userLogin
      const user = await User.findOne({ userLogin });
      if (!user) {
        throw new Error(`User not found with userLogin: ${userLogin}`);
      }

      // Find the real schedule entry
      const realSchedule = await RealScheduleEntry.findOne({ userLogin });
      if (!realSchedule) {
        throw new Error(`Real schedule not found for user: ${userLogin}`);
      }

      // Calculate week start date (default to current week)
      const weekStart = options.weekStart || this.getCurrentWeekStart();
      
      // Generate shifts for the week
      const shifts = await this.createShiftsFromRealSchedule(
        user._id.toString(),
        realSchedule,
        weekStart,
        options.overwriteExisting
      );

      logger.info(`Generated ${shifts.length} shifts for user ${userLogin}`);
      return shifts;
    } catch (error) {
      logger.error(`Error generating shifts for user ${userLogin}:`, error);
      throw error;
    }
  }

  /**
   * Generate Shift documents for all users with RealScheduleEntry data
   */
  static async generateShiftsForAllUsers(options: GenerateShiftsOptions = {}): Promise<void> {
    try {
      const realSchedules = await RealScheduleEntry.find({});
      const weekStart = options.weekStart || this.getCurrentWeekStart();

      let totalGenerated = 0;
      let errors = 0;

      for (const realSchedule of realSchedules) {
        try {
          const user = await User.findOne({ userLogin: realSchedule.userLogin });
          if (!user) {
            logger.warn(`User not found for userLogin: ${realSchedule.userLogin}`);
            errors++;
            continue;
          }

          const shifts = await this.createShiftsFromRealSchedule(
            user._id.toString(),
            realSchedule,
            weekStart,
            options.overwriteExisting
          );

          totalGenerated += shifts.length;
        } catch (error) {
          logger.error(`Error generating shifts for ${realSchedule.userLogin}:`, error);
          errors++;
        }
      }

      logger.info(`Shift generation complete: ${totalGenerated} shifts generated, ${errors} errors`);
    } catch (error) {
      logger.error('Error in bulk shift generation:', error);
      throw error;
    }
  }

  /**
   * Create Shift documents from a RealScheduleEntry
   */
  private static async createShiftsFromRealSchedule(
    userId: string,
    realSchedule: any,
    weekStart: Date,
    overwriteExisting = false
  ): Promise<any[]> {
    const shifts = [];
    const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    for (let i = 0; i < 7; i++) {
      const dayShift = realSchedule.dailyShifts[i];
      if (!dayShift || !dayShift.working) {
        continue; // Skip non-working days
      }

      const shiftDate = new Date(weekStart);
      shiftDate.setDate(weekStart.getDate() + i);
      const dateString = shiftDate.toISOString().split('T')[0];

      // Check if shift already exists
      if (!overwriteExisting) {
        const existingShift = await Shift.findOne({
          userId,
          date: dateString
        });
        if (existingShift) {
          shifts.push(existingShift);
          continue;
        }
      }

      // Create new shift
      const shiftData = {
        userId,
        date: dateString,
        startTime: dayShift.shiftStart,
        endTime: dayShift.shiftEnd,
        type: this.determineShiftType(dayShift.shiftStart),
        skills: this.extractSkillsFromRealSchedule(realSchedule.skill),
        marketplace: this.extractMarketplaceFromSkill(realSchedule.skill),
        status: 'confirmed' as const
      };

      try {
        let shift;
        if (overwriteExisting) {
          shift = await Shift.findOneAndUpdate(
            { userId, date: dateString },
            shiftData,
            { upsert: true, new: true }
          );
        } else {
          shift = new Shift(shiftData);
          await shift.save();
        }
        shifts.push(shift);
      } catch (error) {
        logger.error(`Error creating shift for ${userId} on ${dateString}:`, error);
      }
    }

    return shifts;
  }

  /**
   * Determine shift type based on start time
   */
  private static determineShiftType(startTime: string): ShiftType {
    const hour = parseInt(startTime.split(':')[0]);
    
    if (hour >= 5 && hour < 12) {
      return 'Morning Shift';
    } else if (hour >= 12 && hour < 18) {
      return 'Day Shift';
    } else {
      return 'Evening Shift';
    }
  }

  /**
   * Extract skills from real schedule skill string
   */
  private static extractSkillsFromRealSchedule(skillString: string): Skill[] {
    const skills: Skill[] = [];
    
    if (skillString.includes('MU') && skillString.includes('Phone')) {
      skills.push('PhoneMU');
    } else if (skillString.includes('Phone')) {
      skills.push('phoneOnly');
    } else if (skillString.includes('MU')) {
      skills.push('MuOnly');
    } else if (skillString.includes('Email')) {
      skills.push('Email');
    } else {
      skills.push('General');
    }
    
    return skills;
  }

  /**
   * Extract marketplace from skill string
   */
  private static extractMarketplaceFromSkill(skillString: string): Marketplace {
    if (skillString.includes('AE')) return 'AE';
    if (skillString.includes('SA')) return 'SA';
    if (skillString.includes('UK')) return 'UK';
    if (skillString.includes('EG')) return 'EG';
    return 'AE'; // Default
  }

  /**
   * Get the start of the current week (Sunday)
   */
  private static getCurrentWeekStart(): Date {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - dayOfWeek);
    weekStart.setHours(0, 0, 0, 0);
    return weekStart;
  }

  /**
   * Get user's shifts for the current week, generating them if they don't exist
   */
  static async getUserShiftsForCurrentWeek(userLogin: string): Promise<any[]> {
    try {
      const user = await User.findOne({ userLogin });
      if (!user) {
        throw new Error(`User not found with userLogin: ${userLogin}`);
      }

      const weekStart = this.getCurrentWeekStart();
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);

      // Check if shifts exist for this week
      const existingShifts = await Shift.find({
        userId: user._id.toString(),
        date: {
          $gte: weekStart.toISOString().split('T')[0],
          $lte: weekEnd.toISOString().split('T')[0]
        }
      }).sort({ date: 1 });

      // If we have shifts for the week, return them
      if (existingShifts.length > 0) {
        return existingShifts;
      }

      // Otherwise, generate them
      return await this.generateShiftsForUser(userLogin, { weekStart });
    } catch (error) {
      logger.error(`Error getting user shifts for ${userLogin}:`, error);
      throw error;
    }
  }
}
