import {
  ISwapIntent,
  ISwapChain,
  SwapCycle,
  ChainDetectionOptions,
  ChainValidationResult,
  ChainParticipant,
  SwapStep,
  BusinessRuleResult,
  TimePreference
} from '../types';
import { SwapIntent } from '../models/SwapIntent';
import { SwapChain } from '../models/SwapChain';
import { Shift } from '../models/Shift';
import { User } from '../models/User';
import { BusinessRulesService } from './businessRulesService';
import { logger } from '../utils/logger';

export class ChainDetectionService {
  private businessRulesService: BusinessRulesService;

  constructor() {
    this.businessRulesService = new BusinessRulesService();
  }

  /**
   * Find all possible swap chains for a given intent
   */
  async findSwapChains(
    intentId: string,
    options: ChainDetectionOptions = {
      maxChainLength: 5,
      minChainScore: 60,
      includePartialMatches: true,
      timeWindowDays: 30
    }
  ): Promise<ISwapChain[]> {
    try {
      logger.info(`Finding swap chains for intent: ${intentId}`);

      // Get the source intent
      const sourceIntent = await SwapIntent.findById(intentId)
        .populate('userId')
        .populate('originalShiftId');

      if (!sourceIntent || sourceIntent.status !== 'active') {
        throw new Error('Source intent not found or not active');
      }

      // Get all other active intents within time window
      const timeWindow = new Date();
      timeWindow.setDate(timeWindow.getDate() + options.timeWindowDays);

      const allIntents = await SwapIntent.find({
        _id: { $ne: intentId },
        status: 'active',
        expiresAt: { $gt: new Date(), $lte: timeWindow }
      }).populate('userId').populate('originalShiftId');

      logger.info(`Found ${allIntents.length} potential intents for chain detection`);

      // Build intent graph
      const intentGraph = await this.buildIntentGraph([sourceIntent, ...allIntents]);

      // Find cycles and paths
      const chains: ISwapChain[] = [];

      // Find cycles (circular chains)
      const cycles = await this.detectCycles(sourceIntent, intentGraph, options);
      for (const cycle of cycles) {
        const chain = await this.createChainFromCycle(cycle, sourceIntent);
        if (chain && chain.chainScore >= options.minChainScore) {
          chains.push(chain);
        }
      }

      // Find linear paths (non-circular chains)
      if (options.includePartialMatches) {
        const paths = await this.findLinearPaths(sourceIntent, intentGraph, options);
        for (const path of paths) {
          const chain = await this.createChainFromPath(path, sourceIntent);
          if (chain && chain.chainScore >= options.minChainScore) {
            chains.push(chain);
          }
        }
      }

      // Sort chains by score (highest first)
      chains.sort((a, b) => b.chainScore - a.chainScore);

      logger.info(`Found ${chains.length} potential swap chains`);
      return chains.slice(0, 10); // Return top 10 chains

    } catch (error) {
      logger.error('Error finding swap chains:', error);
      throw error;
    }
  }

  /**
   * Build a graph representation of intent relationships
   */
  private async buildIntentGraph(intents: ISwapIntent[]): Promise<Map<string, ISwapIntent[]>> {
    const graph = new Map<string, ISwapIntent[]>();

    for (const intent of intents) {
      const compatibleIntents: ISwapIntent[] = [];

      for (const otherIntent of intents) {
        if (intent._id.toString() === otherIntent._id.toString()) continue;

        // Check if intent A can satisfy intent B's requirements
        const isCompatible = await this.areIntentsCompatible(intent, otherIntent);
        if (isCompatible) {
          compatibleIntents.push(otherIntent);
        }
      }

      graph.set(intent._id.toString(), compatibleIntents);
    }

    return graph;
  }

  /**
   * Check if two intents are compatible for chaining
   */
  private async areIntentsCompatible(intentA: ISwapIntent, intentB: ISwapIntent): Promise<boolean> {
    try {
      // Intent A's shift should match Intent B's preferences
      const shiftA = intentA.originalShiftId as any;
      const userB = intentB.userId as any;

      // Basic compatibility checks
      if (!shiftA || !userB) return false;

      // Check marketplace preferences
      if (intentB.preferredMarketplaces.length > 0 &&
          !intentB.preferredMarketplaces.includes(shiftA.marketplace)) {
        return false;
      }

      // Check time slot preferences
      const shiftTimeSlot = this.getTimeSlot(shiftA.startTime) as TimePreference;
      if (intentB.preferredTimeSlots.length > 0 &&
          !intentB.preferredTimeSlots.includes('any') &&
          !intentB.preferredTimeSlots.includes(shiftTimeSlot)) {
        return false;
      }

      // Check skill compatibility
      if (!intentB.skillFlexibility) {
        const hasRequiredSkills = shiftA.skills.every((skill: string) =>
          userB.skills.includes(skill)
        );
        if (!hasRequiredSkills) return false;
      }

      // Check date constraints
      const daysDifference = Math.abs(
        new Date(shiftA.date).getTime() - new Date().getTime()
      ) / (1000 * 60 * 60 * 24);

      if (daysDifference > intentB.maxDaysOut) return false;

      return true;
    } catch (error) {
      logger.error('Error checking intent compatibility:', error);
      return false;
    }
  }

