import mongoose, { Schema } from 'mongoose';
import { 
  ISwapChain, 
  ChainStatus, 
  ApprovalStatus,
  ChainParticipant,
  SwapStep,
  ChainApproval
} from '../types';

const chainParticipantSchema = new Schema<ChainParticipant>({
  userId: {
    type: String,
    required: [true, 'User ID is required'],
    ref: 'User'
  },
  originalShiftId: {
    type: String,
    required: [true, 'Original shift ID is required'],
    ref: 'Shift'
  },
  desiredShiftId: {
    type: String,
    required: [true, 'Desired shift ID is required'],
    ref: 'Shift'
  },
  approvalStatus: {
    type: String,
    enum: ['pending', 'approved', 'rejected'] as ApprovalStatus[],
    default: 'pending'
  },
  approvedAt: {
    type: Date,
    default: null
  },
  rejectedAt: {
    type: Date,
    default: null
  },
  rejectionReason: {
    type: String,
    maxlength: [500, 'Rejection reason cannot exceed 500 characters'],
    trim: true
  }
}, { _id: false });

const swapStepSchema = new Schema<SwapStep>({
  stepId: {
    type: String,
    required: [true, 'Step ID is required'],
    unique: true
  },
  fromUserId: {
    type: String,
    required: [true, 'From user ID is required'],
    ref: 'User'
  },
  toUserId: {
    type: String,
    required: [true, 'To user ID is required'],
    ref: 'User'
  },
  shiftId: {
    type: String,
    required: [true, 'Shift ID is required'],
    ref: 'Shift'
  },
  stepOrder: {
    type: Number,
    required: [true, 'Step order is required'],
    min: [1, 'Step order must be at least 1']
  },
  businessRuleValidation: {
    isValid: {
      type: Boolean,
      required: true
    },
    violations: [{
      type: String
    }],
    warnings: [{
      type: String
    }]
  },
  executed: {
    type: Boolean,
    default: false
  },
  executedAt: {
    type: Date,
    default: null
  }
}, { _id: false });

const chainApprovalSchema = new Schema<ChainApproval>({
  userId: {
    type: String,
    required: [true, 'User ID is required'],
    ref: 'User'
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'] as ApprovalStatus[],
    default: 'pending'
  },
  approvedAt: {
    type: Date,
    default: null
  },
  rejectedAt: {
    type: Date,
    default: null
  },
  reason: {
    type: String,
    maxlength: [500, 'Reason cannot exceed 500 characters'],
    trim: true
  }
}, { _id: false });

const swapChainSchema = new Schema<ISwapChain>({
  chainId: {
    type: String,
    required: [true, 'Chain ID is required'],
    unique: true,
    index: true
  },
  participants: [chainParticipantSchema],
  swapSteps: [swapStepSchema],
  status: {
    type: String,
    enum: ['proposed', 'pending', 'approved', 'executing', 'executed', 'failed', 'expired'] as ChainStatus[],
    default: 'proposed',
    index: true
  },
  chainScore: {
    type: Number,
    required: [true, 'Chain score is required'],
    min: [0, 'Chain score cannot be negative'],
    max: [100, 'Chain score cannot exceed 100']
  },
  expiresAt: {
    type: Date,
    required: [true, 'Expiration date is required'],
    index: true
  },
  approvals: [chainApprovalSchema],
  executionOrder: [{
    type: Number,
    min: [1, 'Execution order must be at least 1']
  }],
  initiatorUserId: {
    type: String,
    required: [true, 'Initiator user ID is required'],
    ref: 'User'
  },
  notes: {
    type: String,
    maxlength: [1000, 'Notes cannot exceed 1000 characters'],
    trim: true
  }
}, {
  timestamps: true
});

// Indexes for performance
swapChainSchema.index({ status: 1, createdAt: -1 });
swapChainSchema.index({ initiatorUserId: 1 });
swapChainSchema.index({ 'participants.userId': 1 });
swapChainSchema.index({ expiresAt: 1 });
swapChainSchema.index({ chainScore: -1 });

// Compound index for efficient queries
swapChainSchema.index({ 
  status: 1, 
  'participants.userId': 1, 
  createdAt: -1 
});

// Pre-save middleware to generate chainId if not provided
swapChainSchema.pre('save', function(next) {
  if (!this.chainId) {
    this.chainId = `chain_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  next();
});

// Pre-save middleware to generate step IDs
swapChainSchema.pre('save', function(next) {
  this.swapSteps.forEach((step, index) => {
    if (!step.stepId) {
      step.stepId = `${this.chainId}_step_${index + 1}`;
    }
  });
  next();
});

// Pre-save middleware to validate participants
swapChainSchema.pre('save', function(next) {
  if (this.participants.length < 2) {
    return next(new Error('Chain must have at least 2 participants'));
  }
  
  if (this.participants.length > 10) {
    return next(new Error('Chain cannot have more than 10 participants'));
  }
  
  // Check for duplicate participants
  const userIds = this.participants.map(p => p.userId);
  const uniqueUserIds = [...new Set(userIds)];
  if (userIds.length !== uniqueUserIds.length) {
    return next(new Error('Chain cannot have duplicate participants'));
  }
  
  next();
});

// Pre-save middleware to validate swap steps
swapChainSchema.pre('save', function(next) {
  if (this.swapSteps.length === 0) {
    return next(new Error('Chain must have at least one swap step'));
  }
  
  // Validate step order sequence
  const stepOrders = this.swapSteps.map(s => s.stepOrder).sort((a, b) => a - b);
  for (let i = 0; i < stepOrders.length; i++) {
    if (stepOrders[i] !== i + 1) {
      return next(new Error('Swap steps must have consecutive order numbers starting from 1'));
    }
  }
  
  next();
});

// Instance method to check if chain is fully approved
swapChainSchema.methods.isFullyApproved = function(): boolean {
  return this.participants.every((participant: ChainParticipant) => 
    participant.approvalStatus === 'approved'
  );
};

// Instance method to check if chain has any rejections
swapChainSchema.methods.hasRejections = function(): boolean {
  return this.participants.some((participant: ChainParticipant) => 
    participant.approvalStatus === 'rejected'
  );
};

// Instance method to get pending approvals
swapChainSchema.methods.getPendingApprovals = function(): string[] {
  return this.participants
    .filter((participant: ChainParticipant) => participant.approvalStatus === 'pending')
    .map((participant: ChainParticipant) => participant.userId);
};

// Instance method to check if chain is expired
swapChainSchema.methods.isExpired = function(): boolean {
  return new Date() > this.expiresAt;
};

// Static method to find chains by participant
swapChainSchema.statics.findByParticipant = function(userId: string) {
  return this.find({
    'participants.userId': userId,
    status: { $in: ['proposed', 'pending', 'approved'] }
  }).sort({ createdAt: -1 });
};

// Static method to find active chains
swapChainSchema.statics.findActive = function() {
  return this.find({
    status: { $in: ['proposed', 'pending', 'approved'] },
    expiresAt: { $gt: new Date() }
  }).sort({ chainScore: -1, createdAt: -1 });
};

export const SwapChain = mongoose.model<ISwapChain>('SwapChain', swapChainSchema);
export default SwapChain;
