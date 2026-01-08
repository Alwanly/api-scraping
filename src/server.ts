import express from 'express';
import dotenv from 'dotenv';
import { parseSmartStoreUrl } from './lib/parseURL';
import * as fetcher from './services/fetcher';
import { logger } from './lib/logger';
import { metricsTracker } from './lib/metrics';
import { initializeBrowserPool, getBrowserPool, shutdownBrowserPool } from './lib/browserPool';
import { ScraperConfig } from './config/scraper.config';
import { proxyManager } from './lib/proxyManager';
import { Scraper } from './lib/scraper';

dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Initialize browser pool at startup if enabled
if (ScraperConfig.performance.enableBrowserPool) {
  let poolSize = ScraperConfig.browser.poolSize;
  const proxies = proxyManager.getAllProxies();
  
  logger.info(`Initializing browser pool: size=${poolSize}, proxies=${proxies.length}`);
  
  // Create pool manager (doesn't create browsers yet)
  const pool = initializeBrowserPool(poolSize);
  
  // Create and add browsers to pool
  (async () => {
    try {
      for (let i = 0; i < poolSize; i++) {
        // Rotate through proxies if available
        const proxy = proxies.length > 0 ? proxies[i % proxies.length] : null;
        
        // Use Scraper's static method to create browser
        const browser = await Scraper.createBrowser(proxy);
        
        // Add to pool
        await pool.addBrowser(browser, proxy);
        
        if (proxy) {
          logger.info(`Browser ${i + 1}/${poolSize} added to pool with proxy ${proxy.host}:${proxy.port}`);
        } else {
          logger.info(`Browser ${i + 1}/${poolSize} added to pool (no proxy)`);
        }
      }
      logger.info(`✓ Browser pool ready with ${poolSize} browsers`);
    } catch (err: any) {
      logger.warn(`Browser pool initialization failed: ${err.message}`);
    }
  })();
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// Metrics endpoint
app.get('/metrics', (req, res) => {
  const windowMinutes = parseInt(req.query.window as string) || 60;
  const metrics = metricsTracker.getMetrics(windowMinutes);
  const errors = metricsTracker.getErrors(10);
  const requirements = metricsTracker.checkRequirements();

  res.json({
    metrics,
    topErrors: errors,
    requirements,
    timestamp: new Date().toISOString(),
  });
});

app.get("/naver", async (req, res) => {
  const productUrl = String(req.query.productUrl || "");
  
  if (!productUrl) {
    return res.status(400).json({ 
      error: "Missing productUrl query parameter",
      example: "?productUrl=https://smartstore.naver.com/rainbows9030/products/11102379008"
    });
  }

  const parsed = parseSmartStoreUrl(productUrl);
  
  if (!parsed || !parsed.storeName || !parsed.productId) {
    return res.status(400).json({ 
      error: "Invalid productUrl format",
      expected: "https://smartstore.naver.com/{store_name}/products/{product_id}"
    });
  }

  try {
    logger.debug(`Processing request for: ${parsed.storeName}/products/${parsed.productId}`);
    const productData = await fetcher.fetchNaverProduct(productUrl);
    return res.json(productData);
  } catch (error: any) {
    logger.error(`Error fetching product data: ${error.message}`, { error });
    return res.status(500).json({ 
      error: "Failed to fetch product data",
      message: error.message,
      productUrl
    });
  }
});
// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
  });
});

app.listen(PORT, () => {
  logger.info(`Server is running on port ${PORT}`);
  logger.info(`Health check: http://localhost:${PORT}/health`);
  logger.info(`Metrics: http://localhost:${PORT}/metrics`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Received SIGINT. Shutting down gracefully...');
  await shutdownBrowserPool();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM. Shutting down gracefully...');
  await shutdownBrowserPool();
  process.exit(0);
});