  /**
   * Detect circular swap opportunities (cycles)
   */
  private async detectCycles(
    sourceIntent: ISwapIntent,
    graph: Map<string, ISwapIntent[]>,
    options: ChainDetectionOptions
  ): Promise<SwapCycle[]> {
    const cycles: SwapCycle[] = [];
    const visited = new Set<string>();
    const path: ISwapIntent[] = [];

    await this.dfsForCycles(
      sourceIntent,
      sourceIntent._id.toString(),
      graph,
      visited,
      path,
      cycles,
      options.maxChainLength
    );

    return cycles;
  }

  /**
   * Depth-first search for cycles
   */
  private async dfsForCycles(
    currentIntent: ISwapIntent,
    targetId: string,
    graph: Map<string, ISwapIntent[]>,
    visited: Set<string>,
    path: ISwapIntent[],
    cycles: SwapCycle[],
    maxLength: number
  ): Promise<void> {
    if (path.length >= maxLength) return;

    const currentId = currentIntent._id.toString();
    path.push(currentIntent);

    const neighbors = graph.get(currentId) || [];

    for (const neighbor of neighbors) {
      const neighborId = neighbor._id.toString();

      if (neighborId === targetId && path.length >= 3) {
        // Found a cycle back to source
        const cycle = await this.createCycleFromPath([...path]);
        if (cycle) {
          cycles.push(cycle);
        }
      } else if (!visited.has(neighborId) && !path.some(p => p._id.toString() === neighborId)) {
        await this.dfsForCycles(neighbor, targetId, graph, visited, path, cycles, maxLength);
      }
    }

    path.pop();
  }

  /**
   * Find linear paths (non-circular chains)
   */
  private async findLinearPaths(
    sourceIntent: ISwapIntent,
    graph: Map<string, ISwapIntent[]>,
    options: ChainDetectionOptions
  ): Promise<ISwapIntent[][]> {
    const paths: ISwapIntent[][] = [];
    const visited = new Set<string>();

    await this.dfsForPaths(
      sourceIntent,
      graph,
      visited,
      [sourceIntent],
      paths,
      options.maxChainLength
    );

    return paths;
  }

  /**
   * Depth-first search for linear paths
   */
  private async dfsForPaths(
    currentIntent: ISwapIntent,
    graph: Map<string, ISwapIntent[]>,
    visited: Set<string>,
    currentPath: ISwapIntent[],
    allPaths: ISwapIntent[][],
    maxLength: number
  ): Promise<void> {
    if (currentPath.length >= maxLength) {
      if (currentPath.length >= 3) {
        allPaths.push([...currentPath]);
      }
      return;
    }

    const currentId = currentIntent._id.toString();
    visited.add(currentId);

    const neighbors = graph.get(currentId) || [];

    for (const neighbor of neighbors) {
      const neighborId = neighbor._id.toString();

      if (!visited.has(neighborId)) {
        currentPath.push(neighbor);
        await this.dfsForPaths(neighbor, graph, visited, currentPath, allPaths, maxLength);
        currentPath.pop();
      }
    }

    visited.delete(currentId);
  }

  /**
   * Create a SwapCycle from a path of intents
   */
  private async createCycleFromPath(path: ISwapIntent[]): Promise<SwapCycle | null> {
    try {
      const participants = path.map(intent => intent.userId.toString());
      const shifts = path.map(intent => intent.originalShiftId.toString());

      // Calculate cycle score
      const cycleScore = await this.calculateCycleScore(path);

      // Validate the cycle
      const validation = await this.validateCyclePath(path);

      return {
        participants,
        shifts,
        cycleScore,
        isValid: validation.isValid,
        violations: validation.violations
      };
    } catch (error) {
      logger.error('Error creating cycle from path:', error);
      return null;
    }
  }

  /**
   * Create a SwapChain from a SwapCycle
   */
  private async createChainFromCycle(cycle: SwapCycle, sourceIntent: ISwapIntent): Promise<ISwapChain | null> {
    try {
      if (!cycle.isValid) return null;

      const participants: ChainParticipant[] = [];
      const swapSteps: SwapStep[] = [];

      // Build participants and steps
      for (let i = 0; i < cycle.participants.length; i++) {
        const currentUserId = cycle.participants[i];
        const nextIndex = (i + 1) % cycle.participants.length;
        const nextUserId = cycle.participants[nextIndex];
        const shiftId = cycle.shifts[i];

        participants.push({
          userId: currentUserId,
          originalShiftId: shiftId,
          desiredShiftId: cycle.shifts[nextIndex],
          approvalStatus: 'pending'
        });

        swapSteps.push({
          stepId: '', // Will be generated by pre-save middleware
          fromUserId: currentUserId,
          toUserId: nextUserId,
          shiftId: shiftId,
          stepOrder: i + 1,
          businessRuleValidation: { isValid: true, violations: [], warnings: [] },
          executed: false
        });
      }

      const chain = new SwapChain({
        participants,
        swapSteps,
        chainScore: cycle.cycleScore,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        approvals: participants.map(p => ({
          userId: p.userId,
          status: 'pending' as const
        })),
        executionOrder: swapSteps.map((_, index) => index + 1),
        initiatorUserId: sourceIntent.userId.toString()
      });

      return chain;
    } catch (error) {
      logger.error('Error creating chain from cycle:', error);
      return null;
    }
  }

