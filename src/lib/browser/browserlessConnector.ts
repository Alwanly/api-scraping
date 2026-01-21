import { chromium, firefox, webkit, Browser, BrowserContext, Page } from 'playwright';
import { BrowserProfile, BrowserContextOptions, PageOptions } from './types';
import { logger } from '../logger';

export class BrowserlessConnector {
  private browserlessEndpoint?: string;
  private usePlaywright: boolean;

  constructor(browserlessEndpoint?: string, usePlaywright: boolean = true) {
    this.browserlessEndpoint = browserlessEndpoint;
    this.usePlaywright = usePlaywright;
  }

  /**
   * Launch browser with optional browserless.io support
   */
  async launchBrowser(
    options: BrowserContextOptions = {}
  ): Promise<Browser> {
    const { headless = true, proxy } = options;

    try {
      let browser: Browser;

      if (this.browserlessEndpoint) {
        // Connect to browserless.io
        logger.info(`Connecting to browserless endpoint: ${this.browserlessEndpoint}`);
        browser = await chromium.connect(this.browserlessEndpoint);
      } else {
        // Launch local browser
        const launchOptions: any = {
          headless,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--disable-gpu',
            '--window-size=1920,1080',
          ],
        };

        if (proxy) {
          launchOptions.proxy = {
            server: proxy.server,
            username: proxy.username,
            password: proxy.password,
          };
        }

        browser = await chromium.launch(launchOptions);
        logger.debug('Launched local Chromium browser');
      }

      return browser;
    } catch (error) {
      logger.error(`Failed to launch browser: ${error}`);
      throw error;
    }
  }

  /**
   * Create browser context with profile and stealth
   */
  async createContext(
    browser: Browser,
    profile: BrowserProfile,
    options: BrowserContextOptions = {}
  ): Promise<BrowserContext> {
    const { proxy, stealth = true } = options;

    try {
      const contextOptions: any = {
        userAgent: profile.userAgent,
        viewport: profile.viewport,
        deviceScaleFactor: profile.deviceScaleFactor,
        isMobile: profile.isMobile,
        hasTouch: profile.hasTouch,
        locale: profile.locale,
        timezoneId: profile.timezone,
        permissions: profile.permissions,
        colorScheme: 'light',
      };

      if (profile.geolocation) {
        contextOptions.geolocation = profile.geolocation;
      }

      if (proxy) {
        contextOptions.proxy = {
          server: proxy.server,
          username: proxy.username,
          password: proxy.password,
        };
      }

      const context = await browser.newContext(contextOptions);

      // Apply stealth techniques
      if (stealth) {
        await this.applyStealth(context, profile);
      }

      logger.debug(`Created browser context with profile: ${profile.id}`);
      return context;
    } catch (error) {
      logger.error(`Failed to create context: ${error}`);
      throw error;
    }
  }

  /**
   * Apply stealth techniques to avoid detection
   */
  private async applyStealth(context: BrowserContext, profile: BrowserProfile): Promise<void> {
    // Enhanced stealth scripts to bypass CAPTCHA detection
    await context.addInitScript(() => {
      // Override navigator.webdriver
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });

      // Override chrome detection (more complete)
      (window as any).chrome = {
        runtime: {},
        loadTimes: () => {},
        csi: () => {},
        app: {
          isInstalled: false,
        },
      };

      // Override permissions
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters: any) =>
        parameters.name === 'notifications'
          ? Promise.resolve({ state: 'denied' } as PermissionStatus)
          : originalQuery(parameters);

      // Override plugins (more realistic)
      Object.defineProperty(navigator, 'plugins', {
        get: () => [
          {
            0: { type: 'application/x-google-chrome-pdf', suffixes: 'pdf', description: 'Portable Document Format' },
            description: 'Portable Document Format',
            filename: 'internal-pdf-viewer',
            length: 1,
            name: 'Chrome PDF Plugin',
          },
          {
            0: { type: 'application/pdf', suffixes: 'pdf', description: 'Portable Document Format' },
            description: 'Portable Document Format',
            filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai',
            length: 1,
            name: 'Chrome PDF Viewer',
          },
          {
            0: { type: 'application/x-nacl', suffixes: '', description: 'Native Client Executable' },
            1: { type: 'application/x-pnacl', suffixes: '', description: 'Portable Native Client Executable' },
            description: '',
            filename: 'internal-nacl-plugin',
            length: 2,
            name: 'Native Client',
          },
        ],
      });

      // Override languages (more realistic for Korean sites)
      Object.defineProperty(navigator, 'languages', {
        get: () => ['ko-KR', 'ko', 'en-US', 'en'],
      });

      // Override connection type
      Object.defineProperty(navigator, 'connection', {
        get: () => ({
          effectiveType: '4g',
          downlink: 10,
          rtt: 50,
        }),
      });

      // Override battery status (remove battery API)
      if ((navigator as any).getBattery) {
        (navigator as any).getBattery = undefined;
      }

      // Override automation indicators
      delete (window as any).__nightmare;
      delete (window as any)._phantom;
      delete (window as any).callPhantom;

      // Override toString methods to hide automation
      const originalToString = Function.prototype.toString;
      Function.prototype.toString = function () {
        if (this === window.navigator.permissions.query) {
          return 'function query() { [native code] }';
        }
        return originalToString.call(this);
      };

      // Add realistic plugins array methods
      const pluginsArray = Object.getOwnPropertyDescriptor(Navigator.prototype, 'plugins')?.get;
      if (pluginsArray) {
        Object.defineProperty(pluginsArray, 'toString', {
          value: () => 'function get plugins() { [native code] }',
        });
      }
    });

    // Inject profile-specific fingerprints
    await context.addInitScript((profileData) => {
      const { screen, navigator: nav, webgl } = profileData;

      // Override screen properties
      Object.defineProperty(window.screen, 'width', { get: () => screen.width });
      Object.defineProperty(window.screen, 'height', { get: () => screen.height });
      Object.defineProperty(window.screen, 'availWidth', { get: () => screen.availWidth });
      Object.defineProperty(window.screen, 'availHeight', { get: () => screen.availHeight });
      Object.defineProperty(window.screen, 'colorDepth', { get: () => screen.colorDepth });
      Object.defineProperty(window.screen, 'pixelDepth', { get: () => screen.pixelDepth });

      // Override navigator properties
      Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => nav.hardwareConcurrency });
      Object.defineProperty(navigator, 'deviceMemory', { get: () => nav.deviceMemory });
      Object.defineProperty(navigator, 'vendor', { get: () => nav.vendor });
      Object.defineProperty(navigator, 'maxTouchPoints', { get: () => nav.maxTouchPoints });

      // Override WebGL
      const getParameter = WebGLRenderingContext.prototype.getParameter;
      WebGLRenderingContext.prototype.getParameter = function (parameter) {
        if (parameter === 37445) {
          return webgl.vendor;
        }
        if (parameter === 37446) {
          return webgl.renderer;
        }
        return getParameter.call(this, parameter);
      };
    }, profile.fingerprint);

    logger.debug('Applied stealth techniques to context');
  }

  /**
   * Create a new page with options
   */
  async createPage(
    context: BrowserContext,
    options: PageOptions = {}
  ): Promise<Page> {
    try {
      const page = await context.newPage();

      // Set custom user agent if provided
      if (options.userAgent) {
        await page.setExtraHTTPHeaders({
          'User-Agent': options.userAgent,
        });
      }

      // Set custom viewport if provided
      if (options.viewport) {
        await page.setViewportSize(options.viewport);
      }

      // Navigate to URL if provided
      if (options.url) {
        await page.goto(options.url, {
          waitUntil: options.waitUntil || 'domcontentloaded',
          timeout: options.timeout || 30000,
        });
      }

      logger.debug('Created new page');
      return page;
    } catch (error) {
      logger.error(`Failed to create page: ${error}`);
      throw error;
    }
  }

  /**
   * Close browser safely
   */
  async closeBrowser(browser: Browser): Promise<void> {
    try {
      await browser.close();
      logger.debug('Browser closed successfully');
    } catch (error) {
      logger.error(`Error closing browser: ${error}`);
    }
  }

  /**
   * Close context safely
   */
  async closeContext(context: BrowserContext): Promise<void> {
    try {
      await context.close();
      logger.debug('Context closed successfully');
    } catch (error) {
      logger.error(`Error closing context: ${error}`);
    }
  }
}
