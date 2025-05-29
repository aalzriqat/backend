import { Request, Response } from 'express';
import { ChainDetectionService } from '../services/chainDetectionService';
import { ChainExecutionService } from '../services/chainExecutionService';
import { SwapChain } from '../models/SwapChain';
import { SwapIntent } from '../models/SwapIntent';
import { logger } from '../utils/logger';

const chainDetectionService = new ChainDetectionService();
const chainExecutionService = new ChainExecutionService();

/**
 * Find swap chains for a given intent
 * POST /api/swap-chains/detect/:intentId
 */
export const detectSwapChains = async (req: Request, res: Response): Promise<void> => {
  try {
    const { intentId } = req.params;
    const {
      maxChainLength = 5,
      minChainScore = 60,
      includePartialMatches = true,
      timeWindowDays = 30
    } = req.body;

    logger.info(`Detecting swap chains for intent: ${intentId}`);

    const chains = await chainDetectionService.findSwapChains(intentId, {
      maxChainLength,
      minChainScore,
      includePartialMatches,
      timeWindowDays
    });

    // Save detected chains to database
    const savedChains = [];
    for (const chain of chains) {
      try {
        const savedChain = await chain.save();
        savedChains.push(savedChain);
      } catch (saveError) {
        logger.warn(`Failed to save chain: ${saveError}`);
      }
    }

    res.json({
      success: true,
      data: {
        chains: savedChains,
        totalFound: chains.length,
        saved: savedChains.length
      },
      message: `Found ${chains.length} potential swap chains`
    });

  } catch (error) {
    logger.error('Error detecting swap chains:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to detect swap chains',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * Get swap chains for a user
 * GET /api/swap-chains/user/:userId
 */
export const getUserSwapChains = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    const { status, limit = 20, page = 1 } = req.query;

    logger.info(`Getting swap chains for user: ${userId}`);

    let query: any = { 'participants.userId': userId };

    if (status) {
      query.status = status;
    }

    const skip = (Number(page) - 1) * Number(limit);

    const chains = await SwapChain.find(query)
      .populate('participants.userId', 'firstName lastName email')
      .populate('participants.originalShiftId')
      .populate('participants.desiredShiftId')
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .skip(skip);

    const total = await SwapChain.countDocuments(query);

    res.json({
      success: true,
      data: {
        chains,
        pagination: {
          total,
          page: Number(page),
          limit: Number(limit),
          pages: Math.ceil(total / Number(limit))
        }
      }
    });

  } catch (error) {
    logger.error('Error getting user swap chains:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get user swap chains',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * Get a specific swap chain
 * GET /api/swap-chains/:chainId
 */
export const getSwapChain = async (req: Request, res: Response): Promise<void> => {
  try {
    const { chainId } = req.params;

    const chain = await SwapChain.findOne({ chainId })
      .populate('participants.userId', 'firstName lastName email skills')
      .populate('participants.originalShiftId')
      .populate('participants.desiredShiftId')
      .populate('initiatorUserId', 'firstName lastName email');

    if (!chain) {
      res.status(404).json({
        success: false,
        message: 'Swap chain not found'
      });
      return;
    }

    res.json({
      success: true,
      data: chain
    });

  } catch (error) {
    logger.error('Error getting swap chain:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get swap chain',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * Approve participation in a swap chain
 * POST /api/swap-chains/:chainId/approve
 */
export const approveChainParticipation = async (req: Request, res: Response): Promise<void> => {
  try {
    const { chainId } = req.params;
    const userId = req.user._id.toString();
    const { reason } = req.body;

    logger.info(`User ${userId} approving chain: ${chainId}`);

    const chain = await SwapChain.findOne({ chainId });

    if (!chain) {
      res.status(404).json({
        success: false,
        message: 'Swap chain not found'
      });
      return;
    }

    // Check if user is a participant
    const participant = chain.participants.find(p => p.userId === userId);
    if (!participant) {
      res.status(403).json({
        success: false,
        message: 'You are not a participant in this swap chain'
      });
      return;
    }

    // Check if chain is still pending
    if (chain.status !== 'proposed' && chain.status !== 'pending') {
      res.status(400).json({
        success: false,
        message: 'Chain is no longer accepting approvals'
      });
      return;
    }

    // Check if already approved or rejected
    if (participant.approvalStatus !== 'pending') {
      res.status(400).json({
        success: false,
        message: `You have already ${participant.approvalStatus} this chain`
      });
      return;
    }

    // Update participant approval
    participant.approvalStatus = 'approved';
    participant.approvedAt = new Date();

    // Update approval in approvals array
    const approval = chain.approvals.find(a => a.userId === userId);
    if (approval) {
      approval.status = 'approved';
      approval.approvedAt = new Date();
      approval.reason = reason;
    }

    // Check if all participants have approved
    const isFullyApproved = chain.participants.every(participant =>
      participant.approvalStatus === 'approved'
    );

    if (isFullyApproved) {
      chain.status = 'approved';
      logger.info(`Chain ${chainId} is now fully approved`);
    } else {
      chain.status = 'pending';
    }

    await chain.save();

    res.json({
      success: true,
      data: chain,
      message: 'Successfully approved chain participation'
    });

  } catch (error) {
    logger.error('Error approving chain participation:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to approve chain participation',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * Reject participation in a swap chain
 * POST /api/swap-chains/:chainId/reject
 */
export const rejectChainParticipation = async (req: Request, res: Response): Promise<void> => {
  try {
    const { chainId } = req.params;
    const userId = req.user._id.toString();
    const { reason } = req.body;

    logger.info(`User ${userId} rejecting chain: ${chainId}`);

    const chain = await SwapChain.findOne({ chainId });

    if (!chain) {
      res.status(404).json({
        success: false,
        message: 'Swap chain not found'
      });
      return;
    }

    // Check if user is a participant
    const participant = chain.participants.find(p => p.userId === userId);
    if (!participant) {
      res.status(403).json({
        success: false,
        message: 'You are not a participant in this swap chain'
      });
      return;
    }

    // Check if chain is still pending
    if (chain.status !== 'proposed' && chain.status !== 'pending') {
      res.status(400).json({
        success: false,
        message: 'Chain is no longer accepting responses'
      });
      return;
    }

    // Update participant rejection
    participant.approvalStatus = 'rejected';
    participant.rejectedAt = new Date();
    participant.rejectionReason = reason;

    // Update approval in approvals array
    const approval = chain.approvals.find(a => a.userId === userId);
    if (approval) {
      approval.status = 'rejected';
      approval.rejectedAt = new Date();
      approval.reason = reason;
    }

    // Mark chain as failed due to rejection
    chain.status = 'failed';

    await chain.save();

    res.json({
      success: true,
      data: chain,
      message: 'Chain participation rejected'
    });

  } catch (error) {
    logger.error('Error rejecting chain participation:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reject chain participation',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * Execute a fully approved swap chain
 * POST /api/swap-chains/:chainId/execute
 */
export const executeSwapChain = async (req: Request, res: Response): Promise<void> => {
  try {
    const { chainId } = req.params;
    const userId = req.user._id.toString();

    logger.info(`User ${userId} requesting execution of chain: ${chainId}`);

    const chain = await SwapChain.findOne({ chainId });

    if (!chain) {
      res.status(404).json({
        success: false,
        message: 'Swap chain not found'
      });
      return;
    }

    // Check if user is authorized to execute (initiator or admin)
    const userRole = req.user.role;
    if (chain.initiatorUserId !== userId && !['WorkFlowManagement', 'Developer'].includes(userRole)) {
      res.status(403).json({
        success: false,
        message: 'Only the chain initiator or administrators can execute chains'
      });
      return;
    }

    // Execute the chain
    const result = await chainExecutionService.executeChain(chainId);

    if (result.success) {
      res.json({
        success: true,
        data: {
          chainId,
          executedSteps: result.executedSteps.length,
          totalSteps: result.executedSteps.length
        },
        message: 'Swap chain executed successfully'
      });
    } else {
      res.status(400).json({
        success: false,
        message: 'Failed to execute swap chain',
        error: result.error,
        data: {
          executedSteps: result.executedSteps.length,
          rollbackRequired: result.rollbackRequired
        }
      });
    }

  } catch (error) {
    logger.error('Error executing swap chain:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to execute swap chain',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * Get execution status of a swap chain
 * GET /api/swap-chains/:chainId/status
 */
export const getChainExecutionStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const { chainId } = req.params;

    const status = await chainExecutionService.getExecutionStatus(chainId);

    res.json({
      success: true,
      data: status
    });

  } catch (error) {
    logger.error('Error getting chain execution status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get chain execution status',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * Get all active swap chains (for admin/management)
 * GET /api/swap-chains/active
 */
export const getActiveSwapChains = async (req: Request, res: Response): Promise<void> => {
  try {
    const { limit = 50, page = 1 } = req.query;

    const skip = (Number(page) - 1) * Number(limit);

    const chains = await SwapChain.find({
      status: { $in: ['proposed', 'pending', 'approved'] },
      expiresAt: { $gt: new Date() }
    })
      .populate('participants.userId', 'firstName lastName email')
      .populate('initiatorUserId', 'firstName lastName email')
      .sort({ chainScore: -1, createdAt: -1 })
      .limit(Number(limit))
      .skip(skip);

    const total = await SwapChain.countDocuments({
      status: { $in: ['proposed', 'pending', 'approved'] },
      expiresAt: { $gt: new Date() }
    });

    res.json({
      success: true,
      data: {
        chains,
        pagination: {
          total,
          page: Number(page),
          limit: Number(limit),
          pages: Math.ceil(total / Number(limit))
        }
      }
    });

  } catch (error) {
    logger.error('Error getting active swap chains:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get active swap chains',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};
