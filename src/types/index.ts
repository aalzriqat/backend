import { Document } from 'mongoose';

// User Types
export type UserRole = 'Employee' | 'Manager' | 'WorkFlowManagement' | 'Developer';
export type Skill = 'PhoneMU' | 'phoneOnly' | 'MuOnly' | 'Email' | 'General' | 'Specialty';
export type Marketplace = 'AE' | 'SA' | 'UK' | 'EG';

export interface IUser extends Document {
  email: string;
  userLogin?: string; // Optional link to real schedule data
  password: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  skills: Skill[];
  marketplace: Marketplace;
  createdAt: Date;
  updatedAt: Date;
}

// Shift Types
export type ShiftType = 'Day Shift' | 'Evening Shift' | 'Morning Shift';
export type ShiftStatus = 'confirmed' | 'pending' | 'swap-requested' | 'cancelled';

export interface IShift extends Document {
  userId: string;
  date: string; // YYYY-MM-DD format
  startTime: string; // HH:mm format
  endTime: string; // HH:mm format
  type: ShiftType;
  skills: Skill[];
  marketplace: Marketplace;
  status: ShiftStatus;
  createdAt: Date;
  updatedAt: Date;
}

// Swap Request Types
export type SwapStatus = 'pending' | 'accepted' | 'rejected' | 'cancelled';

export interface ISwapRequest extends Document {
  requesterId: string;
  requesterShiftId: string;
  targetUserId: string;
  targetShiftId: string;
  status: SwapStatus;
  message?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Swap Intent Types (Modern Smart Matching System)
export type SwapIntentStatus = 'active' | 'matched' | 'expired' | 'cancelled';
export type TimePreference = 'morning' | 'day' | 'evening' | 'any';
export type MatchStatus = 'positive' | 'negative' | 'neutral';

export interface ISwapIntent extends Document {
  userId: string;
  originalShiftId: string;
  preferredTimeSlots: TimePreference[];
  preferredMarketplaces: Marketplace[];
  skillFlexibility: boolean; // Allow cross-training opportunities
  maxDaysOut: number; // Maximum days in advance for swap
  status: SwapIntentStatus;
  priority: number; // 1-5, higher = more urgent
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
  lastProcessedAt?: Date;
  processingStats: ProcessingStats;
}

// User Preferences for Smart Matching
export interface IUserPreferences extends Document {
  userId: string;
  autoMatchEnabled: boolean;
  preferredTimeSlots: TimePreference[];
  preferredMarketplaces: Marketplace[];
  skillFlexibility: boolean;
  maxSwapsPerWeek: number;
  notificationSettings: NotificationSettings;
  automatedMatchingSettings: AutomatedMatchingSettings;
  blacklistedUsers: string[]; // Users to avoid matching with
  createdAt: Date;
  updatedAt: Date;
}

// Real Schedule Data Types
export interface IDailyShift {
  day: string; // 'Sun', 'Mon', 'Tue', etc.
  working: boolean;
  shiftStart: string | null; // "06:00" format or null
  shiftEnd: string | null; // "15:00" format or null
}

export interface IRealScheduleEntry extends Document {
  userLogin: string; // Employee username/ID
  skill: string; // e.g., "AE SWAT Caracara P+MU"
  weekOff: string[]; // Array of week-off periods
  dailyShifts: IDailyShift[]; // 7 days array
  weekLabel: string; // e.g., "Allowed Swaps"
  lunch: string; // "10:00:00" format
  break1: string; // "07:45:00" format
  break2: string; // "12:45:00" format
  createdAt: Date;
  updatedAt: Date;
}

// Real Schedule Data Types
export interface IDailyShift {
  day: string; // 'Sun', 'Mon', 'Tue', etc.
  working: boolean;
  shiftStart: string | null; // "06:00" format or null
  shiftEnd: string | null; // "15:00" format or null
}

export interface IRealScheduleEntry extends Document {
  userLogin: string; // Employee username/ID
  skill: string; // e.g., "AE SWAT Caracara P+MU"
  weekOff: string[]; // Array of week-off periods
  dailyShifts: IDailyShift[]; // 7 days array
  lunch: string; // "10:00:00" format
  break1: string; // "07:45:00" format
  break2: string; // "12:45:00" format
  createdAt: Date;
  updatedAt: Date;
}

// Smart Match Result Types
export interface MatchFactor {
  factor: string;
  status: MatchStatus;
  description: string;
  weight: number; // 0-1, contribution to overall score
}

export interface ISmartMatch {
  id: string;
  requesterIntentId: string;
  targetIntentId: string;
  matchScore: number; // 0-100
  compatibility: 'Perfect Match' | 'High Match' | 'Good Match' | 'Fair Match';
  factors: MatchFactor[];
  reason: string;
  calculatedAt: Date;
  expiresAt: Date;
}

// Business Rule Validation Types
export interface BusinessRuleResult {
  isValid: boolean;
  violations: string[];
  warnings: string[];
}

export interface SwapValidationContext {
  requesterShift: IShift;
  targetShift: IShift;
  requesterUser: IUser;
  targetUser: IUser;
  requesterSchedule: IShift[];
  targetSchedule: IShift[];
}

// API Response Types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

export interface AuthResponse {
  user: IUser;
  token: string;
}

// Request Types
export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  skills: Skill[];
  marketplace: Marketplace;
}

