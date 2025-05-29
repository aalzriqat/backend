import { Request, Response } from 'express';
import { logger } from '../utils/logger';
import { performanceMonitor } from '../services/performanceMonitoringService';

/**
 * Get current performance metrics
 */
export const getCurrentMetrics = async (req: Request, res: Response) => {
  try {
    logger.info('📊 Getting current performance metrics');

    const metrics = await performanceMonitor.collectMetrics();
    
    res.json({
      success: true,
      data: metrics
    });

  } catch (error) {
    logger.error('❌ Get current metrics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get current performance metrics',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * Get system health status
 */
export const getSystemHealth = async (req: Request, res: Response) => {
  try {
    logger.info('🏥 Getting system health status');

    const health = await performanceMonitor.getSystemHealth();
    
    res.json({
      success: true,
      data: health
    });

  } catch (error) {
    logger.error('❌ Get system health error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get system health status',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * Get performance trends
 */
export const getPerformanceTrends = async (req: Request, res: Response) => {
  try {
    const { hours = 24 } = req.query;
    const hoursNum = parseInt(hours as string, 10);

    logger.info('📈 Getting performance trends', { hours: hoursNum });

    const trends = performanceMonitor.getPerformanceTrends(hoursNum);
    
    res.json({
      success: true,
      data: {
        timeRange: `${hoursNum} hours`,
        trends
      }
    });

  } catch (error) {
    logger.error('❌ Get performance trends error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get performance trends',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * Get recent alerts
 */
export const getRecentAlerts = async (req: Request, res: Response) => {
  try {
    const { limit = 10 } = req.query;
    const limitNum = parseInt(limit as string, 10);

    logger.info('🚨 Getting recent alerts', { limit: limitNum });

    const alerts = performanceMonitor.getRecentAlerts(limitNum);
    
    res.json({
      success: true,
      data: {
        alerts,
        count: alerts.length
      }
    });

  } catch (error) {
    logger.error('❌ Get recent alerts error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get recent alerts',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * Clear performance alerts
 */
export const clearAlerts = async (req: Request, res: Response) => {
  try {
    logger.info('🧹 Clearing performance alerts');

    performanceMonitor.clearAlerts();
    
    res.json({
      success: true,
      message: 'Performance alerts cleared successfully'
    });

  } catch (error) {
    logger.error('❌ Clear alerts error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to clear alerts',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * Get comprehensive performance summary
 */
export const getPerformanceSummary = async (req: Request, res: Response) => {
  try {
    logger.info('📋 Getting performance summary');

    const summary = await performanceMonitor.getPerformanceSummary();
    
    res.json({
      success: true,
      data: summary
    });

  } catch (error) {
    logger.error('❌ Get performance summary error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get performance summary',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * Start performance monitoring
 */
export const startMonitoring = async (req: Request, res: Response) => {
  try {
    const { interval = 5 } = req.body;
    const intervalNum = parseInt(interval, 10);

    logger.info('🔄 Starting performance monitoring', { interval: intervalNum });

    performanceMonitor.startMonitoring(intervalNum);
    
    res.json({
      success: true,
      message: `Performance monitoring started with ${intervalNum} minute intervals`
    });

  } catch (error) {
    logger.error('❌ Start monitoring error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to start performance monitoring',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * Get performance dashboard data
 */
export const getPerformanceDashboard = async (req: Request, res: Response) => {
  try {
    logger.info('📊 Getting performance dashboard data');

    const [summary, trends, alerts] = await Promise.all([
      performanceMonitor.getPerformanceSummary(),
      performanceMonitor.getPerformanceTrends(1), // Last hour
      performanceMonitor.getRecentAlerts(5)
    ]);

    const dashboard = {
      summary: {
        status: summary.health.status,
        uptime: summary.health.uptime,
        responseTime: summary.current?.responseTime || 0,
        memoryUsage: summary.current?.memoryUsage.percentage || 0,
        cpuUsage: summary.current?.cpuUsage || 0,
        errorRate: summary.current?.errorRate || 0
      },
      trends: {
        responseTime: trends.responseTime.slice(-12), // Last 12 data points
        memoryUsage: trends.memoryUsage.slice(-12),
        cpuUsage: trends.cpuUsage.slice(-12),
        timestamps: trends.timestamps.slice(-12)
      },
      alerts: {
        recent: alerts,
        count: alerts.length
      },
      recommendations: summary.recommendations,
      lastUpdated: new Date().toISOString()
    };
    
    res.json({
      success: true,
      data: dashboard
    });

  } catch (error) {
    logger.error('❌ Get performance dashboard error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get performance dashboard data',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};
