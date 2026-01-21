import { BrowserPool } from '../src/lib/browser/browserPool';
import { ProfileRotationStrategy } from '../src/lib/browser/types';
import { ProxyManager } from '../src/lib/proxy/proxyManager';

/**
 * Example 1: Basic Browser Pool Usage
 */
async function basicUsage() {
  const browserPool = new BrowserPool();
  await browserPool.initialize();

  try {
    // Create a page
    const { page, browserId } = await browserPool.createPage({
      url: 'https://example.com',
      waitUntil: 'domcontentloaded',
    });

    // Use the page
    const title = await page.title();
    console.log('Page title:', title);

    // Report success
    browserPool.reportSuccess(browserId);

    // Close the page
    await browserPool.closePage(browserId, page);
  } finally {
    await browserPool.shutdown();
  }
}

/**
 * Example 2: Custom Configuration
 */
async function customConfiguration() {
  const browserPool = new BrowserPool({
    maxBrowsers: 10,
    minBrowsers: 2,
    maxPagesPerBrowser: 3,
    headless: true,
    stealth: true,
    profileRotationStrategy: ProfileRotationStrategy.RANDOM,
    profileRotationInterval: 5, // Rotate profile every 5 uses
  });

  await browserPool.initialize();

  const { page, browserId } = await browserPool.createPage();
  console.log('Created page in browser:', browserId);

  await browserPool.shutdown();
}

/**
 * Example 3: Integration with Proxy Manager
 */
async function withProxyIntegration() {
  // Initialize proxy manager
  const proxyManager = new ProxyManager();
  await proxyManager.initialize();

  // Initialize browser pool with proxy support
  const browserPool = new BrowserPool(
    {
      maxBrowsers: 5,
      headless: true,
      stealth: true,
      proxy: {
        enabled: true,
        rotatePerBrowser: true,
      },
    },
    proxyManager
  );

  await browserPool.initialize();

  try {
    const { page, browserId } = await browserPool.createPage({
      url: 'https://httpbin.org/ip',
    });

    const content = await page.content();
    console.log('IP Info:', content);

    browserPool.reportSuccess(browserId);
    await browserPool.closePage(browserId, page);
  } finally {
    await browserPool.shutdown();
    await proxyManager.stop();
  }
}

/**
 * Example 4: Using Browserless.io
 */
async function withBrowserless() {
  const browserPool = new BrowserPool({
    browserlessEndpoint: 'wss://chrome.browserless.io?token=YOUR_TOKEN',
    headless: true,
    stealth: true,
  });

  await browserPool.initialize();

  const { page, browserId } = await browserPool.createPage({
    url: 'https://example.com',
  });

  console.log('Using browserless.io cloud browser');

  await browserPool.closePage(browserId, page);
  await browserPool.shutdown();
}

/**
 * Example 5: Multiple Pages Management
 */
async function multiplePages() {
  const browserPool = new BrowserPool({
    maxBrowsers: 3,
    maxPagesPerBrowser: 5,
  });

  await browserPool.initialize();

  try {
    // Create multiple pages
    const pages = await Promise.all([
      browserPool.createPage({ url: 'https://example.com' }),
      browserPool.createPage({ url: 'https://example.org' }),
      browserPool.createPage({ url: 'https://example.net' }),
    ]);

    // Process all pages
    for (const { page, browserId } of pages) {
      const title = await page.title();
      console.log(`Browser ${browserId}: ${title}`);
      browserPool.reportSuccess(browserId);
      await browserPool.closePage(browserId, page);
    }
  } finally {
    await browserPool.shutdown();
  }
}

/**
 * Example 6: Profile Rotation Strategies
 */
async function profileRotationDemo() {
  // Least Used - Uses profiles with lowest usage count
  const leastUsed = new BrowserPool({
    profileRotationStrategy: ProfileRotationStrategy.LEAST_USED,
    profileRotationInterval: 10,
  });

  // Random - Randomly selects profiles
  const random = new BrowserPool({
    profileRotationStrategy: ProfileRotationStrategy.RANDOM,
  });

  // Round Robin - Sequential rotation
  const roundRobin = new BrowserPool({
    profileRotationStrategy: ProfileRotationStrategy.ROUND_ROBIN,
  });

  // Sequential - Always uses same profile until rotation
  const sequential = new BrowserPool({
    profileRotationStrategy: ProfileRotationStrategy.SEQUENTIAL,
  });
}