// Analytics Types
export interface SystemMetrics {
  activeUsers: number;
  swapSuccessRate: number;
  avgMatchTime: number;
  systemEfficiency: number;
}

export interface AnalyticsData {
  swapTrends: any[];
  skillDistribution: any[];
  marketplaceData: any[];
  systemMetrics: SystemMetrics;
}

// Multi-hop Swap Chain Types
export type ChainStatus = 'proposed' | 'pending' | 'approved' | 'executing' | 'executed' | 'failed' | 'expired';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

export interface ISwapChain extends Document {
  chainId: string;
  participants: ChainParticipant[];
  swapSteps: SwapStep[];
  status: ChainStatus;
  chainScore: number;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
  approvals: ChainApproval[];
  executionOrder: number[];
  initiatorUserId: string;
  notes?: string;
}

export interface ChainParticipant {
  userId: string;
  originalShiftId: string;
  desiredShiftId: string;
  approvalStatus: ApprovalStatus;
  approvedAt?: Date;
  rejectedAt?: Date;
  rejectionReason?: string;
}

export interface SwapStep {
  stepId: string;
  fromUserId: string;
  toUserId: string;
  shiftId: string;
  stepOrder: number;
  businessRuleValidation: BusinessRuleResult;
  executed: boolean;
  executedAt?: Date;
}

export interface ChainApproval {
  userId: string;
  status: ApprovalStatus;
  approvedAt?: Date;
  rejectedAt?: Date;
  reason?: string;
}

export interface SwapCycle {
  participants: string[];
  shifts: string[];
  cycleScore: number;
  isValid: boolean;
  violations: string[];
}

export interface ChainValidationResult {
  isValid: boolean;
  violations: string[];
  warnings: string[];
  participantValidations: Map<string, BusinessRuleResult>;
}

export interface ChainDetectionOptions {
  maxChainLength: number;
  minChainScore: number;
  includePartialMatches: boolean;
  timeWindowDays: number;
}

export interface ChainExecutionResult {
  success: boolean;
  executedSteps: SwapStep[];
  failedStep?: SwapStep;
  rollbackRequired: boolean;
  error?: string;
}

// Automated Matching Types
export interface AutomatedMatchingSettings {
  enableChainDetection: boolean;
  maxChainLength: number;
  minChainScore: number;
  autoApproveHighScore: boolean;
  autoApproveThreshold: number;
}

export interface NotificationSettings {
  email: boolean;
  push: boolean;
  sms: boolean;
  newMatches: boolean;
  chainOpportunities: boolean;
  approvalRequests: boolean;
  expiringAlerts: boolean;
}

export interface ProcessingStats {
  totalProcessingRuns: number;
  lastDirectMatches: number;
  lastChainMatches: number;
  totalNotificationsSent: number;
}
