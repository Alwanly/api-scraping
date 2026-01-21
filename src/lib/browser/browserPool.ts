import { Browser, BrowserContext, Page } from 'playwright';
import { randomUUID } from 'crypto';
import { BrowserInstance, BrowserPoolConfig, BrowserPoolStats, PageOptions } from './types';
import { BrowserProfileManager } from './profileManager';
import { BrowserlessConnector } from './browserlessConnector';
import { DEFAULT_BROWSER_CONFIG } from './default';
import { logger } from '../logger';
import { ProxyManager } from '../proxy/proxyManager';

export class BrowserPool {
  private config: BrowserPoolConfig;
  private browsers: Map<string, BrowserInstance> = new Map();
  private contexts: Map<string, BrowserContext> = new Map();
  private profileManager: BrowserProfileManager;
  private connector: BrowserlessConnector;
  private proxyManager?: ProxyManager;
  private isRunning: boolean = false;
  private cleanupInterval?: NodeJS.Timeout;

  constructor(config?: Partial<BrowserPoolConfig>, proxyManager?: ProxyManager) {
    this.config = { ...DEFAULT_BROWSER_CONFIG, ...config };
    this.profileManager = new BrowserProfileManager(
      this.config.profileRotationStrategy,
      this.config.profileRotationInterval
    );
    this.connector = new BrowserlessConnector(
      this.config.browserlessEndpoint,
      this.config.usePlaywright
    );
    this.proxyManager = proxyManager;
  }

  /**
   * Initialize the browser pool
   */
  async initialize(): Promise<void> {
    logger.info('Initializing Browser Pool');

    // Pre-create minimum browsers
    for (let i = 0; i < this.config.minBrowsers; i++) {
      await this.createBrowser();
    }

    this.isRunning = true;
    this.startCleanupLoop();

    logger.info(`Browser Pool initialized with ${this.browsers.size} browsers`);
  }

  /**
   * Get or create a browser instance
   */
  async getBrowser(): Promise<BrowserInstance> {
    // Try to get an available browser
    let browserInstance = this.getAvailableBrowser();

    // Create new if none available and under max limit
    if (!browserInstance && this.browsers.size < this.config.maxBrowsers) {
      browserInstance = await this.createBrowser();
    }

    // Wait for available browser if at max capacity
    if (!browserInstance) {
      logger.warn('Browser pool at maximum capacity, waiting for available browser');
      await new Promise(resolve => setTimeout(resolve, 1000));
      return this.getBrowser();
    }

    browserInstance.isActive = true;
    browserInstance.lastUsed = new Date();

    return browserInstance;
  }

  /**
   * Create a new page in a browser
   */
  async createPage(options: PageOptions = {}): Promise<{ page: Page; browserId: string }> {
    const browserInstance = await this.getBrowser();

    if (!browserInstance.browser) {
      throw new Error('Browser instance has no active browser');
    }

    // Check if browser has too many pages
    if (browserInstance.pages.size >= this.config.maxPagesPerBrowser) {
      logger.warn(`Browser ${browserInstance.id} has max pages, getting another browser`);
      return this.createPage(options);
    }

    try {
      // Get or create context
      let context = this.contexts.get(browserInstance.id);
      if (!context) {
        context = await this.connector.createContext(
          browserInstance.browser,
          browserInstance.profile,
          {
            proxy: browserInstance.proxy ? {
              server: `http://${browserInstance.proxy.host}:${browserInstance.proxy.port}`,
              username: browserInstance.proxy.username,
              password: browserInstance.proxy.password,
            } : undefined,
            stealth: this.config.stealth,
          }
        );
        this.contexts.set(browserInstance.id, context);
      }

      const page = await this.connector.createPage(context, options);
      const pageId = randomUUID();
      browserInstance.pages.set(pageId, page);

      logger.debug(`Created page ${pageId} in browser ${browserInstance.id}`);

      return { page, browserId: browserInstance.id };
    } catch (error) {
      logger.error(`Failed to create page: ${error}`);
      throw error;
    }
  }

  /**
   * Close a specific page
   */
  async closePage(browserId: string, page: Page): Promise<void> {
    const browserInstance = this.browsers.get(browserId);
    if (!browserInstance) return;

    try {
      await page.close();
      
      // Remove from pages map
      for (const [pageId, p] of browserInstance.pages.entries()) {
        if (p === page) {
          browserInstance.pages.delete(pageId);
          break;
        }
      }

      logger.debug(`Closed page in browser ${browserId}`);
    } catch (error) {
      logger.error(`Error closing page: ${error}`);
    }
  }

