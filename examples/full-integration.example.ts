import { BrowserPool } from '../src/lib/browser/browserPool';
import { ProxyManager } from '../src/lib/proxy/proxyManager';
import { ProfileRotationStrategy } from '../src/lib/browser/types';
import { RotationStrategy } from '../src/lib/proxy/types';

/**
 * Complete Web Scraping Setup
 * Combines Browser Pool + Proxy Manager for production scraping
 */

async function productionScrapingSetup() {
  // 1. Initialize Proxy Manager
  console.log('Initializing Proxy Manager...');
  const proxyManager = new ProxyManager({
    rotationStrategy: RotationStrategy.LATENCY_BASED,
    healthCheckTimeout: 10000,
    cooldownDuration: 60 * 1000, // 1 minute between uses
    maxFailuresBeforeBan: 3,
    recoveryInterval: 10 * 60 * 1000, // 10 minutes
  });

  await proxyManager.initialize();

  // 2. Initialize Browser Pool with Proxy Integration
  console.log('Initializing Browser Pool...');
  const browserPool = new BrowserPool(
    {
      maxBrowsers: 5,
      minBrowsers: 2,
      maxPagesPerBrowser: 3,
      headless: true,
      stealth: true,
      browserTimeout: 5 * 60 * 1000,
      profileRotationStrategy: ProfileRotationStrategy.LEAST_USED,
      profileRotationInterval: 10,
      proxy: {
        enabled: true,
        rotatePerBrowser: true, // Each browser gets different proxy
      },
    },
    proxyManager
  );

  await browserPool.initialize();

  console.log('✅ System Ready for Scraping!');

  return { browserPool, proxyManager };
}

/**
 * Scrape multiple URLs with retry logic
 */
