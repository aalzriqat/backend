import {
  ISwapIntent,
  IUser,
  IShift,
  IUserPreferences,
  ISmartMatch,
  MatchFactor,
  MatchStatus,
  BusinessRuleResult,
  SwapValidationContext,
  Skill,
  Marketplace,
  TimePreference
} from '../types';
import { SwapIntent, User, Shift, UserPreferences } from '../models';
import { businessRulesService } from './businessRulesService';
import { logger } from '../utils/logger';

export class SmartMatchingService {

  /**
   * Find smart matches for a given swap intent
   */
  async findMatches(intentId: string): Promise<ISmartMatch[]> {
    try {
      const intent = await SwapIntent.findById(intentId)
        .populate('userId')
        .populate('originalShiftId');

      if (!intent || intent.status !== 'active') {
        throw new Error('Intent not found or not active');
      }

      // Get all other active intents
      const otherIntents = await SwapIntent.find({
        _id: { $ne: intentId },
        status: 'active',
        expiresAt: { $gt: new Date() }
      }).populate('userId').populate('originalShiftId');

      const matches: ISmartMatch[] = [];

      for (const targetIntent of otherIntents) {
        const match = await this.calculateMatch(intent, targetIntent);
        if (match && match.matchScore >= 60) { // Minimum threshold
          matches.push(match);
        }
      }

      // Sort by match score (highest first)
      return matches.sort((a, b) => b.matchScore - a.matchScore);
    } catch (error) {
      logger.error('Error finding matches:', error);
      throw error;
    }
  }

