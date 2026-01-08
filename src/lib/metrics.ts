/**
 * Performance Metrics Tracker
 */
export class MetricsTracker {
  private requests: Array<{
    timestamp: number;
    latency: number;
    success: boolean;
    cached: boolean;
    error?: string;
  }> = [];

  private startTime: number = Date.now();

  /**
   * Record a request
   */
  record(latency: number, success: boolean, cached: boolean = false, error?: string) {
    this.requests.push({
      timestamp: Date.now(),
      latency,
      success,
      cached,
      error,
    });

    // Keep only last 10000 requests to prevent memory leak
    if (this.requests.length > 10000) {
      this.requests = this.requests.slice(-10000);
    }
  }

  /**
   * Get current metrics
   */
  getMetrics(windowMinutes: number = 60) {
    const now = Date.now();
    const windowMs = windowMinutes * 60 * 1000;
    const recentRequests = this.requests.filter(r => now - r.timestamp < windowMs);

    if (recentRequests.length === 0) {
      return {
        totalRequests: 0,
        successRate: 0,
        errorRate: 0,
        averageLatency: 0,
        medianLatency: 0,
        p95Latency: 0,
        p99Latency: 0,
        cacheHitRate: 0,
        requestsPerMinute: 0,
        uptime: Math.floor((now - this.startTime) / 1000),
      };
    }

    const totalRequests = recentRequests.length;
    const successfulRequests = recentRequests.filter(r => r.success).length;
    const cachedRequests = recentRequests.filter(r => r.cached).length;
    
    const latencies = recentRequests.map(r => r.latency).sort((a, b) => a - b);
    const sumLatency = latencies.reduce((sum, l) => sum + l, 0);

    return {
      totalRequests,
      successfulRequests,
      failedRequests: totalRequests - successfulRequests,
      successRate: ((successfulRequests / totalRequests) * 100).toFixed(2),
      errorRate: (((totalRequests - successfulRequests) / totalRequests) * 100).toFixed(2),
      averageLatency: Math.round(sumLatency / totalRequests),
      medianLatency: Math.round(latencies[Math.floor(latencies.length / 2)]),
      p95Latency: Math.round(latencies[Math.floor(latencies.length * 0.95)]),
      p99Latency: Math.round(latencies[Math.floor(latencies.length * 0.99)]),
      minLatency: Math.round(latencies[0]),
      maxLatency: Math.round(latencies[latencies.length - 1]),
      cacheHitRate: ((cachedRequests / totalRequests) * 100).toFixed(2) + '%',
      requestsPerMinute: Math.round((totalRequests / windowMinutes)),
      uptime: Math.floor((now - this.startTime) / 1000),
      uptimeFormatted: this.formatUptime(now - this.startTime),
    };
  }

  /**
   * Get detailed error breakdown
   */
  getErrors(limit: number = 10) {
    const errors: { [key: string]: number } = {};
    
    this.requests
      .filter(r => !r.success && r.error)
      .forEach(r => {
        const errorType = r.error || 'Unknown';
        errors[errorType] = (errors[errorType] || 0) + 1;
      });

    return Object.entries(errors)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([error, count]) => ({ error, count }));
  }

  /**
   * Check if requirements are met
   */
  checkRequirements() {
    const metrics = this.getMetrics(60);
    
    // Parse percentage strings to numbers for comparison
    const errorRateValue = parseInt(metrics.errorRate as unknown as string);
    
    const checks = [
      {
        name: 'Average Latency ≤6s',
        required: 6000,
        actual: metrics.averageLatency,
        passed: metrics.averageLatency <= 6000,
        status: metrics.averageLatency <= 6000 ? '✅ PASS' : '❌ FAIL',
      },
      {
        name: 'Error Rate ≤5%',
        required: '5%',
        actual: metrics.errorRate,
        passed: errorRateValue <= 5,
        status: errorRateValue <= 5 ? '✅ PASS' : '❌ FAIL',
      },
      {
        name: 'Total Requests ≥1000',
        required: 1000,
        actual: metrics.totalRequests,
        passed: metrics.totalRequests >= 1000,
        status: metrics.totalRequests >= 1000 ? '✅ PASS' : '⏳ IN PROGRESS',
      },
      {
        name: 'Uptime ≥1 hour',
        required: '3600s',
        actual: `${metrics.uptime}s`,
        passed: metrics.uptime >= 3600,
        status: metrics.uptime >= 3600 ? '✅ PASS' : '⏳ IN PROGRESS',
      },
    ];
    
    const allPassed = checks.every(check => check.passed);
    
    return {
      passed: allPassed,
      checks,
    };
  }

  /**
   * Reset metrics
   */
  reset() {
    this.requests = [];
    this.startTime = Date.now();
  }

  /**
   * Format uptime
   */
  private formatUptime(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }
}

// Singleton instance
export const metricsTracker = new MetricsTracker();
