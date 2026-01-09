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
    beforeRequest: { min: 15000, max: 30000 },    // 15-30 seconds (very human-like)
    betweenPages: { min: 20000, max: 40000 },     // 20-40 seconds between products
    afterError: { min: 45000, max: 90000 },       // 45-90 seconds after error
    afterCaptcha: { min: 180000, max: 360000 },   // 3-6 minutes after CAPTCHA detection
    scrollDelay: { min: 1500, max: 4000 },        // 1.5-4 seconds during scrolling
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
    headless: false,                              // NON-HEADLESS for better stealth (headless is easily detected)
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