  /**
   * Calculate match score between two swap intents
   */
  async calculateMatch(
    requesterIntent: ISwapIntent,
    targetIntent: ISwapIntent
  ): Promise<ISmartMatch | null> {
    try {
      const requesterShift = requesterIntent.originalShiftId as any;
      const targetShift = targetIntent.originalShiftId as any;
      const requesterUser = requesterIntent.userId as any;
      const targetUser = targetIntent.userId as any;

      // Get user preferences
      let requesterPrefs = await UserPreferences.findOne({ userId: requesterUser._id });
      if (!requesterPrefs) {
        requesterPrefs = new UserPreferences({
          userId: requesterUser._id,
          autoMatchEnabled: true,
          preferredTimeSlots: ['any'],
          preferredMarketplaces: [],
          skillFlexibility: false,
          maxSwapsPerWeek: 2,
          notificationSettings: { email: true, push: true, sms: false },
          blacklistedUsers: []
        });
        await requesterPrefs.save();
      }

      let targetPrefs = await UserPreferences.findOne({ userId: targetUser._id });
      if (!targetPrefs) {
        targetPrefs = new UserPreferences({
          userId: targetUser._id,
          autoMatchEnabled: true,
          preferredTimeSlots: ['any'],
          preferredMarketplaces: [],
          skillFlexibility: false,
          maxSwapsPerWeek: 2,
          notificationSettings: { email: true, push: true, sms: false },
          blacklistedUsers: []
        });
        await targetPrefs.save();
      }

      // Check blacklists
      if (requesterPrefs.blacklistedUsers.includes(targetUser._id) ||
          targetPrefs.blacklistedUsers.includes(requesterUser._id)) {
        return null;
      }

      // Validate business rules
      const validation = await businessRulesService.validateSwap({
        requesterShift,
        targetShift,
        requesterUser,
        targetUser,
        requesterSchedule: await this.getUserSchedule(requesterUser._id),
        targetSchedule: await this.getUserSchedule(targetUser._id)
      });

      if (!validation.isValid) {
        return null; // Skip if business rules violated
      }

      // Calculate individual factor scores
      const factors = await this.calculateMatchFactors(
        requesterIntent,
        targetIntent,
        requesterShift,
        targetShift,
        requesterUser,
        targetUser,
        validation
      );

      // Calculate overall score
      const matchScore = this.calculateOverallScore(factors);

      // Determine compatibility level
      const compatibility = this.getCompatibilityLevel(matchScore);

      // Generate reason
      const reason = this.generateMatchReason(factors);

      return {
        id: `${requesterIntent._id}_${targetIntent._id}`,
        requesterIntentId: requesterIntent._id.toString(),
        targetIntentId: targetIntent._id.toString(),
        matchScore,
        compatibility,
        factors,
        reason,
        calculatedAt: new Date(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
      };
    } catch (error) {
      logger.error('Error calculating match:', error);
      return null;
    }
  }

  /**
   * Calculate individual matching factors
   */
  private async calculateMatchFactors(
    requesterIntent: ISwapIntent,
    targetIntent: ISwapIntent,
    requesterShift: IShift,
    targetShift: IShift,
    requesterUser: IUser,
    targetUser: IUser,
    validation: BusinessRuleResult
  ): Promise<MatchFactor[]> {
    const factors: MatchFactor[] = [];

    // Skill matching
    const skillMatch = this.calculateSkillMatch(
      requesterShift.skills,
      targetShift.skills,
      requesterUser.skills,
      targetUser.skills,
      requesterIntent.skillFlexibility,
      targetIntent.skillFlexibility
    );
    factors.push(skillMatch);

    // Marketplace matching
    const marketplaceMatch = this.calculateMarketplaceMatch(
      requesterShift.marketplace,
      targetShift.marketplace,
      requesterIntent.preferredMarketplaces,
      targetIntent.preferredMarketplaces
    );
    factors.push(marketplaceMatch);

    // Time preference matching
    const timeMatch = this.calculateTimeMatch(
      requesterShift,
      targetShift,
      requesterIntent.preferredTimeSlots,
      targetIntent.preferredTimeSlots
    );
    factors.push(timeMatch);

    // Business rules compliance
    const rulesMatch = this.calculateRulesCompliance(validation);
    factors.push(rulesMatch);

    // Priority matching
    const priorityMatch = this.calculatePriorityMatch(
      requesterIntent.priority,
      targetIntent.priority
    );
    factors.push(priorityMatch);

    return factors;
  }

  /**
   * Calculate skill compatibility score
   */
  private calculateSkillMatch(
    requesterShiftSkills: Skill[],
    targetShiftSkills: Skill[],
    requesterUserSkills: Skill[],
    targetUserSkills: Skill[],
    requesterFlexibility: boolean,
    targetFlexibility: boolean
  ): MatchFactor {
    // Check if users can handle each other's shifts
    const requesterCanHandleTarget = targetShiftSkills.every(skill =>
      requesterUserSkills.includes(skill)
    );
    const targetCanHandleRequester = requesterShiftSkills.every(skill =>
      targetUserSkills.includes(skill)
    );

    let status: MatchStatus;
    let description: string;
    let weight = 0.3; // 30% of total score

    if (requesterCanHandleTarget && targetCanHandleRequester) {
      status = 'positive';
      description = 'Perfect skill match - both users qualified for each other\'s shifts';
    } else if ((requesterCanHandleTarget || targetCanHandleRequester) &&
               (requesterFlexibility || targetFlexibility)) {
      status = 'positive';
      description = 'Good skill match with cross-training opportunity';
      weight = 0.25; // Slightly lower weight for cross-training
    } else if (requesterFlexibility && targetFlexibility) {
      status = 'neutral';
      description = 'Cross-training opportunity - both users open to skill development';
      weight = 0.2;
    } else {
      status = 'negative';
      description = 'Skill mismatch - users not qualified for each other\'s shifts';
      weight = 0.1;
    }

    return {
      factor: 'Skill Compatibility',
      status,
      description,
      weight
    };
  }

  /**
   * Calculate marketplace compatibility
   */
  private calculateMarketplaceMatch(
    requesterMarketplace: Marketplace,
    targetMarketplace: Marketplace,
    requesterPreferred: Marketplace[],
    targetPreferred: Marketplace[]
  ): MatchFactor {
    let status: MatchStatus;
    let description: string;
    const weight = 0.2; // 20% of total score

    if (requesterMarketplace === targetMarketplace) {
      status = 'positive';
      description = `Same marketplace (${requesterMarketplace}) - seamless transition`;
    } else if (requesterPreferred.includes(targetMarketplace) &&
               targetPreferred.includes(requesterMarketplace)) {
      status = 'positive';
      description = 'Different marketplaces but both preferred by users';
    } else if (requesterPreferred.includes(targetMarketplace) ||
               targetPreferred.includes(requesterMarketplace)) {
      status = 'neutral';
      description = 'One user prefers the other\'s marketplace';
    } else {
      status = 'neutral';
      description = `Different marketplaces (${requesterMarketplace} ↔ ${targetMarketplace})`;
    }

    return {
      factor: 'Marketplace Match',
      status,
      description,
      weight
    };
  }

  /**
   * Calculate time preference match
   */
  private calculateTimeMatch(
    requesterShift: IShift,
    targetShift: IShift,
    requesterPreferred: TimePreference[],
    targetPreferred: TimePreference[]
  ): MatchFactor {
    const requesterShiftType = this.getShiftTimeType(requesterShift);
    const targetShiftType = this.getShiftTimeType(targetShift);

    let status: MatchStatus;
    let description: string;
    const weight = 0.25; // 25% of total score

    const requesterWantsTarget = requesterPreferred.includes(targetShiftType) ||
                                requesterPreferred.includes('any');
    const targetWantsRequester = targetPreferred.includes(requesterShiftType) ||
                                targetPreferred.includes('any');

    if (requesterWantsTarget && targetWantsRequester) {
      status = 'positive';
      description = 'Perfect time preference match - both users want each other\'s shifts';
    } else if (requesterWantsTarget || targetWantsRequester) {
      status = 'positive';
      description = 'Good time preference match - one user gets preferred time';
    } else {
      status = 'neutral';
      description = 'Time preferences don\'t align but swap still beneficial';
    }

    return {
      factor: 'Time Preference',
      status,
      description,
      weight
    };
  }

  /**
   * Calculate business rules compliance
   */
  private calculateRulesCompliance(validation: BusinessRuleResult): MatchFactor {
    let status: MatchStatus;
    let description: string;
    const weight = 0.2; // 20% of total score

    if (validation.violations.length === 0 && validation.warnings.length === 0) {
      status = 'positive';
      description = 'Full compliance with all business rules';
    } else if (validation.violations.length === 0) {
      status = 'neutral';
      description = `Minor warnings: ${validation.warnings.join(', ')}`;
    } else {
      status = 'negative';
      description = `Rule violations: ${validation.violations.join(', ')}`;
    }

    return {
      factor: 'Business Rules',
      status,
      description,
      weight
    };
  }

  /**
   * Calculate priority-based matching
   */
  private calculatePriorityMatch(
    requesterPriority: number,
    targetPriority: number
  ): MatchFactor {
    const avgPriority = (requesterPriority + targetPriority) / 2;
    let status: MatchStatus;
    let description: string;
    const weight = 0.05; // 5% of total score

    if (avgPriority >= 4) {
      status = 'positive';
      description = 'High priority swap - urgent need for both users';
    } else if (avgPriority >= 3) {
      status = 'neutral';
      description = 'Medium priority swap';
    } else {
      status = 'neutral';
      description = 'Low priority swap';
    }

    return {
      factor: 'Priority Level',
      status,
      description,
      weight
    };
  }

  /**
   * Calculate overall match score from factors
   */
  private calculateOverallScore(factors: MatchFactor[]): number {
    let totalScore = 0;
    let totalWeight = 0;

    for (const factor of factors) {
      let factorScore = 0;

      switch (factor.status) {
        case 'positive':
          factorScore = 100;
          break;
        case 'neutral':
          factorScore = 70;
          break;
        case 'negative':
          factorScore = 30;
          break;
      }

      totalScore += factorScore * factor.weight;
      totalWeight += factor.weight;
    }

    return Math.round(totalScore / totalWeight);
  }

  /**
   * Get compatibility level based on score
   */
  private getCompatibilityLevel(score: number): 'Perfect Match' | 'High Match' | 'Good Match' | 'Fair Match' {
    if (score >= 90) return 'Perfect Match';
    if (score >= 80) return 'High Match';
    if (score >= 70) return 'Good Match';
    return 'Fair Match';
  }

  /**
   * Generate human-readable match reason
   */
  private generateMatchReason(factors: MatchFactor[]): string {
    const positiveFactors = factors.filter(f => f.status === 'positive');
    const reasons = positiveFactors.map(f => f.description);

    if (reasons.length === 0) {
      return 'Basic compatibility with room for improvement';
    }

    return reasons.slice(0, 2).join(', ');
  }

  /**
   * Get shift time type from shift data
   */
  private getShiftTimeType(shift: IShift): TimePreference {
    const startHour = parseInt(shift.startTime.split(':')[0]);

    if (startHour >= 6 && startHour < 12) return 'morning';
    if (startHour >= 12 && startHour < 18) return 'day';
    return 'evening';
  }

  /**
   * Get user's schedule for validation
   */
  private async getUserSchedule(userId: string): Promise<IShift[]> {
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    const oneWeekFromNow = new Date();
    oneWeekFromNow.setDate(oneWeekFromNow.getDate() + 7);

    return Shift.find({
      userId,
      date: {
        $gte: oneWeekAgo.toISOString().split('T')[0],
        $lte: oneWeekFromNow.toISOString().split('T')[0]
      }
    }).sort({ date: 1, startTime: 1 });
  }
}

export const smartMatchingService = new SmartMatchingService();
