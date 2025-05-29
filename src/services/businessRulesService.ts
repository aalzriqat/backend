import { 
  BusinessRuleResult, 
  SwapValidationContext, 
  IShift 
} from '../types';
import { logger } from '../utils/logger';

export class BusinessRulesService {
  
  /**
   * Validate if a swap is allowed according to business rules
   */
  async validateSwap(context: SwapValidationContext): Promise<BusinessRuleResult> {
    const violations: string[] = [];
    const warnings: string[] = [];

    try {
      // Rule 1: 12-hour rest period between shifts
      this.validateRestPeriod(context, violations, warnings);

      // Rule 2: 6-day work limit
      this.validateSixDayRule(context, violations, warnings);

      // Rule 3: Shift timing constraints
      this.validateShiftTiming(context, violations, warnings);

      // Rule 4: Skill requirements
      this.validateSkillRequirements(context, violations, warnings);

      // Rule 5: Marketplace constraints
      this.validateMarketplaceConstraints(context, violations, warnings);

      // Rule 6: Maximum shifts per day
      this.validateMaxShiftsPerDay(context, violations, warnings);

      return {
        isValid: violations.length === 0,
        violations,
        warnings
      };
    } catch (error) {
      logger.error('Error validating swap:', error);
      return {
        isValid: false,
        violations: ['System error during validation'],
        warnings: []
      };
    }
  }

  /**
   * Validate 12-hour rest period between shifts
   */
  private validateRestPeriod(
    context: SwapValidationContext, 
    violations: string[], 
    warnings: string[]
  ): void {
    const { requesterShift, targetShift, requesterSchedule, targetSchedule } = context;

    // Check requester's rest periods after swap
    const requesterNewSchedule = this.simulateSwap(requesterSchedule, requesterShift, targetShift);
    const requesterViolation = this.findRestPeriodViolations(requesterNewSchedule);
    
    if (requesterViolation) {
      violations.push(`Requester would violate 12-hour rest period: ${requesterViolation}`);
    }

    // Check target's rest periods after swap
    const targetNewSchedule = this.simulateSwap(targetSchedule, targetShift, requesterShift);
    const targetViolation = this.findRestPeriodViolations(targetNewSchedule);
    
    if (targetViolation) {
      violations.push(`Target would violate 12-hour rest period: ${targetViolation}`);
    }
  }

  /**
   * Validate 6-day consecutive work rule
   */
  private validateSixDayRule(
    context: SwapValidationContext, 
    violations: string[], 
    warnings: string[]
  ): void {
    const { requesterShift, targetShift, requesterSchedule, targetSchedule } = context;

    // Check requester's consecutive days after swap
    const requesterNewSchedule = this.simulateSwap(requesterSchedule, requesterShift, targetShift);
    const requesterConsecutive = this.findMaxConsecutiveDays(requesterNewSchedule);
    
    if (requesterConsecutive > 6) {
      violations.push(`Requester would work ${requesterConsecutive} consecutive days (max 6)`);
    } else if (requesterConsecutive === 6) {
      warnings.push('Requester would reach 6-day limit');
    }

    // Check target's consecutive days after swap
    const targetNewSchedule = this.simulateSwap(targetSchedule, targetShift, requesterShift);
    const targetConsecutive = this.findMaxConsecutiveDays(targetNewSchedule);
    
    if (targetConsecutive > 6) {
      violations.push(`Target would work ${targetConsecutive} consecutive days (max 6)`);
    } else if (targetConsecutive === 6) {
      warnings.push('Target would reach 6-day limit');
    }
  }

  /**
   * Validate shift timing constraints
   */
  private validateShiftTiming(
    context: SwapValidationContext, 
    violations: string[], 
    warnings: string[]
  ): void {
    const { requesterShift, targetShift } = context;

    // Check if shifts are in the past
    const today = new Date().toISOString().split('T')[0];
    
    if (requesterShift.date < today) {
      violations.push('Cannot swap shifts that have already occurred');
    }
    
    if (targetShift.date < today) {
      violations.push('Cannot swap shifts that have already occurred');
    }

    // Check if shifts are too far in the future (30 days)
    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + 30);
    const maxDateStr = maxDate.toISOString().split('T')[0];

