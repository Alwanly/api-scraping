/**
 * Scraper Configuration
 * Adjust these values to control rate limiting and anti-detection behavior
 * 
 * FOR PERFORMANCE (1000+ products test):
 * - Use headless: true (20-30% faster)
 * - Reduce delays (but watch for 429 errors)
 * - Increase concurrency via environment variables
 * - CRITICAL: Use Redis cache for massive speedup
 */

export const ScraperConfig = {
  // Rate Limiting - SLOWER to avoid CAPTCHA
  delays: {
    beforeRequest: { min: 8000, max: 15000 },     // 8-15 seconds (more human-like)
    betweenPages: { min: 10000, max: 20000 },     // 10-20 seconds between products
    afterError: { min: 30000, max: 60000 },       // 30-60 seconds after error (avoid pattern detection)
    afterCaptcha: { min: 120000, max: 300000 },   // 2-5 minutes after CAPTCHA detection
    scrollDelay: { min: 1000, max: 3000 },        // 1-3 seconds during scrolling (more natural)
  },

  // Retry Configuration
  retry: {
    maxAttempts: 3,                                // REDUCED: Max retry attempts (avoid repeated CAPTCHA)
    backoffBase: 10000,                           // INCREASED: Start backoff at 10 seconds
    backoffMax: 300000,                           // INCREASED: Max backoff of 5 minutes
    skipOnCaptcha: true,                          // Skip retries on CAPTCHA (rotate proxy instead)
  },

  // Proxy Configuration
  proxy: {
    rotateOnError: true,                          // Rotate to new proxy on error
    rotateOnCaptcha: true,                        // ALWAYS rotate proxy on CAPTCHA
    cooldownMinutes: 15,                          // INCREASED: Longer cooldown after failures
    maxFailures: 1,                               // REDUCED: Rotate after 1 CAPTCHA (aggressive rotation)
  },

  // Request Limits (Override via environment variables)
  limits: {
    requestsPerMinute: 4,                         // REDUCED: Max 4 requests per minute (avoid CAPTCHA)
    concurrentRequests: 1,                        // REDUCED: Process 1 at a time (safer)
    dailyRequestLimit: 500,                       // REDUCED: Conservative daily limit
  },

  // Browser Configuration  
  browser: {
    headless: true,                               // Headless mode for better performance
    timeout: 120000,                              // 2 minute timeout
    viewportRotation: true,                       // Rotate viewport sizes
    poolSize: 2,                                  // Number of browser instances in pool
  },

  // Performance Optimizations
  performance: {
    enableCache: true,                            // Use Redis cache (CRITICAL)
    cacheTTL: 7200,                               // 2 hours cache TTL
    enableMetrics: true,                          // Track performance metrics
    enableBrowserPool: false,                      // Browser pooling (eliminates cold start)
  },
};

export default ScraperConfig;
