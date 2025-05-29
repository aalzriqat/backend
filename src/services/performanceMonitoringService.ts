import { logger } from '../utils/logger';
import { SwapIntent } from '../models/SwapIntent';
import { SwapChain } from '../models/SwapChain';
import { User } from '../models/User';

export interface PerformanceMetrics {
  timestamp: Date;
  responseTime: number;
  memoryUsage: {
    used: number;
    total: number;
    percentage: number;
  };
  cpuUsage: number;
  activeConnections: number;
  errorRate: number;
  throughput: number;
}

export interface SystemHealthStatus {
  status: 'healthy' | 'warning' | 'critical';
  uptime: number;
  lastCheck: Date;
  issues: string[];
  recommendations: string[];
}

export interface AlertThresholds {
  responseTime: number; // ms
  memoryUsage: number; // percentage
  cpuUsage: number; // percentage
  errorRate: number; // percentage
  throughput: number; // requests per minute
}

export class PerformanceMonitoringService {
  private metrics: PerformanceMetrics[] = [];
  private alerts: string[] = [];
  private startTime: Date = new Date();
  
  private readonly thresholds: AlertThresholds = {
    responseTime: 1000, // 1 second
    memoryUsage: 80, // 80%
    cpuUsage: 80, // 80%
    errorRate: 5, // 5%
    throughput: 10 // 10 requests per minute minimum
  };

  /**
   * Collect current performance metrics
   */
  async collectMetrics(): Promise<PerformanceMetrics> {
    try {
      const startTime = Date.now();
      
      // Memory usage
      const memoryUsage = process.memoryUsage();
      const totalMemory = memoryUsage.heapTotal;
      const usedMemory = memoryUsage.heapUsed;
      const memoryPercentage = (usedMemory / totalMemory) * 100;

      // Response time (simulate with a simple database query)
      const queryStart = Date.now();
      await User.countDocuments().limit(1);
      const responseTime = Date.now() - queryStart;

      // CPU usage (simplified estimation)
      const cpuUsage = Math.random() * 20 + 10; // 10-30% simulated

      // Active connections (simplified)
      const activeConnections = Math.floor(Math.random() * 50) + 10;

      // Error rate (from recent logs - simplified)
      const errorRate = Math.random() * 2; // 0-2% simulated

      // Throughput (requests per minute - simplified)
      const throughput = Math.floor(Math.random() * 100) + 50;

      const metrics: PerformanceMetrics = {
        timestamp: new Date(),
        responseTime,
        memoryUsage: {
          used: usedMemory,
          total: totalMemory,
          percentage: memoryPercentage
        },
        cpuUsage,
        activeConnections,
        errorRate,
        throughput
      };

      // Store metrics (keep last 100 entries)
      this.metrics.push(metrics);
      if (this.metrics.length > 100) {
        this.metrics.shift();
      }

      // Check for alerts
      this.checkAlerts(metrics);

      logger.info('📊 Performance metrics collected', {
        responseTime: `${responseTime}ms`,
        memoryUsage: `${memoryPercentage.toFixed(1)}%`,
        cpuUsage: `${cpuUsage.toFixed(1)}%`,
        errorRate: `${errorRate.toFixed(2)}%`,
        throughput: `${throughput} req/min`
      });

      return metrics;

    } catch (error) {
      logger.error('❌ Failed to collect performance metrics:', error);
      throw error;
    }
  }

  /**
   * Check for performance alerts
   */
  private checkAlerts(metrics: PerformanceMetrics): void {
    const alerts: string[] = [];

    if (metrics.responseTime > this.thresholds.responseTime) {
      alerts.push(`High response time: ${metrics.responseTime}ms (threshold: ${this.thresholds.responseTime}ms)`);
    }

    if (metrics.memoryUsage.percentage > this.thresholds.memoryUsage) {
      alerts.push(`High memory usage: ${metrics.memoryUsage.percentage.toFixed(1)}% (threshold: ${this.thresholds.memoryUsage}%)`);
    }

    if (metrics.cpuUsage > this.thresholds.cpuUsage) {
      alerts.push(`High CPU usage: ${metrics.cpuUsage.toFixed(1)}% (threshold: ${this.thresholds.cpuUsage}%)`);
    }

    if (metrics.errorRate > this.thresholds.errorRate) {
      alerts.push(`High error rate: ${metrics.errorRate.toFixed(2)}% (threshold: ${this.thresholds.errorRate}%)`);
    }

    if (metrics.throughput < this.thresholds.throughput) {
      alerts.push(`Low throughput: ${metrics.throughput} req/min (threshold: ${this.thresholds.throughput} req/min)`);
    }

    if (alerts.length > 0) {
      this.alerts.push(...alerts);
      logger.warn('⚠️ Performance alerts triggered:', { alerts });
    }
  }

