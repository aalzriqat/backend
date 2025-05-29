import mongoose, { Schema } from 'mongoose';
import { IUserPreferences, TimePreference, Marketplace } from '../types';

const userPreferencesSchema = new Schema<IUserPreferences>({
  userId: {
    type: String,
    required: [true, 'User ID is required'],
    unique: true,
    ref: 'User'
  },
  autoMatchEnabled: {
    type: Boolean,
    default: true,
    required: true
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
  maxSwapsPerWeek: {
    type: Number,
    default: 2,
    min: [0, 'Max swaps per week cannot be negative'],
    max: [7, 'Max swaps per week cannot exceed 7']
  },
  notificationSettings: {
    email: {
      type: Boolean,
      default: true
    },
    push: {
      type: Boolean,
      default: true
    },
    sms: {
      type: Boolean,
      default: false
    },
    newMatches: {
      type: Boolean,
      default: true
    },
    chainOpportunities: {
      type: Boolean,
      default: true
    },
    approvalRequests: {
      type: Boolean,
      default: true
    },
    expiringAlerts: {
      type: Boolean,
      default: true
    }
  },
  automatedMatchingSettings: {
    enableChainDetection: {
      type: Boolean,
      default: true
    },
    maxChainLength: {
      type: Number,
      default: 4,
      min: [2, 'Chain length must be at least 2'],
      max: [8, 'Chain length cannot exceed 8']
    },
    minChainScore: {
      type: Number,
      default: 70,
      min: [0, 'Chain score cannot be negative'],
      max: [100, 'Chain score cannot exceed 100']
    },
    autoApproveHighScore: {
      type: Boolean,
      default: false
    },
    autoApproveThreshold: {
      type: Number,
      default: 95,
      min: [80, 'Auto-approve threshold must be at least 80'],
      max: [100, 'Auto-approve threshold cannot exceed 100']
    }
  },
  blacklistedUsers: [{
    type: String,
    ref: 'User'
  }]
}, {
  timestamps: true
});

// Indexes for performance
userPreferencesSchema.index({ userId: 1 });
userPreferencesSchema.index({ autoMatchEnabled: 1 });
userPreferencesSchema.index({ preferredTimeSlots: 1 });
userPreferencesSchema.index({ preferredMarketplaces: 1 });

// Static method to get or create preferences for a user
userPreferencesSchema.statics.getOrCreate = async function(userId: string) {
  let preferences = await this.findOne({ userId });

  if (!preferences) {
    preferences = new this({
      userId,
      autoMatchEnabled: true,
      preferredTimeSlots: ['any'],
      preferredMarketplaces: [],
      skillFlexibility: false,
      maxSwapsPerWeek: 2,
      notificationSettings: {
        email: true,
        push: true,
        sms: false,
        newMatches: true,
        chainOpportunities: true,
        approvalRequests: true,
        expiringAlerts: true
      },
      automatedMatchingSettings: {
        enableChainDetection: true,
        maxChainLength: 4,
        minChainScore: 70,
        autoApproveHighScore: false,
        autoApproveThreshold: 95
      },
      blacklistedUsers: []
    });
    await preferences.save();
  }

  return preferences;
};

// Method to add user to blacklist
userPreferencesSchema.methods.addToBlacklist = function(targetUserId: string) {
  if (!this.blacklistedUsers.includes(targetUserId)) {
    this.blacklistedUsers.push(targetUserId);
    return this.save();
  }
  return Promise.resolve(this);
};

// Method to remove user from blacklist
userPreferencesSchema.methods.removeFromBlacklist = function(targetUserId: string) {
  this.blacklistedUsers = this.blacklistedUsers.filter((id: string) => id !== targetUserId);
  return this.save();
};

// Method to check if user is blacklisted
userPreferencesSchema.methods.isBlacklisted = function(targetUserId: string) {
  return this.blacklistedUsers.includes(targetUserId);
};

export const UserPreferences = mongoose.model<IUserPreferences>('UserPreferences', userPreferencesSchema);
