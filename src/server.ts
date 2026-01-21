import express from "express";
import dotenv from "dotenv";
import { logger } from "./lib/logger";
import { BrowserPool } from "./lib/browser/browserPool";
import { ProxyManager } from "./lib/proxy/proxyManager";
import { NaverScraper, parseNaverProductUrl } from "./services/naver";

dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;

// Initialize services
let browserPool: BrowserPool;
let proxyManager: ProxyManager;
let naverScraper: NaverScraper;

async function initializeServices() {
  logger.info("Initializing scraping services...");

  // Initialize proxy manager (optional)
  const useProxy = process.env.USE_PROXY === "true";
  if (useProxy) {
    proxyManager = new ProxyManager();
    await proxyManager.initialize();
    logger.info("Proxy Manager initialized");
  }

  // Initialize browser pool
  browserPool = new BrowserPool(
    {
      maxBrowsers: parseInt(process.env.MAX_BROWSERS || "3"),
      minBrowsers: 1,
      maxPagesPerBrowser: 3,
      headless: process.env.HEADLESS !== "false",
      stealth: true,
      proxy: useProxy ? { enabled: true, rotatePerBrowser: true } : undefined,
    },
    proxyManager
  );
  await browserPool.initialize();
  logger.info("Browser Pool initialized");

  // Initialize Naver scraper
  naverScraper = new NaverScraper(browserPool);
  logger.info("Naver Scraper initialized");
}

app.use(express.json());

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

app.get("/naver", async (req, res) => {
  const productUrl = String(req.query.productUrl || "");

  if (!productUrl) {
    return res.status(400).json({
      error: "Missing productUrl query parameter",
      example:
        "?productUrl=https://smartstore.naver.com/rainbows9030/products/11102379008",
    });
  }


  try {
    logger.info(`Processing Naver product: ${productUrl}`);

    // Scrape product with retry
    const result = await naverScraper.scrapeProductWithRetry(productUrl, {
      extractImages: true,
      extractOptions: true,
      timeout: 30000,
    });

    if (!result.success) {
      return res.status(500).json({
        error: "Failed to scrape product",
        message: result.error,
        productUrl,
        retries: result.retries,
      });
    }

    return res.json({
      success: true,
      data: result.data,
      metadata: {
        scrapedAt: result.data?.scrapedAt,
        duration: result.duration,
        retries: result.retries,
      },
    });
  } catch (error: any) {
    logger.error(`Error fetching product data: ${error.message}`, { error });
    return res.status(500).json({
      error: "Failed to fetch product data",
      message: error.message,
      productUrl,
    });
  }
});

// Stats endpoint
app.get("/stats", (req, res) => {
  const browserStats = browserPool?.getStats();
  const proxyStats = proxyManager?.getStats();

  res.json({
    browserPool: browserStats || null,
    proxyManager: proxyStats || null,
    uptime: process.uptime(),
    memory: process.memoryUsage(),
  });
});
// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: "Not found",
  });
});

// Start server after services are initialized
initializeServices()
  .then(() => {
    app.listen(PORT, () => {
      logger.info(`Server is running on port ${PORT}`);
    });
  })
  .catch((error) => {
    logger.error("Failed to initialize services:", error);
    process.exit(1);
  });

// Graceful shutdown
process.on("SIGINT", async () => {
  logger.info("Received SIGINT. Shutting down gracefully...");
  if (browserPool) await browserPool.shutdown();
  if (proxyManager) await proxyManager.stop();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  logger.info("Received SIGTERM. Shutting down gracefully...");
  if (browserPool) await browserPool.shutdown();
  if (proxyManager) await proxyManager.stop();
  process.exit(0);
});
