import mongoose from 'mongoose';
import {
  ISwapChain,
  ChainExecutionResult,
  SwapStep,
  ChainValidationResult
} from '../types';
import { SwapChain } from '../models/SwapChain';
import { SwapIntent } from '../models/SwapIntent';
import { Shift } from '../models/Shift';
import { User } from '../models/User';
import { BusinessRulesService } from './businessRulesService';
import { logger } from '../utils/logger';

export class ChainExecutionService {
  private businessRulesService: BusinessRulesService;

  constructor() {
    this.businessRulesService = new BusinessRulesService();
  }

  /**
   * Execute a fully approved swap chain atomically
   */
  async executeChain(chainId: string): Promise<ChainExecutionResult> {
    const session = await mongoose.startSession();

    try {
      logger.info(`Starting execution of swap chain: ${chainId}`);

      const result = await session.withTransaction(async () => {
        // Get the chain with all populated data
        const chain = await SwapChain.findOne({ chainId })
          .populate('participants.userId')
          .populate('participants.originalShiftId')
          .populate('participants.desiredShiftId')
          .session(session);

        if (!chain) {
          throw new Error('Swap chain not found');
        }

        // Validate chain is ready for execution
        const validationResult = await this.validateChainForExecution(chain);
        if (!validationResult.isValid) {
          throw new Error(`Chain validation failed: ${validationResult.violations.join(', ')}`);
        }

        // Update chain status to executing
        chain.status = 'executing';
        await chain.save({ session });

        // Execute swap steps in order
        const executedSteps: SwapStep[] = [];
        const originalShiftStates = new Map<string, any>();

        try {
          // Store original shift states for rollback
          for (const step of chain.swapSteps) {
            const shift = await Shift.findById(step.shiftId).session(session);
            if (shift) {
              originalShiftStates.set(step.shiftId, {
                userId: shift.userId,
                status: shift.status
              });
            }
          }

          // Execute each step
          for (const step of chain.swapSteps.sort((a, b) => a.stepOrder - b.stepOrder)) {
            await this.executeSwapStep(step, session);

            // Mark step as executed
            step.executed = true;
            step.executedAt = new Date();
            executedSteps.push(step);

            logger.info(`Executed swap step: ${step.stepId}`);
          }

          // Update all related swap intents to 'matched'
          await this.updateRelatedIntents(chain, session);

          // Mark chain as executed
          chain.status = 'executed';
          await chain.save({ session });

          logger.info(`Successfully executed swap chain: ${chainId}`);

          return {
            success: true,
            executedSteps,
            rollbackRequired: false
          };

        } catch (stepError) {
          logger.error(`Error executing swap step in chain ${chainId}:`, stepError);

          // Rollback all executed steps
          await this.rollbackExecutedSteps(originalShiftStates, session);

          // Mark chain as failed
          chain.status = 'failed';
          await chain.save({ session });

          return {
            success: false,
            executedSteps,
            rollbackRequired: true,
            error: stepError instanceof Error ? stepError.message : 'Unknown error'
          };
        }
      });

      return result;

    } catch (error) {
      logger.error(`Error executing swap chain ${chainId}:`, error);

      return {
        success: false,
        executedSteps: [],
        rollbackRequired: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    } finally {
      await session.endSession();
    }
  }

  /**
   * Validate that a chain is ready for execution
   */
  private async validateChainForExecution(chain: ISwapChain): Promise<ChainValidationResult> {
    const violations: string[] = [];
    const warnings: string[] = [];

    try {
      // Check chain status
      if (chain.status !== 'approved') {
        violations.push('Chain must be in approved status for execution');
      }

      // Check if chain is expired
      if (new Date() > chain.expiresAt) {
        violations.push('Chain has expired');
      }

      // Check if all participants have approved
      const isFullyApproved = chain.participants.every(participant =>
        participant.approvalStatus === 'approved'
      );
      if (!isFullyApproved) {
        violations.push('Not all participants have approved the chain');
      }

      // Check if any participant has rejected
      const hasRejections = chain.participants.some(participant =>
        participant.approvalStatus === 'rejected'
      );
      if (hasRejections) {
        violations.push('One or more participants have rejected the chain');
      }

      // Validate each swap step
      for (const step of chain.swapSteps) {
        const stepValidation = await this.validateSwapStep(step);
        if (!stepValidation.isValid) {
          violations.push(...stepValidation.violations.map(v => `Step ${step.stepOrder}: ${v}`));
        }
        warnings.push(...stepValidation.warnings.map(w => `Step ${step.stepOrder}: ${w}`));
      }

      // Check for shift conflicts
      const shiftConflicts = await this.checkShiftConflicts(chain);
      if (shiftConflicts.length > 0) {
        violations.push(...shiftConflicts);
      }

      return {
        isValid: violations.length === 0,
        violations,
        warnings,
        participantValidations: new Map() // Placeholder
      };

    } catch (error) {
      logger.error('Error validating chain for execution:', error);
      return {
        isValid: false,
        violations: ['System error during validation'],
        warnings: [],
        participantValidations: new Map()
      };
    }
  }

  /**
   * Validate a single swap step
   */
  private async validateSwapStep(step: SwapStep): Promise<{ isValid: boolean; violations: string[]; warnings: string[] }> {
    try {
      const fromUser = await User.findById(step.fromUserId);
      const toUser = await User.findById(step.toUserId);
      const shift = await Shift.findById(step.shiftId);

      if (!fromUser || !toUser || !shift) {
        return {
          isValid: false,
          violations: ['Missing user or shift data'],
          warnings: []
        };
      }

      // Verify shift ownership
      if (shift.userId !== step.fromUserId) {
        return {
          isValid: false,
          violations: ['User does not own the shift being swapped'],
          warnings: []
        };
      }

      // Check if shift is in the past
      const shiftDate = new Date(shift.date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (shiftDate < today) {
        return {
          isValid: false,
          violations: ['Cannot swap shifts that have already occurred'],
          warnings: []
        };
      }

      // Check skill compatibility
      const missingSkills = shift.skills.filter(skill => !toUser.skills.includes(skill));
      if (missingSkills.length > 0) {
        return {
          isValid: false,
          violations: [`Target user lacks required skills: ${missingSkills.join(', ')}`],
          warnings: []
        };
      }

      return {
        isValid: true,
        violations: [],
        warnings: []
      };

    } catch (error) {
      logger.error('Error validating swap step:', error);
      return {
        isValid: false,
        violations: ['System error during step validation'],
        warnings: []
      };
    }
  }

  /**
   * Check for shift conflicts in the chain
   */
  private async checkShiftConflicts(chain: ISwapChain): Promise<string[]> {
    const conflicts: string[] = [];

    try {
      // Check if any shifts are already involved in other pending swaps
      const shiftIds = chain.swapSteps.map(step => step.shiftId);

      const conflictingChains = await SwapChain.find({
        chainId: { $ne: chain.chainId },
        status: { $in: ['pending', 'approved', 'executing'] },
        'swapSteps.shiftId': { $in: shiftIds }
      });

      if (conflictingChains.length > 0) {
        conflicts.push(`Shifts are involved in other pending chains: ${conflictingChains.map(c => c.chainId).join(', ')}`);
      }

      // Check if shifts have been modified since chain creation
      for (const step of chain.swapSteps) {
        const shift = await Shift.findById(step.shiftId);
        if (!shift) {
          conflicts.push(`Shift ${step.shiftId} no longer exists`);
          continue;
        }

        if (shift.status === 'cancelled') {
          conflicts.push(`Shift ${step.shiftId} has been cancelled`);
        }

        if (shift.userId !== step.fromUserId) {
          conflicts.push(`Shift ${step.shiftId} ownership has changed`);
        }
      }

    } catch (error) {
      logger.error('Error checking shift conflicts:', error);
      conflicts.push('System error during conflict check');
    }

    return conflicts;
  }

  /**
   * Execute a single swap step
   */
  private async executeSwapStep(step: SwapStep, session: mongoose.ClientSession): Promise<void> {
    try {
      // Get the shift to be transferred
      const shift = await Shift.findById(step.shiftId).session(session);

      if (!shift) {
        throw new Error(`Shift ${step.shiftId} not found`);
      }

      // Verify current ownership
      if (shift.userId !== step.fromUserId) {
        throw new Error(`Shift ${step.shiftId} is not owned by user ${step.fromUserId}`);
      }

      // Transfer ownership
      shift.userId = step.toUserId;
      shift.status = 'confirmed';
      await shift.save({ session });

      logger.info(`Transferred shift ${step.shiftId} from ${step.fromUserId} to ${step.toUserId}`);

    } catch (error) {
      logger.error(`Error executing swap step ${step.stepId}:`, error);
      throw error;
    }
  }

  /**
   * Rollback executed steps in case of failure
   */
  private async rollbackExecutedSteps(
    originalStates: Map<string, any>,
    session: mongoose.ClientSession
  ): Promise<void> {
    try {
      logger.info('Rolling back executed swap steps');

      for (const [shiftId, originalState] of originalStates.entries()) {
        const shift = await Shift.findById(shiftId).session(session);
        if (shift) {
          shift.userId = originalState.userId;
          shift.status = originalState.status;
          await shift.save({ session });
        }
      }

      logger.info('Successfully rolled back all executed steps');

    } catch (error) {
      logger.error('Error during rollback:', error);
      throw new Error('Failed to rollback executed steps');
    }
  }

  /**
   * Update related swap intents to 'matched' status
   */
  private async updateRelatedIntents(chain: ISwapChain, session: mongoose.ClientSession): Promise<void> {
    try {
      const shiftIds = chain.swapSteps.map(step => step.shiftId);

      await SwapIntent.updateMany(
        { originalShiftId: { $in: shiftIds }, status: 'active' },
        { status: 'matched' },
        { session }
      );

      logger.info(`Updated ${shiftIds.length} swap intents to matched status`);

    } catch (error) {
      logger.error('Error updating related intents:', error);
      throw error;
    }
  }

  /**
   * Get execution status for a chain
   */
  async getExecutionStatus(chainId: string): Promise<{
    status: string;
    executedSteps: number;
    totalSteps: number;
    lastExecutedAt?: Date;
    error?: string;
  }> {
    try {
      const chain = await SwapChain.findOne({ chainId });

      if (!chain) {
        throw new Error('Chain not found');
      }

      const executedSteps = chain.swapSteps.filter(step => step.executed).length;
      const totalSteps = chain.swapSteps.length;
      const lastExecutedStep = chain.swapSteps
        .filter(step => step.executed && step.executedAt)
        .sort((a, b) => (b.executedAt?.getTime() || 0) - (a.executedAt?.getTime() || 0))[0];

      return {
        status: chain.status,
        executedSteps,
        totalSteps,
        lastExecutedAt: lastExecutedStep?.executedAt
      };

    } catch (error) {
      logger.error('Error getting execution status:', error);
      throw error;
    }
  }
}

export default ChainExecutionService;
