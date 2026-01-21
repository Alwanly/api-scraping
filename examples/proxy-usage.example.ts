import { ProxyManager } from '../src/lib/proxy/proxyManager';
import { RotationStrategy } from '../src/lib/proxy/types';

/**
 * Example: Basic Proxy Manager Usage
 */
async function basicUsage() {
  // Initialize with default configuration
  const proxyManager = new ProxyManager();
  await proxyManager.initialize();

  // Get a proxy
  const proxy = await proxyManager.getProxy();
  if (proxy) {
    console.log(`Using proxy: ${proxy.host}:${proxy.port}`);
  }

  // Stop the manager when done
  await proxyManager.stop();
}

/**
 * Example: Custom Configuration
 */
async function customConfiguration() {
  const proxyManager = new ProxyManager({
    rotationStrategy: RotationStrategy.LATENCY_BASED,
    healthCheckTimeout: 5000, // 5 seconds
    cooldownDuration: 60 * 1000, // 1 minute between uses
    maxFailuresBeforeBan: 5,
    validationInterval: 10 * 60 * 1000, // 10 minutes
    recoveryInterval: 30 * 60 * 1000, // 30 minutes before retrying bad proxies
  });

  await proxyManager.initialize();

  const proxy = await proxyManager.getProxy();
  console.log('Got proxy:', proxy);

  await proxyManager.stop();
}

/**
 * Example: Website-Specific Proxy Management
 */
async function websiteSpecificUsage() {
  const proxyManager = new ProxyManager();
  await proxyManager.initialize();

  const website = 'example.com';
  
  // Get a proxy for a specific website
  const proxy = await proxyManager.getProxy(website);
  
  if (proxy) {
    try {
      // ... perform scraping ...
      
      // Report success
      proxyManager.reportProxySuccess(proxy);
      console.log('Scraping succeeded');
    } catch (error: any) {
      // Report failure
      if (error.message.includes('blocked') || error.message.includes('403')) {
        // Mark as blocked by this specific website
        proxyManager.reportProxyFailure(proxy, website);
        console.log(`Proxy blocked by ${website}`);
      } else {
        // General failure
        proxyManager.reportProxyFailure(proxy);
        console.log('Proxy failed');
      }
    }
  }

  await proxyManager.stop();
}

/**
 * Example: Different Rotation Strategies
 */
async function rotationStrategies() {
  // Round Robin - Uses each proxy in sequence
  const roundRobin = new ProxyManager({
    rotationStrategy: RotationStrategy.ROUND_ROBIN,
  });

  // Latency Based - Always uses fastest proxies first
  const latencyBased = new ProxyManager({
    rotationStrategy: RotationStrategy.LATENCY_BASED,
  });

  // Weighted - Prefers proxies with higher success rates
  const weighted = new ProxyManager({
    rotationStrategy: RotationStrategy.WEIGHTED,
  });

  // Random - Randomly selects proxies
  const random = new ProxyManager({
    rotationStrategy: RotationStrategy.RANDOM,
  });
}

/**
 * Example: Monitoring Proxy Stats
 */
async function monitoringStats() {
  const proxyManager = new ProxyManager();
  await proxyManager.initialize();

  // Get statistics
  const stats = proxyManager.getStats();
  console.log('Proxy Statistics:', {
    total: stats.total,
    healthy: stats.healthy,
    banned: stats.banned,
    working: stats.working,
    averageLatency: `${stats.averageLatency}ms`,
  });

  // Check stats periodically
  setInterval(() => {
    const currentStats = proxyManager.getStats();
    console.log('Current stats:', currentStats);
  }, 60000); // Every minute
}

/**
 * Example: Manual Proxy Management
 */
async function manualManagement() {
  const proxyManager = new ProxyManager();
  await proxyManager.initialize();

  const proxy = await proxyManager.getProxy();
  
  if (proxy) {
    // Manually mark as bad if needed
    proxyManager.markProxyAsBad(proxy);
    
    // Or mark as blocked by specific website
    proxyManager.markProxyAsBlockedByWebsite(proxy, 'example.com');
    
    // Report success/failure
    proxyManager.reportProxySuccess(proxy);
    proxyManager.reportProxyFailure(proxy, 'badwebsite.com');
  }

  await proxyManager.stop();
}

/**
 * Example: Integration with Scraper
 */
async function scraperIntegration() {
  const proxyManager = new ProxyManager({
    rotationStrategy: RotationStrategy.LATENCY_BASED,
    cooldownDuration: 30 * 1000, // 30 seconds between uses
  });

  await proxyManager.initialize();

  async function scrapeWithRetry(url: string, maxRetries = 3) {
    const website = new URL(url).hostname;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const proxy = await proxyManager.getProxy(website);
      
      if (!proxy) {
        console.log('No proxies available');
        await new Promise(resolve => setTimeout(resolve, 5000));
        continue;
      }

      try {
        console.log(`Attempt ${attempt + 1}: Using ${proxy.host}:${proxy.port}`);
        
        // Perform scraping with proxy
        // const result = await fetch(url, { proxy: ... });
        
        proxyManager.reportProxySuccess(proxy);
        // return result;
        
      } catch (error: any) {
        console.log(`Error: ${error.message}`);
        
        if (error.message.includes('403') || error.message.includes('blocked')) {
          proxyManager.reportProxyFailure(proxy, website);
        } else {
          proxyManager.reportProxyFailure(proxy);
        }
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    throw new Error(`Failed to scrape ${url} after ${maxRetries} attempts`);
  }

  // Usage
  try {
    await scrapeWithRetry('https://example.com/page');
  } catch (error) {
    console.error(error);
  }

  await proxyManager.stop();
}

// Export examples
export {
  basicUsage,
  customConfiguration,
  websiteSpecificUsage,
  rotationStrategies,
  monitoringStats,
  manualManagement,
  scraperIntegration,
};
