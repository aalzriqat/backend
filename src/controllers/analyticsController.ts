import { Request, Response } from 'express';
import { User, Shift, SwapRequest } from '../models';
import { SwapIntent } from '../models/SwapIntent';
import { SwapChain } from '../models/SwapChain';
import { logger } from '../utils/logger';
import { AnalyticsData } from '../types';
import { AdvancedAnalyticsService } from '../services/advancedAnalyticsService';

export const getAnalytics = async (req: Request, res: Response) => {
  try {
    // Get basic system metrics
    const totalUsers = await User.countDocuments();
    const activeUsers = await User.countDocuments({
      updatedAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } // Last 30 days
    });

    const totalSwapRequests = await SwapRequest.countDocuments();
    const acceptedSwaps = await SwapRequest.countDocuments({ status: 'accepted' });
    const swapSuccessRate = totalSwapRequests > 0 ? (acceptedSwaps / totalSwapRequests) * 100 : 0;

    // Get skill distribution
    const skillDistribution = await User.aggregate([
      { $unwind: '$skills' },
      { $group: { _id: '$skills', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    // Get marketplace distribution
    const marketplaceData = await User.aggregate([
      { $group: { _id: '$marketplace', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    // Get swap trends (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const swapTrends = await SwapRequest.aggregate([
      { $match: { createdAt: { $gte: thirtyDaysAgo } } },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
            day: { $dayOfMonth: '$createdAt' }
          },
          count: { $sum: 1 },
          accepted: {
            $sum: { $cond: [{ $eq: ['$status', 'accepted'] }, 1, 0] }
          }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } }
    ]);

    const analyticsData: AnalyticsData = {
      swapTrends,
      skillDistribution,
      marketplaceData,
      systemMetrics: {
        activeUsers,
        swapSuccessRate: Math.round(swapSuccessRate * 100) / 100,
        avgMatchTime: 4.2, // Placeholder - would need more complex calculation
        systemEfficiency: 99.1 // Placeholder - would need more complex calculation
      }
    };

    res.json({
      success: true,
      data: analyticsData
    });
  } catch (error) {
    logger.error('Get analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error getting analytics'
    });
  }
};

export const getUserAnalytics = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    // Get user's swap history
    const userSwapRequests = await SwapRequest.countDocuments({
      $or: [{ requesterId: userId }, { targetUserId: userId }]
    });

    const userAcceptedSwaps = await SwapRequest.countDocuments({
      $or: [{ requesterId: userId }, { targetUserId: userId }],
      status: 'accepted'
    });

    const userSwapSuccessRate = userSwapRequests > 0 ?
      (userAcceptedSwaps / userSwapRequests) * 100 : 0;

    // Get user's shift count
    const userShiftCount = await Shift.countDocuments({ userId });

    // Get user's recent activity
    const recentSwaps = await SwapRequest.find({
      $or: [{ requesterId: userId }, { targetUserId: userId }]
    })
    .sort({ createdAt: -1 })
    .limit(10)
    .populate('requesterId', 'firstName lastName')
    .populate('targetUserId', 'firstName lastName');

    const userAnalytics = {
      totalSwapRequests: userSwapRequests,
      acceptedSwaps: userAcceptedSwaps,
      swapSuccessRate: Math.round(userSwapSuccessRate * 100) / 100,
      totalShifts: userShiftCount,
      recentActivity: recentSwaps
    };

    res.json({
      success: true,
      data: userAnalytics
    });
  } catch (error) {
    logger.error('Get user analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error getting user analytics'
    });
  }
};

/**
 * Get comprehensive analytics for a specified time range
 */
export const getComprehensiveAnalytics = async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.query;

    // Default to last 30 days if no range specified
    const end = endDate ? new Date(endDate as string) : new Date();
    const start = startDate ? new Date(startDate as string) : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);

    const analyticsService = new AdvancedAnalyticsService();
    const comprehensiveAnalytics = await analyticsService.generateComprehensiveAnalytics({
      start,
      end
    });

    logger.info('📊 Generated comprehensive analytics', {
      timeRange: { start, end },
      totalSwaps: comprehensiveAnalytics.swapPerformance.totalSwapIntents
    });

    res.json({
      success: true,
      data: comprehensiveAnalytics
    });

  } catch (error) {
    logger.error('❌ Get comprehensive analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error getting comprehensive analytics',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * Get real-time dashboard analytics
 */
export const getRealTimeDashboard = async (req: Request, res: Response) => {
  try {
    const analyticsService = new AdvancedAnalyticsService();
    const dashboardData = await analyticsService.getRealTimeDashboard();

    logger.info('📊 Generated real-time dashboard data', {
      activeSwaps: dashboardData.activeSwaps,
      todaySwaps: dashboardData.todaySwaps
    });

    res.json({
      success: true,
      data: dashboardData
    });

  } catch (error) {
    logger.error('❌ Get real-time dashboard error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error getting real-time dashboard data',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * Get swap performance metrics
 */
export const getSwapPerformanceMetrics = async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.query;

    const end = endDate ? new Date(endDate as string) : new Date();
    const start = startDate ? new Date(startDate as string) : new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);

    const analyticsService = new AdvancedAnalyticsService();
    const performanceMetrics = await analyticsService['getSwapPerformanceMetrics']({ start, end });

    res.json({
      success: true,
      data: performanceMetrics
    });

  } catch (error) {
    logger.error('❌ Get swap performance metrics error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error getting swap performance metrics',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * Get marketplace insights
 */
export const getMarketplaceInsights = async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.query;

    const end = endDate ? new Date(endDate as string) : new Date();
    const start = startDate ? new Date(startDate as string) : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);

    const analyticsService = new AdvancedAnalyticsService();
    const marketplaceInsights = await analyticsService['getMarketplaceInsights']({ start, end });

    res.json({
      success: true,
      data: marketplaceInsights
    });

  } catch (error) {
    logger.error('❌ Get marketplace insights error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error getting marketplace insights',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * Get predictive analytics
 */
export const getPredictiveAnalytics = async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.query;

    const end = endDate ? new Date(endDate as string) : new Date();
    const start = startDate ? new Date(startDate as string) : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);

    const analyticsService = new AdvancedAnalyticsService();
    const predictiveAnalytics = await analyticsService['getPredictiveAnalytics']({ start, end });

    res.json({
      success: true,
      data: predictiveAnalytics
    });

  } catch (error) {
    logger.error('❌ Get predictive analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error getting predictive analytics',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * Get system health metrics
 */
export const getSystemHealth = async (req: Request, res: Response) => {
  try {
    const analyticsService = new AdvancedAnalyticsService();
    const systemHealth = await analyticsService['getSystemHealthMetrics']();

    res.json({
      success: true,
      data: systemHealth
    });

  } catch (error) {
    logger.error('❌ Get system health error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error getting system health metrics',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};