import Bottleneck from "bottleneck";
import Redis from "ioredis";
import { logger } from "../lib/logger";
import { NaverProductData } from "../types";
import { randomDelay } from "../lib/fingerprints";
import { proxyManager } from "../lib/proxyManager";
import { NaverScraper } from "./naverScraper";
import { ScraperConfig } from "../config/scraper.config";

// Redis client
const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");

// Rate limiter configuration - REDUCED to avoid CAPTCHA
const maxConcurrent = Number(process.env.MAX_CONCURRENT || 1); // 1 concurrent request only
const minTime = Number(process.env.MIN_TIME || 15000); // 15 seconds between requests

const limiter = new Bottleneck({
  maxConcurrent,
  minTime,
  reservoir: 4, // REDUCED: Only 4 requests per minute
  reservoirRefreshAmount: 4,
  reservoirRefreshInterval: 60 * 1000, // per minute (4 req/min = 1 every 15s)
});

// Metrics tracking
let totalRequests = 0;
let totalErrors = 0;
let totalLatency = 0;

/**
 * Fetch with retry and exponential backoff
 * Special handling for CAPTCHA - immediate proxy rotation
 */
async function fetchWithRetry<T>(
  fetchFn: () => Promise<T>,
  retries = 3,
): Promise<T> {
  let attempt = 0;
  let lastError: any;

  while (attempt < retries) {
    try {
      return await fetchFn();
    } catch (error: any) {
      lastError = error;
      attempt++;
      
      const isCaptcha = error.message?.includes("captcha");
      const is429 = error.message?.includes("429");
      const is490 = error.message?.includes("490");
      const isBlocked = isCaptcha || is429 || is490 || error.message?.includes("Service access");

      // CRITICAL: Don't retry on CAPTCHA - need to rotate proxy and wait
      if (isCaptcha && ScraperConfig.retry.skipOnCaptcha) {
        logger.error(`CAPTCHA detected - stopping retries. Need proxy rotation and long wait.`);
        throw error; // Throw immediately to trigger proxy rotation at higher level
      }

      logger.warn("Fetch attempt failed", { 
        error: String(error), 
        attempt,
        isCaptcha,
        is429,
        is490,
        isBlocked 
      });
      
      if (attempt >= retries) {
        throw error;
      }

      // Calculate backoff - much longer for blocking
      const baseBackoff = isBlocked ? ScraperConfig.retry.backoffBase : 3000;
      const maxBackoff = isBlocked ? ScraperConfig.retry.backoffMax : 30000;
      const backoffTime = Math.min(
        baseBackoff * Math.pow(2, attempt) + Math.random() * 5000,
        maxBackoff,
      );

      logger.warn(
        `Retrying attempt ${attempt}/${retries}${
          isBlocked ? " (BLOCKED - rotating proxy)" : ""
        } in ${Math.round(backoffTime / 1000)}s`,
        { error: String(error), attempt, isBlocked },
      );

      await new Promise((resolve) => setTimeout(resolve, backoffTime));
    }
  }

  throw lastError;
}

/**
 * Get cached product data from Redis
 */
async function getCachedProduct(
  productId: string,
): Promise<NaverProductData | null> {
  try {
    const cached = await redis.get(`product:${productId}`);
    if (cached) {
      logger.debug(`Cache hit for product: ${productId}`);
      return JSON.parse(cached);
    }
  } catch (error) {
    logger.error(`Redis get error: ${error}`);
  }
  return null;
}

/**
 * Cache product data in Redis (TTL: 1 hour)
 */
async function cacheProduct(
  productId: string,
  data: NaverProductData,
): Promise<void> {
  try {
    const ttl = Number(process.env.CACHE_TTL_SECONDS || 3600);
    await redis.setex(`product:${productId}`, ttl, JSON.stringify(data));
    logger.debug(`Cached product: ${productId}`);
  } catch (error) {
    logger.error(`Redis set error: ${error}`);
  }
}

/**
 * Fetch Naver product data 
 */
export async function fetchNaverProduct(
  url: string,
): Promise<NaverProductData> {
  const startTime = Date.now();
  totalRequests++;

  try {
    // Check cache first
    const cached = await getCachedProduct(url);
    if (cached) {
      cached.metadata.cached = true;
      cached.metadata.latency = Date.now() - startTime;
      return cached;
    }

    const scrapedData = await limiter.schedule(async () => {
      // Longer delay to appear more human-like and avoid CAPTCHA
      await randomDelay(
        ScraperConfig.delays.beforeRequest.min,
        ScraperConfig.delays.beforeRequest.max
      );

      return await fetchWithRetry(async () => {
        const scraper = new NaverScraper();
        let currentProxy = null;

        try {
          if (!ScraperConfig.performance.enableBrowserPool) {
            currentProxy = proxyManager.getHealthyProxy();
            logger.info(
              `Using proxy: ${currentProxy?.host}:${currentProxy?.port}`,
            );
          } else {
            logger.debug('Using browser pool (browsers already have proxies)');
          }

          
          await scraper.initialize({
            proxy: currentProxy || undefined,
            timezone: "Asia/Seoul",
            languages: ["ko-KR", "ko", "en-US"],
          });

          const data = await scraper.scrapeProductData(url);

          if (!data.productDetail && !data.benefits) {
            throw new Error("Failed to scrape complete product data");
          }

          if (currentProxy) {
            proxyManager.markProxySuccess(currentProxy);
          }

          return data;
        } catch (error: any) {
          const isCaptcha = error.message?.includes("captcha");
          
          // Mark proxy as failed
          if (currentProxy) {
            proxyManager.markProxyFailed(currentProxy);
            
            // On CAPTCHA, increase failure count more aggressively
            if (isCaptcha && ScraperConfig.proxy.rotateOnCaptcha) {
              logger.error(`CAPTCHA detected on proxy ${currentProxy.host}:${currentProxy.port} - will be rotated`);
              // Mark failed multiple times to trigger cooldown faster
              proxyManager.markProxyFailed(currentProxy);
              proxyManager.markProxyFailed(currentProxy);
            }
          }
          
          // If CAPTCHA, add extra delay before rethrowing
          if (isCaptcha) {
            const captchaDelay = Math.floor(
              Math.random() * 
              (ScraperConfig.delays.afterCaptcha.max - ScraperConfig.delays.afterCaptcha.min) +
              ScraperConfig.delays.afterCaptcha.min
            );
            logger.warn(`CAPTCHA detected - waiting ${Math.round(captchaDelay / 1000)}s before continuing`);
            await new Promise(resolve => setTimeout(resolve, captchaDelay));
          }
          
          throw error;
        } finally {
          await scraper.close();
        }
      }, 5);
    });

    const latency = Date.now() - startTime;
    totalLatency += latency;

    const result: NaverProductData = {
      productDetail: scrapedData.productDetail,
      benefits: scrapedData.benefits,
      metadata: {
        scrapedAt: new Date().toISOString(),
        latency,
        cached: false,
      },
    };

    await cacheProduct(url, result);
    logger.info(`Successfully fetched product ${url} in ${latency}ms`);
    return result;
  } catch (error) {
    totalErrors++;
    logger.error(`Failed to fetch product ${url}: ${error}`);
    throw error;
  }
}
