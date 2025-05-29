import { Request, Response } from 'express';
import { SwapRequest, Shift, User } from '../models';
import { logger } from '../utils/logger';
import { ApiResponse, ISwapRequest } from '../types';

export const getSwapRequests = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.query;

    let query: any = {};

    if (userId) {
      // Get swap requests where user is either requester or target
      query = {
        $or: [
          { requesterId: userId },
          { targetUserId: userId }
        ]
      };
    }

    const swapRequests = await SwapRequest.find(query)
      .populate('requesterId', 'firstName lastName email')
      .populate('targetUserId', 'firstName lastName email')
      .populate('requesterShiftId')
      .populate('targetShiftId')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: swapRequests
    });
  } catch (error) {
    logger.error('Get swap requests error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error getting swap requests'
    });
  }
};

export const createSwapRequest = async (req: Request, res: Response): Promise<void> => {
  try {
    const { requesterShiftId, targetUserId, targetShiftId, message } = req.body;
    const requesterId = req.user._id;

    // Verify shifts exist
    const requesterShift = await Shift.findById(requesterShiftId);
    const targetShift = await Shift.findById(targetShiftId);

    if (!requesterShift || !targetShift) {
      res.status(404).json({
        success: false,
        message: 'One or both shifts not found'
      });
      return;
    }

    // Verify requester owns the requester shift
    if (requesterShift.userId !== requesterId.toString()) {
      res.status(403).json({
        success: false,
        message: 'You can only swap your own shifts'
      });
      return;
    }

    // Verify target user owns the target shift
    if (targetShift.userId !== targetUserId) {
      res.status(400).json({
        success: false,
        message: 'Target shift does not belong to target user'
      });
      return;
    }

    // Check if swap request already exists
    const existingSwap = await SwapRequest.findOne({
      requesterId,
      requesterShiftId,
      targetUserId,
      targetShiftId,
      status: { $in: ['pending', 'accepted'] }
    });

    if (existingSwap) {
      res.status(400).json({
        success: false,
        message: 'Swap request already exists for these shifts'
      });
      return;
    }

    const swapRequest = new SwapRequest({
      requesterId,
      requesterShiftId,
      targetUserId,
      targetShiftId,
      message
    });

    await swapRequest.save();

    // Populate the created swap request
    await swapRequest.populate([
      { path: 'requesterId', select: 'firstName lastName email' },
      { path: 'targetUserId', select: 'firstName lastName email' },
      { path: 'requesterShiftId' },
      { path: 'targetShiftId' }
    ]);

    logger.info(`Swap request created: ${swapRequest._id}`);

    res.status(201).json({
      success: true,
      data: swapRequest
    });
  } catch (error) {
    logger.error('Create swap request error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error creating swap request'
    });
  }
};

export const respondToSwapRequest = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { action } = req.params; // 'accept' or 'reject'
    const userId = req.user._id;

    const swapRequest = await SwapRequest.findById(id);

    if (!swapRequest) {
      res.status(404).json({
        success: false,
        message: 'Swap request not found'
      });
      return;
    }

    // Verify user is the target of the swap request
    if (swapRequest.targetUserId !== userId.toString()) {
      res.status(403).json({
        success: false,
        message: 'You can only respond to swap requests directed to you'
      });
      return;
    }

    // Check if swap request is still pending
    if (swapRequest.status !== 'pending') {
      res.status(400).json({
        success: false,
        message: 'Swap request is no longer pending'
      });
      return;
    }

    // Update swap request status
    swapRequest.status = action === 'accept' ? 'accepted' : 'rejected';
    await swapRequest.save();

    // If accepted, swap the shifts
    if (action === 'accept') {
      const requesterShift = await Shift.findById(swapRequest.requesterShiftId);
      const targetShift = await Shift.findById(swapRequest.targetShiftId);

      if (requesterShift && targetShift) {
        // Swap the user assignments
        const tempUserId = requesterShift.userId;
        requesterShift.userId = targetShift.userId;
        targetShift.userId = tempUserId;

        await requesterShift.save();
        await targetShift.save();

        logger.info(`Shifts swapped: ${requesterShift._id} <-> ${targetShift._id}`);
      }
    }

    // Populate the updated swap request
    await swapRequest.populate([
      { path: 'requesterId', select: 'firstName lastName email' },
      { path: 'targetUserId', select: 'firstName lastName email' },
      { path: 'requesterShiftId' },
      { path: 'targetShiftId' }
    ]);

    logger.info(`Swap request ${action}ed: ${swapRequest._id}`);

    res.json({
      success: true,
      data: swapRequest
    });
  } catch (error) {
    logger.error('Respond to swap request error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error responding to swap request'
    });
  }
};

export const cancelSwapRequest = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const swapRequest = await SwapRequest.findById(id);

    if (!swapRequest) {
      res.status(404).json({
        success: false,
        message: 'Swap request not found'
      });
      return;
    }

    // Verify user is the requester
    if (swapRequest.requesterId !== userId.toString()) {
      res.status(403).json({
        success: false,
        message: 'You can only cancel your own swap requests'
      });
      return;
    }

    // Check if swap request can be cancelled
    if (swapRequest.status !== 'pending') {
      res.status(400).json({
        success: false,
        message: 'Only pending swap requests can be cancelled'
      });
      return;
    }

    await SwapRequest.findByIdAndDelete(id);

    logger.info(`Swap request cancelled: ${id}`);

    res.json({
      success: true,
      message: 'Swap request cancelled successfully'
    });
  } catch (error) {
    logger.error('Cancel swap request error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error cancelling swap request'
    });
  }
};
