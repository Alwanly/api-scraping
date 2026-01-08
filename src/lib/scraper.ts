import { chromium, Browser, Page, BrowserContext, firefox } from 'playwright';
import { generateFingerprint } from "../lib/fingerprints";
import { getBrowserPool } from "../lib/browserPool";
import { BrowserFingerprint, ProxyConfig, ScraperOptions } from "../types";
import { logger } from "../lib/logger";
import { ScraperConfig } from "../config/scraper.config";

/**
 * Scraper - Anti-detection web scraper using Playwright
 */
export class Scraper {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private usingPooledBrowser: boolean = false;
  private proxyConfig: ProxyConfig | null = null;

  private timezone: string = "Asia/Jakarta";
  private languages: string[] = ["id-ID", "id", "en-US", "en"];
  private fingerprint: BrowserFingerprint | null = null;

  async initialize(options: ScraperOptions = {}): Promise<void> {
    const fingerprint = generateFingerprint();
    const proxy = options.proxy;
    const timezone = options.timezone ?? "Asia/Seoul";
    const languages = options.languages ?? [
      "ko-KR",
      "ko",
      "en-US",
      "id-ID",
      "id",
    ];

    if (ScraperConfig.performance.enableBrowserPool) {
      try {
        const pool = getBrowserPool();
        const pooled = await pool.acquire(proxy);
        this.browser = pooled.browser as any;
        this.usingPooledBrowser = true;
        
        if (pooled.proxy) {
          this.proxyConfig = pooled.proxy;
          logger.debug(`Acquired browser from pool with proxy ${pooled.proxy.host}:${pooled.proxy.port}`);
        } else {
          logger.debug('Acquired browser from pool (no proxy)');
        }
      } catch (error: any) {
        logger.warn(`Failed to acquire pooled browser: ${error.message}, creating new browser`);
      }
    }
    
    if (!this.browser) {
      this.browser = await Scraper.createBrowser(proxy);
      this.usingPooledBrowser = false;
      this.proxyConfig = proxy || null;
    }
    
    this.timezone = timezone;
    this.languages = languages;
    this.fingerprint = fingerprint;
  }

  /**
   * Create a new browser instance with Playwright
   */
  static async createBrowser(proxy: ProxyConfig | null = null): Promise<Browser> {
    const launchOptions: any = {
      headless: ScraperConfig.browser.headless,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-blink-features=AutomationControlled",
      ],
      ignoreHTTPSErrors: true,
      channel: 'msedge', // Use Edge browser
    };

    // Configure proxy for Playwright
    if (proxy) {
      launchOptions.proxy = {
        server: `http://${proxy.host}:${proxy.port}`,
        username: proxy.username,
        password: proxy.password,
      };
      logger.info(`Creating browser with proxy: ${proxy.host}:${proxy.port}`);
    } else {
      logger.info("Creating browser without proxy");
    }

    try {
      const browser = await chromium.launch(launchOptions);
      logger.info("Browser created successfully");
      return browser;
    } catch (error: any) {
      logger.error(`Failed to launch browser: ${error.message}`);
      throw error;
    }
  }

  /**
   * Create a new page with additional anti-detection measures
   */
  protected async createPage(): Promise<Page> {
    if (!this.browser) {
      throw new Error("Browser not initialized. Call initialize() first.");
    }

    // Create context with fingerprint if not exists
    if (!this.context) {
      const fingerprintData = {
        languages: this.languages,
        locale: this.fingerprint!.locale,
        timezone: this.timezone,
        platform: this.fingerprint!.userAgent.includes('Win') ? 'Windows' : 
                  this.fingerprint!.userAgent.includes('Mac') ? 'MacIntel' : 
                  this.fingerprint!.userAgent.includes('Linux') ? 'Linux x86_64' : 'Win32',
        hardwareConcurrency: Math.floor(Math.random() * 8) + 4,
        deviceMemory: [2, 4, 8, 16][Math.floor(Math.random() * 4)],
      };

      this.context = await this.browser.newContext({
        userAgent: this.fingerprint!.userAgent,
        viewport: {
          width: this.fingerprint!.viewport.width,
          height: this.fingerprint!.viewport.height,
        },
        locale: this.fingerprint!.locale,
        timezoneId: this.timezone,
        permissions: [],
        geolocation: undefined,
        colorScheme: 'light',
        extraHTTPHeaders: {
          'accept-language': `${this.fingerprint!.locale}`,
        },
        ignoreHTTPSErrors: true,
      });

      // Add init scripts for anti-detection
      await this.context.addInitScript((fp: any) => {
        // Override navigator properties
        Object.defineProperty(navigator, 'webdriver', {
          get: () => false,
        });
        
        Object.defineProperty(navigator, 'languages', {
          get: () => fp.languages,
        });
        
        Object.defineProperty(navigator, 'platform', {
          get: () => fp.platform,
        });
        
        Object.defineProperty(navigator, 'hardwareConcurrency', {
          get: () => fp.hardwareConcurrency,
        });
        
        Object.defineProperty(navigator, 'deviceMemory', {
          get: () => fp.deviceMemory,
        });

        // Chrome-specific properties
        Object.defineProperty(navigator, 'chrome', {
          get: () => ({
            runtime: {},
            loadTimes: function() {},
            csi: function() {},
            app: {},
          }),
        });

        // WebGL Vendor/Renderer spoofing
        const getParameter = WebGLRenderingContext.prototype.getParameter;
        WebGLRenderingContext.prototype.getParameter = function(parameter: any) {
          if (parameter === 37445) {
            return 'Intel Inc.';
          }
          if (parameter === 37446) {
            return 'Intel Iris OpenGL Engine';
          }
          return getParameter.call(this, parameter);
        };

        // Remove automation indicators
        (window.navigator as any).webdriver = false;
        
      }, fingerprintData);
    }

    const page = await this.context.newPage();
    
    // Set default timeouts
    page.setDefaultNavigationTimeout(120000);
    page.setDefaultTimeout(120000);

    return page;
  }

  /**
   * Get proxy configuration for child classes
   */
  protected getProxyConfig() {
    return this.proxyConfig;
  }

  /**
   * Close browser or return to pool
   */
  async close(): Promise<void> {
    // Close context first
    if (this.context) {
      await this.context.close();
      this.context = null;
    }

    if (this.browser) {
      if (this.usingPooledBrowser) {
        // Return browser to pool instead of closing
        try {
          const pool = getBrowserPool();
          await pool.release(this.browser as any);
          logger.debug("Browser returned to pool");
        } catch (error) {
          logger.warn("Failed to return browser to pool, closing instead");
          await this.browser.close();
        }
      } else {
        // Close owned browser
        await this.browser.close();
        logger.info("Browser closed");
      }
      this.browser = null;
      this.usingPooledBrowser = false;
    }
  }

  /**
   * scroll down the page to load dynamic content
   */
  protected async autoScroll(page: Page): Promise<void> {
    await page.evaluate(async () => {
      await new Promise<void>((resolve) => {
        let totalHeight = 0;
        const distance = 100;
        const timer = setInterval(() => {
          const scrollHeight = document.body.scrollHeight;
          window.scrollBy(0, distance);
          totalHeight += distance;
          if (totalHeight >= scrollHeight) {
            clearInterval(timer);
            resolve();
          }
        }, 100);
      });
    });
  }
}
