/**
 * Scraper Configuration
 */

export const ScraperConfig = {
  // Rate Limiting
  delays: {
    beforeRequest: { min: 15000, max: 30000 },
    betweenPages: { min: 20000, max: 40000 },
    afterError: { min: 45000, max: 90000 },
    afterCaptcha: { min: 180000, max: 360000 },
    scrollDelay: { min: 1500, max: 4000 },
  },

  // Retry Configuration
  retry: {
    maxAttempts: 3,
    backoffBase: 10000,
    backoffMax: 300000,
    skipOnCaptcha: true,
  },

  // Proxy Configuration
  proxy: {
    rotateOnError: true,
    rotateOnCaptcha: true,
    cooldownMinutes: 15,
    maxFailures: 1,
  },

  // Request Limits
  limits: {
    requestsPerMinute: 4,
    concurrentRequests: 1,
    dailyRequestLimit: 500,
  },

  // Browser Configuration
  browser: {
    headless: true,
    timeout: 120000,
    viewportRotation: true,
    poolSize: 2,
  },

  // Performance Optimizations
  performance: {
    enableCache: true,
    cacheTTL: 7200,
    enableMetrics: true,
    enableBrowserPool: false,
  },
};

export default ScraperConfig;
