import express from "express";
import dotenv from "dotenv";
import { parseSmartStoreUrl } from "./lib/parseURL";
import * as fetcher from "./services/fetcher";
import { logger } from "./lib/logger";
import { ScraperConfig } from "./config/scraper.config";
import { proxyManager } from "./lib/proxyManager";
import { Scraper } from "./lib/scraper";

dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;

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

  const parsed = parseSmartStoreUrl(productUrl);

  if (!parsed || !parsed.storeName || !parsed.productId) {
    return res.status(400).json({
      error: "Invalid productUrl format",
      expected:
        "https://smartstore.naver.com/{store_name}/products/{product_id}",
    });
  }

  try {
    logger.debug(
      `Processing request for: ${parsed.storeName}/products/${parsed.productId}`,
    );
    const productData = await fetcher.fetchNaverProduct(productUrl);
    return res.json(productData);
  } catch (error: any) {
    logger.error(`Error fetching product data: ${error.message}`, { error });
    return res.status(500).json({
      error: "Failed to fetch product data",
      message: error.message,
      productUrl,
    });
  }
});
// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: "Not found",
  });
});

app.listen(PORT, () => {
  logger.info(`Server is running on port ${PORT}`);
  logger.info(`Health check: http://localhost:${PORT}/health`);
  logger.info(`Metrics: http://localhost:${PORT}/metrics`);
});

// Graceful shutdown
process.on("SIGINT", async () => {
  logger.info("Received SIGINT. Shutting down gracefully...");
  process.exit(0);
});

process.on("SIGTERM", async () => {
  logger.info("Received SIGTERM. Shutting down gracefully...");
  process.exit(0);
});