  /**
   * Close a browser instance
   */
  async closeBrowser(browserId: string): Promise<void> {
    const browserInstance = this.browsers.get(browserId);
    if (!browserInstance) return;

    try {
      // Close all pages
      for (const page of browserInstance.pages.values()) {
        await page.close();
      }

      // Close context
      const context = this.contexts.get(browserId);
      if (context) {
        await this.connector.closeContext(context);
        this.contexts.delete(browserId);
      }

      // Close browser
      if (browserInstance.browser) {
        await this.connector.closeBrowser(browserInstance.browser);
      }

      // Release profile
      this.profileManager.releaseProfile(browserInstance.profile.id);

      this.browsers.delete(browserId);
      logger.info(`Closed browser: ${browserId}`);
    } catch (error) {
      logger.error(`Error closing browser ${browserId}: ${error}`);
    }
  }

  /**
   * Report successful page operation
   */
  reportSuccess(browserId: string): void {
    const browserInstance = this.browsers.get(browserId);
    if (!browserInstance) return;

    this.profileManager.updateProfileUsage(browserInstance.profile.id, true);
  }

  /**
   * Report failed page operation
   */
  reportFailure(browserId: string): void {
    const browserInstance = this.browsers.get(browserId);
    if (!browserInstance) return;

    this.profileManager.updateProfileUsage(browserInstance.profile.id, false);
  }

  /**
   * Get pool statistics
   */
  getStats(): BrowserPoolStats {
    const totalPages = Array.from(this.browsers.values()).reduce(
      (sum, b) => sum + b.pages.size,
      0
    );
    const profileStats = this.profileManager.getStats();

    return {
      totalBrowsers: this.browsers.size,
      activeBrowsers: Array.from(this.browsers.values()).filter(b => b.isActive).length,
      totalPages,
      totalProfiles: profileStats.total,
      profilesInUse: profileStats.active,
      averagePageLoadTime: 0, // TODO: Implement timing tracking
    };
  }

  /**
   * Shutdown the browser pool
   */
  async shutdown(): Promise<void> {
    this.isRunning = false;
    
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    logger.info('Shutting down Browser Pool');

    // Close all browsers
    const closePromises = Array.from(this.browsers.keys()).map(id => this.closeBrowser(id));
    await Promise.all(closePromises);

    this.profileManager.clearProfiles();

    logger.info('Browser Pool shut down successfully');
  }

  /**
   * Create a new browser instance
   */
  private async createBrowser(): Promise<BrowserInstance> {
    try {
      // Get profile
      const profile = this.profileManager.getProfile();

      // Get proxy if enabled
      let proxy = null;
      if (this.config.proxy?.enabled && this.proxyManager) {
        const proxyObj = await this.proxyManager.getProxy();
        if (proxyObj) {
          proxy = {
            host: proxyObj.host,
            port: proxyObj.port,
            username: proxyObj.username,
            password: proxyObj.password,
          };
        }
      }

      // Launch browser
      const browser = await this.connector.launchBrowser({
        headless: this.config.headless,
        proxy: proxy ? {
          server: `http://${proxy.host}:${proxy.port}`,
          username: proxy.username,
          password: proxy.password,
        } : undefined,
      });

      const instance: BrowserInstance = {
        id: randomUUID(),
        profile,
        browser,
        pages: new Map(),
        isActive: false,
        createdAt: new Date(),
        lastUsed: null,
        proxy,
      };

      this.browsers.set(instance.id, instance);
      logger.info(`Created browser instance: ${instance.id} with profile: ${profile.id}`);

      return instance;
    } catch (error) {
      logger.error(`Failed to create browser: ${error}`);
      throw error;
    }
  }

  /**
   * Get an available browser from the pool
   */
  private getAvailableBrowser(): BrowserInstance | undefined {
    for (const browser of this.browsers.values()) {
      if (!browser.isActive && browser.pages.size < this.config.maxPagesPerBrowser) {
        return browser;
      }
    }
    return undefined;
  }

  /**
   * Start cleanup loop to remove idle browsers
   */
  private startCleanupLoop(): void {
    this.cleanupInterval = setInterval(async () => {
      if (!this.isRunning) return;

      const now = Date.now();
      const browsersToClose: string[] = [];

      for (const [id, browser] of this.browsers.entries()) {
        // Skip if browser has active pages
        if (browser.pages.size > 0) continue;

        // Skip if not enough browsers
        if (this.browsers.size <= this.config.minBrowsers) continue;

        // Check if idle timeout exceeded
        if (browser.lastUsed) {
          const idleTime = now - browser.lastUsed.getTime();
          if (idleTime >= this.config.browserTimeout) {
            browsersToClose.push(id);
          }
        }
      }

      // Close idle browsers
      for (const id of browsersToClose) {
        await this.closeBrowser(id);
        logger.info(`Cleaned up idle browser: ${id}`);
      }
    }, 60000); // Check every minute
  }
}
