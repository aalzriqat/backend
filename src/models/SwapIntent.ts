import mongoose, { Schema } from 'mongoose';
import { ISwapIntent, SwapIntentStatus, TimePreference, Marketplace } from '../types';

const swapIntentSchema = new Schema<ISwapIntent>({
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
  preferredTimeSlots: [{
    type: String,
    enum: ['morning', 'day', 'evening', 'any'] as TimePreference[]
  }],
  preferredMarketplaces: [{
    type: String,
    enum: ['AE', 'SA', 'UK', 'EG'] as Marketplace[]
  }],
  skillFlexibility: {
    type: Boolean,
    default: false,
    required: true
  },
  maxDaysOut: {
    type: Number,
    default: 14,
    min: [1, 'Max days out must be at least 1'],
    max: [30, 'Max days out cannot exceed 30']
  },
  status: {
    type: String,
    enum: ['active', 'matched', 'expired', 'cancelled'] as SwapIntentStatus[],
    default: 'active'
  },
  priority: {
    type: Number,
    default: 3,
    min: [1, 'Priority must be between 1 and 5'],
    max: [5, 'Priority must be between 1 and 5']
  },
  notes: {
    type: String,
    maxlength: [500, 'Notes cannot exceed 500 characters'],
    trim: true
  },
  expiresAt: {
    type: Date,
    required: true,
    default: function() {
      // Default expiration: 7 days from creation
      return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    }
  },
  lastProcessedAt: {
    type: Date,
    default: null
  },
  processingStats: {
    totalProcessingRuns: {
      type: Number,
      default: 0
    },
    lastDirectMatches: {
      type: Number,
      default: 0
    },
    lastChainMatches: {
      type: Number,
      default: 0
    },
    totalNotificationsSent: {
      type: Number,
      default: 0
    }
  }
}, {
  timestamps: true
});

// Indexes for performance
swapIntentSchema.index({ userId: 1 });
swapIntentSchema.index({ status: 1 });
swapIntentSchema.index({ expiresAt: 1 });
swapIntentSchema.index({ originalShiftId: 1 });
swapIntentSchema.index({ userId: 1, status: 1 });
swapIntentSchema.index({ status: 1, expiresAt: 1 });
swapIntentSchema.index({ lastProcessedAt: 1 });
swapIntentSchema.index({ status: 1, lastProcessedAt: 1 });

// Separate indexes for array fields (cannot compound multiple arrays)
swapIntentSchema.index({ status: 1, preferredTimeSlots: 1 });
swapIntentSchema.index({ status: 1, preferredMarketplaces: 1 });

// Prevent duplicate active intents for the same shift
swapIntentSchema.index({
  userId: 1,
  originalShiftId: 1,
  status: 1
}, {
  unique: true,
  partialFilterExpression: { status: 'active' }
});

// Auto-expire intents
swapIntentSchema.pre('save', function(next) {
  if (this.expiresAt && this.expiresAt <= new Date() && this.status === 'active') {
    this.status = 'expired';
  }
  next();
});

// Virtual for checking if intent is expired
swapIntentSchema.virtual('isExpired').get(function() {
  return this.expiresAt <= new Date();
});

// Method to extend expiration
swapIntentSchema.methods.extend = function(days: number = 7) {
  this.expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  return this.save();
};

// Static method to find active intents
swapIntentSchema.statics.findActive = function() {
  return this.find({
    status: 'active',
    expiresAt: { $gt: new Date() }
  });
};

// Static method to expire old intents
swapIntentSchema.statics.expireOldIntents = function() {
  return this.updateMany(
    {
      status: 'active',
      expiresAt: { $lte: new Date() }
    },
    {
      $set: { status: 'expired' }
    }
  );
};

export const SwapIntent = mongoose.model<ISwapIntent>('SwapIntent', swapIntentSchema);
