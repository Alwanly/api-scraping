import Bottleneck from "bottleneck";
import Redis from "ioredis";
import { logger } from "../lib/logger";
import { NaverProductData } from "../types";
import { randomDelay } from "../lib/fingerprints";
import { proxyManager } from "../lib/proxyManager";
import { NaverScraper } from "./naverScraper";
import { ScraperConfig } from "../config/scraper.config";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

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
 * Fetch with retry and immediate proxy rotation
 * Failed proxy is put in cooldown, next attempt uses different proxy immediately
 */
async function fetchWithRetry<T>(
  fetchFn: (attemptNumber: number) => Promise<T>,
  retries = 3,
): Promise<T> {
  let attempt = 0;
  let lastError: any;

  while (attempt < retries) {
    attempt++;

    try {
      return await fetchFn(attempt);
    } catch (error: any) {
      lastError = error;

      const isCaptcha = error.message?.includes("captcha");
      const is429 = error.message?.includes("429");
      const is490 = error.message?.includes("490");
      const isBlocked =
        isCaptcha ||
        is429 ||
        is490 ||
        error.message?.includes("Service access");

      logger.warn(`Attempt ${attempt}/${retries} failed`, {
        error: String(error),
        isCaptcha,
        is429,
        is490,
        isBlocked,
      });

      if (attempt >= retries) {
        logger.error(`All ${retries} attempts failed for request`);
        throw error;
      }

      // Short delay before next attempt (proxy already rotated automatically)
      // No long backoff needed since we're using a different proxy
      const rotationDelay = isBlocked ? 2000 : 1000; // 1-2s just to avoid hammering

      logger.info(
        `Rotating to new proxy in ${
          rotationDelay / 1000
        }s (failed proxy now in cooldown)`,
      );

      await new Promise((resolve) => setTimeout(resolve, rotationDelay));
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
        ScraperConfig.delays.beforeRequest.max,
      );

      return await fetchWithRetry(async (attemptNumber: number) => {
        const scraper = new NaverScraper();
        let currentProxy = null;

        try {
          if (!ScraperConfig.performance.enableBrowserPool) {
            // Get a new healthy proxy for each attempt (automatic rotation on retry)
            currentProxy = proxyManager.getHealthyProxy();
            if (currentProxy) {
              logger.info(
                `[Attempt ${attemptNumber}] Using proxy: ${currentProxy.host}:${currentProxy.port}`,
              );
            } else {
              logger.warn(`[Attempt ${attemptNumber}] No proxy available`);
            }
          } else {
            logger.debug("Using browser pool (browsers already have proxies)");
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
            logger.info(
              `Proxy ${currentProxy.host}:${currentProxy.port} succeeded`,
            );
          }

          return data;
        } catch (error: any) {
          const isCaptcha = error.message?.includes("captcha");
          const is429 = error.message?.includes("429");
          const is490 = error.message?.includes("490");

          // Immediately mark proxy as failed to put it in cooldown
          if (currentProxy) {
            // On CAPTCHA or blocking, mark failed multiple times for longer cooldown
            if (isCaptcha || is429 || is490) {
              logger.error(
                `Proxy ${currentProxy.host}:${currentProxy.port} BLOCKED (${
                  isCaptcha ? "CAPTCHA" : is429 ? "429" : "490"
                }) - putting in cooldown`,
              );
              proxyManager.markProxyFailed(currentProxy);
            } else {
              logger.warn(
                `Proxy ${currentProxy.host}:${currentProxy.port} failed - marking for rotation`,
              );
              proxyManager.markProxyFailed(currentProxy);
            }
          }

          throw error;
        } finally {
          await scraper.close();
        }
      }, 3);
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
