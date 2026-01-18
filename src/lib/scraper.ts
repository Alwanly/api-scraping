import { chromium, Browser, Page, BrowserContext, firefox } from "playwright";
import { generateFingerprint } from "./fingerPrints/FingerPrintGenerator";
import { BrowserFingerprint, ProxyConfig, ScraperOptions } from "../types";
import { logger } from "./logger";
import { ScraperConfig } from "../config/scraper.config";
import { newInjectedContext } from "fingerprint-injector";

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
  static async createBrowser(
    proxy: ProxyConfig | null = null,
  ): Promise<Browser> {
    const launchOptions: any = {
      headless: ScraperConfig.browser.headless,
    };

    if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) {
      launchOptions.executablePath =
        process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
      logger.info(
        `Using custom Chromium: ${process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}`,
      );
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

    if (!this.context) {
      const fingerprintData = {
        languages: this.languages,
        // locale: this.fingerprint!.locale,
        timezone: this.timezone,
        hardwareConcurrency: Math.floor(Math.random() * 8) + 4,
        deviceMemory: [2, 4, 8, 16][Math.floor(Math.random() * 4)],
      };


      this.context = await newInjectedContext(this.browser, {
        fingerprintOptions: {
          devices: ["desktop"],
          operatingSystems: ["macos", "windows"],
          screen: {
            maxHeight: 1080,
            maxWidth: 1920,
            minHeight: 720,
            minWidth: 1280,
          },
          slim: true,
        },
        newContextOptions: {
          locale: "ko-KR",
          timezoneId: fingerprintData.timezone,
          ignoreHTTPSErrors: true,
  
        },
      });
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
      await this.browser.close();
      logger.info("Browser closed");
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