/**
 * Example 7: Error Handling and Retry
 */
async function withErrorHandling() {
  const browserPool = new BrowserPool();
  await browserPool.initialize();

  async function scrapePage(url: string, maxRetries = 3) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      let browserId: string | null = null;
      let page: any = null;

      try {
        const result = await browserPool.createPage({ url });
        browserId = result.browserId;
        page = result.page;

        // Perform scraping
        const data = await page.evaluate(() => {
          return document.title;
        });

        browserPool.reportSuccess(browserId);
        await browserPool.closePage(browserId, page);
        
        return data;
      } catch (error) {
        console.error(`Attempt ${attempt + 1} failed:`, error);
        
        if (browserId) {
          browserPool.reportFailure(browserId);
          if (page) {
            await browserPool.closePage(browserId, page);
          }
        }

        if (attempt === maxRetries - 1) {
          throw error;
        }

        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }

  try {
    const result = await scrapePage('https://example.com');
    console.log('Result:', result);
  } finally {
    await browserPool.shutdown();
  }
}

/**
 * Example 8: Monitoring Pool Statistics
 */
async function monitoringStats() {
  const browserPool = new BrowserPool();
  await browserPool.initialize();

  // Monitor stats periodically
  const monitor = setInterval(() => {
    const stats = browserPool.getStats();
    console.log('Browser Pool Stats:', {
      totalBrowsers: stats.totalBrowsers,
      activeBrowsers: stats.activeBrowsers,
      totalPages: stats.totalPages,
      totalProfiles: stats.totalProfiles,
      profilesInUse: stats.profilesInUse,
    });
  }, 5000);

  // Do some work
  const { page, browserId } = await browserPool.createPage({
    url: 'https://example.com',
  });

  await new Promise(resolve => setTimeout(resolve, 10000));

  await browserPool.closePage(browserId, page);
  clearInterval(monitor);
  await browserPool.shutdown();
}

/**
 * Example 9: Stealth Mode Demonstration
 */
async function stealthDemo() {
  const browserPool = new BrowserPool({
    stealth: true,
    headless: true,
  });

  await browserPool.initialize();

  const { page, browserId } = await browserPool.createPage({
    url: 'https://bot.sannysoft.com/',
  });

  // Check if we're detected as a bot
  await page.waitForTimeout(3000);
  
  const webdriverDetected = await page.evaluate(() => {
    return navigator.webdriver;
  });

  console.log('Webdriver detected:', webdriverDetected); // Should be undefined

  await browserPool.closePage(browserId, page);
  await browserPool.shutdown();
}

/**
 * Example 10: Web Scraping Flow
 */
async function fullScrapingWorkflow() {
  const proxyManager = new ProxyManager();
  await proxyManager.initialize();

  const browserPool = new BrowserPool(
    {
      maxBrowsers: 3,
      maxPagesPerBrowser: 2,
      headless: true,
      stealth: true,
      profileRotationStrategy: ProfileRotationStrategy.LEAST_USED,
      proxy: {
        enabled: true,
        rotatePerBrowser: true,
      },
    },
    proxyManager
  );

  await browserPool.initialize();

  const urls = [
    'https://example.com/page1',
    'https://example.com/page2',
    'https://example.com/page3',
  ];

  try {
    const results = [];

    for (const url of urls) {
      const { page, browserId } = await browserPool.createPage({ url });

      try {
        // Extract data
        const data = await page.evaluate(() => ({
          title: document.title,
          links: Array.from(document.querySelectorAll('a')).length,
        }));

        results.push(data);
        browserPool.reportSuccess(browserId);
      } catch (error) {
        console.error(`Failed to scrape ${url}:`, error);
        browserPool.reportFailure(browserId);
      } finally {
        await browserPool.closePage(browserId, page);
      }
    }

    console.log('Scraping results:', results);

    // Print stats
    const stats = browserPool.getStats();
    console.log('Final stats:', stats);
  } finally {
    await browserPool.shutdown();
    await proxyManager.stop();
  }
}

export {
  basicUsage,
  customConfiguration,
  withProxyIntegration,
  withBrowserless,
  multiplePages,
  profileRotationDemo,
  withErrorHandling,
  monitoringStats,
  stealthDemo,
  fullScrapingWorkflow,
};
