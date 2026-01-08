import { Browser } from "playwright";
import { logger } from "./logger";
import { ProxyConfig } from "../types";

interface PooledBrowser {
  browser: Browser;
  proxy: ProxyConfig | null;
}

/**
 * Browser Pool - Manages pool of browser instances
 * Does NOT create browsers - that's Scraper's responsibility
 */
export class BrowserPool {
  private browsers: PooledBrowser[] = [];
  private availableBrowsers: PooledBrowser[] = [];
  private readonly poolSize: number;
  private isShuttingDown = false;

  constructor(poolSize: number = 2) {
    this.poolSize = poolSize;
  }

  /**
   * Add browser to pool
   */
  async addBrowser(
    browser: Browser,
    proxy: ProxyConfig | null = null,
  ): Promise<void> {
    const pooledBrowser: PooledBrowser = { browser, proxy };
    this.browsers.push(pooledBrowser);
    this.availableBrowsers.push(pooledBrowser);

    logger.debug(`Browser added to pool (total: ${this.browsers.length})`);
  }

  /**
   * Get pool size
   */
  getPoolSize(): number {
    return this.poolSize;
  }

  /**
   * Acquire a browser from the pool (optionally matching proxy)
   */
  async acquire(
    preferredProxy?: ProxyConfig | null,
  ): Promise<{ browser: Browser; proxy: ProxyConfig | null }> {
    // Wait for available browser (with timeout)
    const timeout = 30000; // 30 seconds
    const startTime = Date.now();

    while (this.availableBrowsers.length === 0) {
      if (Date.now() - startTime > timeout) {
        throw new Error("Timeout waiting for available browser");
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // Try to find browser with matching proxy
    let pooledBrowser: PooledBrowser | undefined;

    if (preferredProxy) {
      pooledBrowser = this.availableBrowsers.find(
        (pb) =>
          pb.proxy?.host === preferredProxy.host &&
          pb.proxy?.port === preferredProxy.port,
      );
    } else {
      // Find browser without proxy if no proxy preferred
      pooledBrowser = this.availableBrowsers.find((pb) => pb.proxy === null);
    }

    // If no match, take any available browser
    if (!pooledBrowser) {
      pooledBrowser = this.availableBrowsers.shift()!;
      if (preferredProxy && pooledBrowser.proxy) {
        logger.debug(
          `No exact proxy match, using ${pooledBrowser.proxy.host}:${pooledBrowser.proxy.port}`,
        );
      }
    } else {
      // Remove from available list
      const index = this.availableBrowsers.indexOf(pooledBrowser);
      this.availableBrowsers.splice(index, 1);
    }

    logger.debug(
      `Browser acquired (${this.availableBrowsers.length} available)`,
    );
    return { browser: pooledBrowser.browser, proxy: pooledBrowser.proxy };
  }

  /**
   * Release browser back to pool
   */
  async release(browser: Browser): Promise<void> {
    const pooledBrowser = this.browsers.find((pb) => pb.browser === browser);

    if (!this.isShuttingDown && pooledBrowser) {
      // Check if browser is still connected
      if (browser.isConnected()) {
        this.availableBrowsers.push(pooledBrowser);
        logger.debug(
          `Browser released (${this.availableBrowsers.length} available)`,
        );
      } else {
        // Browser disconnected, remove from pool
        logger.warn("Browser disconnected, removing from pool");
        await this.removeBrowser(pooledBrowser);
      }
    }
  }

  /**
   * Remove a disconnected browser from pool
   */
  private async removeBrowser(pooledBrowser: PooledBrowser): Promise<void> {
    const index = this.browsers.indexOf(pooledBrowser);
    if (index > -1) {
      this.browsers.splice(index, 1);
      logger.warn("Disconnected browser removed from pool");
    }

    const availableIndex = this.availableBrowsers.indexOf(pooledBrowser);
    if (availableIndex > -1) {
      this.availableBrowsers.splice(availableIndex, 1);
    }
  }

  /**
   * Get pool stats
   */
  getStats() {
    return {
      total: this.browsers.length,
      available: this.availableBrowsers.length,
      inUse: this.browsers.length - this.availableBrowsers.length,
      proxies: this.browsers.map((pb) =>
        pb.proxy ? `${pb.proxy.host}:${pb.proxy.port}` : "no-proxy",
      ),
    };
  }

  /**
   * Gracefully shutdown all browsers
   */
  async shutdown(): Promise<void> {
    this.isShuttingDown = true;
    logger.info("Shutting down browser pool...");

    for (const pooledBrowser of this.browsers) {
      try {
        if (pooledBrowser.browser.isConnected()) {
          await pooledBrowser.browser.close();
        }
      } catch (error) {
        logger.error(`Error closing browser: ${error}`);
      }
    }

    this.browsers = [];
    this.availableBrowsers = [];
    logger.info("Browser pool shutdown complete");
  }
}

// Singleton instance
let browserPool: BrowserPool | null = null;

/**
 * Get browser pool instance (must be initialized first)
 */
export function getBrowserPool(): BrowserPool {
  if (!browserPool) {
    throw new Error(
      "Browser pool not initialized. Call initializeBrowserPool() first.",
    );
  }
  return browserPool;
}

/**
 * Initialize browser pool at server startup
 * Does NOT create browsers - just creates the pool manager
 */
export function initializeBrowserPool(size: number = 2): BrowserPool {
  if (!browserPool) {
    browserPool = new BrowserPool(size);
    logger.info(`Browser pool manager created (target size: ${size})`);
  }
  return browserPool;
}

export async function shutdownBrowserPool(): Promise<void> {
  if (browserPool) {
    await browserPool.shutdown();
    browserPool = null;
  }
}