  /**
   * Create a SwapChain from a linear path
   */
  private async createChainFromPath(path: ISwapIntent[], sourceIntent: ISwapIntent): Promise<ISwapChain | null> {
    // Similar implementation to createChainFromCycle but for linear paths
    // This would handle non-circular chains
    return null; // Placeholder for now
  }

  /**
   * Calculate score for a cycle
   */
  private async calculateCycleScore(path: ISwapIntent[]): Promise<number> {
    let totalScore = 0;
    let validPairs = 0;

    for (let i = 0; i < path.length; i++) {
      const current = path[i];
      const next = path[(i + 1) % path.length];

      // Calculate compatibility score for each pair
      const pairScore = await this.calculatePairCompatibilityScore(current, next);
      if (pairScore > 0) {
        totalScore += pairScore;
        validPairs++;
      }
    }

    return validPairs > 0 ? Math.round(totalScore / validPairs) : 0;
  }

  /**
   * Calculate compatibility score between two intents (simplified version)
   */
  private async calculatePairCompatibilityScore(intentA: ISwapIntent, intentB: ISwapIntent): Promise<number> {
    try {
      let score = 0;
      const maxScore = 100;

      // Get shift and user data
      const shiftA = await Shift.findById(intentA.originalShiftId);
      const userB = await User.findById(intentB.userId);

      if (!shiftA || !userB) return 0;

      // Base compatibility (if they can swap at all)
      const isCompatible = await this.areIntentsCompatible(intentA, intentB);
      if (!isCompatible) return 0;

      // Start with base score
      score = 50;

      // Marketplace preference match (+20 points)
      if (intentB.preferredMarketplaces.length === 0 ||
          intentB.preferredMarketplaces.includes(shiftA.marketplace)) {
        score += 20;
      }

      // Time slot preference match (+20 points)
      const shiftTimeSlot = this.getTimeSlot(shiftA.startTime) as TimePreference;
      if (intentB.preferredTimeSlots.length === 0 ||
          intentB.preferredTimeSlots.includes('any') ||
          intentB.preferredTimeSlots.includes(shiftTimeSlot)) {
        score += 20;
      }

      // Skill match bonus (+10 points)
      if (intentB.skillFlexibility ||
          shiftA.skills.every(skill => userB.skills.includes(skill))) {
        score += 10;
      }

      return Math.min(score, maxScore);
    } catch (error) {
      logger.error('Error calculating pair compatibility score:', error);
      return 0;
    }
  }

  /**
   * Validate a cycle path for business rules
   */
  private async validateCyclePath(path: ISwapIntent[]): Promise<{ isValid: boolean; violations: string[] }> {
    const violations: string[] = [];

    // Validate each swap in the cycle
    for (let i = 0; i < path.length; i++) {
      const current = path[i];
      const next = path[(i + 1) % path.length];

      try {
        const currentShift = await Shift.findById(current.originalShiftId);
        const nextShift = await Shift.findById(next.originalShiftId);
        const currentUser = await User.findById(current.userId);
        const nextUser = await User.findById(next.userId);

        if (!currentShift || !nextShift || !currentUser || !nextUser) {
          violations.push(`Missing data for swap step ${i + 1}`);
          continue;
        }

        // Get user schedules
        const currentSchedule = await Shift.find({ userId: currentUser._id });
        const nextSchedule = await Shift.find({ userId: nextUser._id });

        // Validate business rules for this swap
        const validation = await this.businessRulesService.validateSwap({
          requesterShift: currentShift,
          targetShift: nextShift,
          requesterUser: currentUser,
          targetUser: nextUser,
          requesterSchedule: currentSchedule,
          targetSchedule: nextSchedule
        });

        if (!validation.isValid) {
          violations.push(...validation.violations.map(v => `Step ${i + 1}: ${v}`));
        }
      } catch (error) {
        violations.push(`Error validating step ${i + 1}: ${error}`);
      }
    }

    return {
      isValid: violations.length === 0,
      violations
    };
  }

  /**
   * Get time slot from start time
   */
  private getTimeSlot(startTime: string): string {
    const hour = parseInt(startTime.split(':')[0]);
    if (hour >= 6 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 18) return 'day';
    if (hour >= 18 || hour < 6) return 'evening';
    return 'any';
  }
}

export default ChainDetectionService;