    if (requesterShift.date > maxDateStr || targetShift.date > maxDateStr) {
      warnings.push('Swapping shifts more than 30 days in advance');
    }
  }

  /**
   * Validate skill requirements
   */
  private validateSkillRequirements(
    context: SwapValidationContext, 
    violations: string[], 
    warnings: string[]
  ): void {
    const { requesterShift, targetShift, requesterUser, targetUser } = context;

    // Check if requester can handle target's shift
    const requesterMissingSkills = targetShift.skills.filter(
      skill => !requesterUser.skills.includes(skill)
    );
    
    if (requesterMissingSkills.length > 0) {
      violations.push(
        `Requester lacks required skills: ${requesterMissingSkills.join(', ')}`
      );
    }

    // Check if target can handle requester's shift
    const targetMissingSkills = requesterShift.skills.filter(
      skill => !targetUser.skills.includes(skill)
    );
    
    if (targetMissingSkills.length > 0) {
      violations.push(
        `Target lacks required skills: ${targetMissingSkills.join(', ')}`
      );
    }
  }

  /**
   * Validate marketplace constraints
   */
  private validateMarketplaceConstraints(
    context: SwapValidationContext, 
    violations: string[], 
    warnings: string[]
  ): void {
    const { requesterShift, targetShift, requesterUser, targetUser } = context;

    // Check if users are authorized for each other's marketplaces
    if (requesterUser.marketplace !== targetShift.marketplace) {
      warnings.push(
        `Requester moving from ${requesterUser.marketplace} to ${targetShift.marketplace} marketplace`
      );
    }

    if (targetUser.marketplace !== requesterShift.marketplace) {
      warnings.push(
        `Target moving from ${targetUser.marketplace} to ${requesterShift.marketplace} marketplace`
      );
    }
  }

  /**
   * Validate maximum shifts per day
   */
  private validateMaxShiftsPerDay(
    context: SwapValidationContext, 
    violations: string[], 
    warnings: string[]
  ): void {
    const { requesterShift, targetShift, requesterSchedule, targetSchedule } = context;

    // Check requester's shifts per day after swap
    const requesterNewSchedule = this.simulateSwap(requesterSchedule, requesterShift, targetShift);
    const requesterMaxShifts = this.findMaxShiftsPerDay(requesterNewSchedule);
    
    if (requesterMaxShifts > 1) {
      violations.push(`Requester would have ${requesterMaxShifts} shifts in one day`);
    }

    // Check target's shifts per day after swap
    const targetNewSchedule = this.simulateSwap(targetSchedule, targetShift, requesterShift);
    const targetMaxShifts = this.findMaxShiftsPerDay(targetNewSchedule);
    
    if (targetMaxShifts > 1) {
      violations.push(`Target would have ${targetMaxShifts} shifts in one day`);
    }
  }

  /**
   * Simulate a swap by replacing one shift with another in the schedule
   */
  private simulateSwap(schedule: IShift[], oldShift: IShift, newShift: IShift): IShift[] {
    return schedule.map(shift => 
      shift._id.toString() === oldShift._id.toString() ? newShift : shift
    );
  }

  /**
   * Find rest period violations in a schedule
   */
  private findRestPeriodViolations(schedule: IShift[]): string | null {
    const sortedShifts = schedule.sort((a, b) => {
      const dateCompare = a.date.localeCompare(b.date);
      if (dateCompare !== 0) return dateCompare;
      return a.startTime.localeCompare(b.startTime);
    });

    for (let i = 0; i < sortedShifts.length - 1; i++) {
      const currentShift = sortedShifts[i];
      const nextShift = sortedShifts[i + 1];

      const currentEnd = this.parseDateTime(currentShift.date, currentShift.endTime);
      const nextStart = this.parseDateTime(nextShift.date, nextShift.startTime);

      const hoursBetween = (nextStart.getTime() - currentEnd.getTime()) / (1000 * 60 * 60);

      if (hoursBetween < 12) {
        return `${currentShift.date} ${currentShift.endTime} to ${nextShift.date} ${nextShift.startTime}`;
      }
    }

    return null;
  }

  /**
   * Find maximum consecutive working days in a schedule
   */
  private findMaxConsecutiveDays(schedule: IShift[]): number {
    const workDays = new Set(schedule.map(shift => shift.date));
    const sortedDays = Array.from(workDays).sort();

    let maxConsecutive = 0;
    let currentConsecutive = 1;

    for (let i = 1; i < sortedDays.length; i++) {
      const prevDate = new Date(sortedDays[i - 1]);
      const currentDate = new Date(sortedDays[i]);
      
      const daysDiff = (currentDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24);

      if (daysDiff === 1) {
        currentConsecutive++;
      } else {
        maxConsecutive = Math.max(maxConsecutive, currentConsecutive);
        currentConsecutive = 1;
      }
    }

    return Math.max(maxConsecutive, currentConsecutive);
  }

  /**
   * Find maximum shifts per day in a schedule
   */
  private findMaxShiftsPerDay(schedule: IShift[]): number {
    const shiftsPerDay = new Map<string, number>();

    for (const shift of schedule) {
      const count = shiftsPerDay.get(shift.date) || 0;
      shiftsPerDay.set(shift.date, count + 1);
    }

    return Math.max(...Array.from(shiftsPerDay.values()), 0);
  }

  /**
   * Parse date and time into a Date object
   */
  private parseDateTime(date: string, time: string): Date {
    return new Date(`${date}T${time}:00`);
  }
}

export const businessRulesService = new BusinessRulesService();
