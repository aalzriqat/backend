import mongoose, { Schema } from 'mongoose';
import { ISwapRequest, SwapStatus } from '../types';

const swapRequestSchema = new Schema<ISwapRequest>({
  requesterId: {
    type: String,
    required: [true, 'Requester ID is required'],
    ref: 'User'
  },
  requesterShiftId: {
    type: String,
    required: [true, 'Requester shift ID is required'],
    ref: 'Shift'
  },
  targetUserId: {
    type: String,
    required: [true, 'Target user ID is required'],
    ref: 'User'
  },
  targetShiftId: {
    type: String,
    required: [true, 'Target shift ID is required'],
    ref: 'Shift'
  },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'rejected', 'cancelled'] as SwapStatus[],
    default: 'pending'
  },
  message: {
    type: String,
    maxlength: [500, 'Message cannot exceed 500 characters'],
    trim: true
  }
}, {
  timestamps: true
});

// Indexes for performance
swapRequestSchema.index({ requesterId: 1 });
swapRequestSchema.index({ targetUserId: 1 });
swapRequestSchema.index({ status: 1 });
swapRequestSchema.index({ createdAt: -1 });
swapRequestSchema.index({ requesterId: 1, status: 1 });
swapRequestSchema.index({ targetUserId: 1, status: 1 });

// Prevent duplicate swap requests
swapRequestSchema.index({ 
  requesterId: 1, 
  requesterShiftId: 1, 
  targetUserId: 1, 
  targetShiftId: 1 
}, { 
  unique: true,
  partialFilterExpression: { status: { $in: ['pending', 'accepted'] } }
});

// Validate that requester and target are different users
swapRequestSchema.pre('save', function(next) {
  if (this.requesterId === this.targetUserId) {
    return next(new Error('Cannot create swap request with yourself'));
  }
  next();
});

export const SwapRequest = mongoose.model<ISwapRequest>('SwapRequest', swapRequestSchema);