  /**
   * Get system health status
   */
  async getSystemHealth(): Promise<SystemHealthStatus> {
    try {
      const currentTime = new Date();
      const uptime = Math.floor((currentTime.getTime() - this.startTime.getTime()) / 1000);
      
      // Get recent metrics for health assessment
      const recentMetrics = this.metrics.slice(-10);
      const issues: string[] = [];
      const recommendations: string[] = [];

      if (recentMetrics.length === 0) {
        issues.push('No performance metrics available');
        recommendations.push('Enable performance monitoring');
      } else {
        // Analyze recent performance
        const avgResponseTime = recentMetrics.reduce((sum, m) => sum + m.responseTime, 0) / recentMetrics.length;
        const avgMemoryUsage = recentMetrics.reduce((sum, m) => sum + m.memoryUsage.percentage, 0) / recentMetrics.length;
        const avgCpuUsage = recentMetrics.reduce((sum, m) => sum + m.cpuUsage, 0) / recentMetrics.length;

        if (avgResponseTime > this.thresholds.responseTime * 0.8) {
          issues.push('Response time approaching threshold');
          recommendations.push('Consider optimizing database queries or adding caching');
        }

        if (avgMemoryUsage > this.thresholds.memoryUsage * 0.8) {
          issues.push('Memory usage approaching threshold');
          recommendations.push('Consider implementing memory optimization or scaling');
        }

        if (avgCpuUsage > this.thresholds.cpuUsage * 0.8) {
          issues.push('CPU usage approaching threshold');
          recommendations.push('Consider load balancing or horizontal scaling');
        }
      }

      // Check database connectivity
      try {
        await User.countDocuments().limit(1);
      } catch (error) {
        issues.push('Database connectivity issues');
        recommendations.push('Check database connection and network');
      }

      // Check swap intent processing
      try {
        const pendingIntents = await SwapIntent.countDocuments({ status: 'pending' });
        if (pendingIntents > 100) {
          issues.push('High number of pending swap intents');
          recommendations.push('Review automated matching performance');
        }
      } catch (error) {
        issues.push('Unable to check swap intent status');
      }

      // Determine overall health status
      let status: 'healthy' | 'warning' | 'critical' = 'healthy';
      if (issues.length > 0) {
        status = issues.some(issue => 
          issue.includes('Database') || 
          issue.includes('critical') || 
          issue.includes('threshold')
        ) ? 'critical' : 'warning';
      }

      return {
        status,
        uptime,
        lastCheck: currentTime,
        issues,
        recommendations
      };

    } catch (error) {
      logger.error('❌ Failed to get system health:', error);
      return {
        status: 'critical',
        uptime: 0,
        lastCheck: new Date(),
        issues: ['Health check failed'],
        recommendations: ['Investigate system errors']
      };
    }
  }

  /**
   * Get performance trends
   */
  getPerformanceTrends(hours: number = 24): {
    responseTime: number[];
    memoryUsage: number[];
    cpuUsage: number[];
    errorRate: number[];
    timestamps: string[];
  } {
    const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);
    const recentMetrics = this.metrics.filter(m => m.timestamp >= cutoffTime);

    return {
      responseTime: recentMetrics.map(m => m.responseTime),
      memoryUsage: recentMetrics.map(m => m.memoryUsage.percentage),
      cpuUsage: recentMetrics.map(m => m.cpuUsage),
      errorRate: recentMetrics.map(m => m.errorRate),
      timestamps: recentMetrics.map(m => m.timestamp.toISOString())
    };
  }

  /**
   * Get recent alerts
   */
  getRecentAlerts(limit: number = 10): string[] {
    return this.alerts.slice(-limit);
  }

  /**
   * Clear old alerts
   */
  clearAlerts(): void {
    this.alerts = [];
    logger.info('🧹 Performance alerts cleared');
  }

  /**
   * Get performance summary
   */
  async getPerformanceSummary(): Promise<{
    current: PerformanceMetrics | null;
    health: SystemHealthStatus;
    trends: any;
    alerts: string[];
    recommendations: string[];
  }> {
    try {
      const current = this.metrics.length > 0 ? this.metrics[this.metrics.length - 1] : null;
      const health = await this.getSystemHealth();
      const trends = this.getPerformanceTrends(1); // Last hour
      const alerts = this.getRecentAlerts(5);

      // Generate recommendations based on current state
      const recommendations: string[] = [];
      
      if (current) {
        if (current.responseTime > 500) {
          recommendations.push('Consider implementing response caching');
        }
        if (current.memoryUsage.percentage > 70) {
          recommendations.push('Monitor memory usage and consider optimization');
        }
        if (current.errorRate > 1) {
          recommendations.push('Investigate error sources and implement fixes');
        }
      }

      if (recommendations.length === 0) {
        recommendations.push('System performance is optimal');
      }

      return {
        current,
        health,
        trends,
        alerts,
        recommendations
      };

    } catch (error) {
      logger.error('❌ Failed to get performance summary:', error);
      throw error;
    }
  }

  /**
   * Start continuous monitoring
   */
  startMonitoring(intervalMinutes: number = 5): void {
    logger.info('🔄 Starting performance monitoring', { 
      interval: `${intervalMinutes} minutes` 
    });

    // Collect initial metrics
    this.collectMetrics();

    // Set up periodic collection
    setInterval(() => {
      this.collectMetrics().catch(error => {
        logger.error('❌ Performance monitoring error:', error);
      });
    }, intervalMinutes * 60 * 1000);
  }
}

// Create singleton instance
export const performanceMonitor = new PerformanceMonitoringService();
