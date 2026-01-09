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
   * Configured with realistic TLS fingerprint via browser args
   */
  static async createBrowser(proxy: ProxyConfig | null = null): Promise<Browser> {
    const launchOptions: any = {
      headless: ScraperConfig.browser.headless,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-blink-features=AutomationControlled",
        "--disable-gpu",
        "--disable-software-rasterizer",
        "--disable-crashpad",
        "--disable-crash-reporter",
        "--disable-web-security",
        "--disable-features=IsolateOrigins,site-per-process",
        "--disable-site-isolation-trials",
        "--disable-features=BlockInsecurePrivateNetworkRequests",
        "--lang=ko-KR",
        "--window-size=1920,1080",
        // TLS/SSL optimizations for realistic fingerprint
        "--cipher-suite-blacklist=0x0004,0x0005,0x0007,0xc011,0xc007",
        "--enable-features=NetworkService,NetworkServiceInProcess",
        // Additional stealth
        "--disable-infobars",
        "--disable-background-timer-throttling",
        "--disable-backgrounding-occluded-windows",
        "--disable-renderer-backgrounding",
      ],
      ignoreHTTPSErrors: true,
      ignoreDefaultArgs: ['--enable-automation', '--enable-blink-features=AutomationControlled'],
    };

    // Use custom executable path only if explicitly set (for Docker/Alpine Linux)
    if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) {
      launchOptions.executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
      logger.info(`Using custom Chromium: ${process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}`);
    }

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

      // Build dynamic accept-language header from languages array
      const acceptLanguage = this.languages
        .map((lang, idx) => idx === 0 ? lang : `${lang};q=0.${9 - idx}`)
        .join(',');

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
          'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
          'accept-language': acceptLanguage,
          'accept-encoding': 'gzip, deflate, br, zstd',
          'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
          'sec-ch-ua-mobile': '?0',
          'sec-ch-ua-platform': `"${fingerprintData.platform}"`,
          'sec-fetch-dest': 'document',
          'sec-fetch-mode': 'navigate',
          'sec-fetch-site': 'none',
          'sec-fetch-user': '?1',
          'upgrade-insecure-requests': '1',
        },
        ignoreHTTPSErrors: true,
        javaScriptEnabled: true,
        hasTouch: false,
        isMobile: false,
        serviceWorkers: 'block',
      });

      // Add init scripts for anti-detection
      await this.context.addInitScript((fp: any) => {
        // Override navigator.webdriver
        Object.defineProperty(navigator, 'webdriver', {
          get: () => undefined,
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

        // Override permissions - flexible based on browser
        const originalQuery = window.navigator.permissions.query;
        window.navigator.permissions.query = (parameters: any) => (
          parameters.name === 'notifications' ?
            Promise.resolve({ state: Notification.permission } as PermissionStatus) :
            originalQuery(parameters)
        );

        // WebGL Vendor/Renderer spoofing - dynamic based on platform
        const getParameter = WebGLRenderingContext.prototype.getParameter;
        WebGLRenderingContext.prototype.getParameter = function(parameter: any) {
          if (parameter === 37445) {
            return fp.platform.includes('Mac') ? 'Apple Inc.' : 'Intel Inc.';
          }
          if (parameter === 37446) {
            return fp.platform.includes('Mac') ? 'Apple M1' : 'Intel Iris OpenGL Engine';
          }
          return getParameter.call(this, parameter);
        };

        // Remove automation indicators
        delete (window.navigator as any).webdriver;
        delete (window as any).__nightmare;
        delete (window.document as any).__selenium_unwrapped;
        delete (window.document as any).__webdriver_evaluate;
        delete (window.document as any).__driver_evaluate;
        delete (window.document as any).__webdriver_script_function;
        delete (window.document as any).__webdriver_script_func;
        delete (window.document as any).__webdriver_script_fn;
        delete (window.document as any).__fxdriver_evaluate;
        delete (window.document as any).__driver_unwrapped;
        delete (window.document as any).__fxdriver_unwrapped;
        delete (window.document as any).__selenium_evaluate;
        
        // Override plugins to look real - dynamic based on platform
        Object.defineProperty(navigator, 'plugins', {
          get: () => fp.platform.includes('Win') ? [1, 2, 3, 4, 5] : [1, 2, 3],
        });
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