async function scrapeUrls(
  urls: string[],
  browserPool: BrowserPool,
  proxyManager: ProxyManager
) {
  const results = [];

  for (const url of urls) {
    let success = false;
    let attempts = 0;
    const maxAttempts = 3;

    while (!success && attempts < maxAttempts) {
      attempts++;
      let browserId: string | null = null;
      let page: any = null;

      try {
        console.log(`\n📄 Scraping ${url} (attempt ${attempts}/${maxAttempts})`);

        // Create page
        const result = await browserPool.createPage({
          url,
          waitUntil: 'domcontentloaded',
          timeout: 30000,
        });

        browserId = result.browserId;
        page = result.page;

        // Wait for page to stabilize
        await page.waitForTimeout(2000);

        // Extract data
        const data = await page.evaluate(() => ({
          title: document.title,
          url: window.location.href,
          links: document.querySelectorAll('a').length,
          images: document.querySelectorAll('img').length,
          text: document.body.innerText.substring(0, 200),
        }));

        console.log(`✅ Success: ${data.title}`);

        // Report success
        browserPool.reportSuccess(browserId);
        
        results.push({
          url,
          success: true,
          data,
          attempts,
        });

        success = true;
      } catch (error: any) {
        console.error(`❌ Attempt ${attempts} failed: ${error.message}`);

        if (browserId) {
          browserPool.reportFailure(browserId);
        }

        if (attempts === maxAttempts) {
          results.push({
            url,
            success: false,
            error: error.message,
            attempts,
          });
        } else {
          // Wait before retry
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      } finally {
        if (browserId && page) {
          await browserPool.closePage(browserId, page);
        }
      }
    }
  }

  return results;
}

/**
 * Monitor system health
 */
function monitorHealth(browserPool: BrowserPool, proxyManager: ProxyManager) {
  return setInterval(() => {
    const browserStats = browserPool.getStats();
    const proxyStats = proxyManager.getStats();

    console.log('\n📊 System Health:');
    console.log('  Browsers:', {
      total: browserStats.totalBrowsers,
      active: browserStats.activeBrowsers,
      pages: browserStats.totalPages,
    });
    console.log('  Proxies:', {
      total: proxyStats.total,
      healthy: proxyStats.healthy,
      banned: proxyStats.banned,
      avgLatency: `${proxyStats.averageLatency}ms`,
    });
    console.log('  Profiles:', {
      total: browserStats.totalProfiles,
      inUse: browserStats.profilesInUse,
    });
  }, 30000); // Every 30 seconds
}

/**
 * Main execution
 */
async function main() {
  let monitorInterval: NodeJS.Timeout | null = null;

  try {
    // Setup
    const { browserPool, proxyManager } = await productionScrapingSetup();

    // Start monitoring
    monitorInterval = monitorHealth(browserPool, proxyManager);

    // URLs to scrape
    const urls = [
      'https://example.com',
      'https://example.org',
      'https://example.net',
      'https://www.wikipedia.org',
      'https://github.com',
    ];

    console.log(`\n🚀 Starting to scrape ${urls.length} URLs...\n`);

    // Scrape
    const results = await scrapeUrls(urls, browserPool, proxyManager);

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📈 SCRAPING SUMMARY');
    console.log('='.repeat(60));

    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    console.log(`Total URLs: ${results.length}`);
    console.log(`✅ Successful: ${successful}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`Success Rate: ${((successful / results.length) * 100).toFixed(1)}%`);

    console.log('\nDetailed Results:');
    results.forEach((result, index) => {
      console.log(`\n${index + 1}. ${result.url}`);
      console.log(`   Status: ${result.success ? '✅ Success' : '❌ Failed'}`);
      console.log(`   Attempts: ${result.attempts}`);
      if (result.success && result.data) {
        console.log(`   Title: ${result.data.title}`);
        console.log(`   Links: ${result.data.links}, Images: ${result.data.images}`);
      } else if (result.error) {
        console.log(`   Error: ${result.error}`);
      }
    });

    // Final stats
    const browserStats = browserPool.getStats();
    const proxyStats = proxyManager.getStats();

    console.log('\n' + '='.repeat(60));
    console.log('📊 FINAL STATISTICS');
    console.log('='.repeat(60));
    console.log('\nBrowser Pool:');
    console.log(`  Total Browsers: ${browserStats.totalBrowsers}`);
    console.log(`  Active Browsers: ${browserStats.activeBrowsers}`);
    console.log(`  Total Pages: ${browserStats.totalPages}`);
    console.log(`  Total Profiles: ${browserStats.totalProfiles}`);
    console.log(`  Profiles in Use: ${browserStats.profilesInUse}`);

    console.log('\nProxy Manager:');
    console.log(`  Total Proxies: ${proxyStats.total}`);
    console.log(`  Healthy Proxies: ${proxyStats.healthy}`);
    console.log(`  Banned Proxies: ${proxyStats.banned}`);
    console.log(`  Working Proxies: ${proxyStats.working}`);
    console.log(`  Avg Latency: ${proxyStats.averageLatency}ms`);

    // Cleanup
    console.log('\n🧹 Cleaning up...');
    if (monitorInterval) {
      clearInterval(monitorInterval);
    }
    await browserPool.shutdown();
    await proxyManager.stop();

    console.log('✅ Done!\n');
  } catch (error) {
    console.error('Fatal error:', error);
    if (monitorInterval) {
      clearInterval(monitorInterval);
    }
  }
}

/**
 * Alternative: Using Browserless.io
 */
async function withBrowserlessIo() {
  const proxyManager = new ProxyManager();
  await proxyManager.initialize();

  const browserPool = new BrowserPool(
    {
      browserlessEndpoint: 'wss://chrome.browserless.io?token=YOUR_TOKEN',
      stealth: true,
      proxy: {
        enabled: true,
        rotatePerBrowser: true,
      },
    },
    proxyManager
  );

  await browserPool.initialize();

  console.log('Using Browserless.io cloud browsers + proxies');

  // Use as normal...
  const { page, browserId } = await browserPool.createPage({
    url: 'https://example.com',
  });

  await browserPool.closePage(browserId, page);
  await browserPool.shutdown();
  await proxyManager.stop();
}

// Run if executed directly
if (require.main === module) {
  main().catch(console.error);
}

export { productionScrapingSetup, scrapeUrls, monitorHealth, withBrowserlessIo };
