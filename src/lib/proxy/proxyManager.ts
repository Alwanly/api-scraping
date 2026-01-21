import * as path from 'path';
import * as fs from 'fs';
import { logger } from "../logger";
import * as defaultConfig from "./default";
import { ProfileProxy, ProxyPoolConfig, RotationStrategy } from "./types";
import { ProxyParser } from './proxyParser';
import https from 'https';
import http from 'http';


export class ProxyManager {
  private config: ProxyPoolConfig;
  private allProxies: ProfileProxy[] = [];
  private badProxies: Map<string, Date> = new Map(); // proxy key -> banned timestamp
  private workingProxies: Set<string> = new Set();
  private proxyDir = '';
  private isRunning = false;


  constructor(config?:Partial<ProxyPoolConfig>) {
    this.config = {...defaultConfig.DEFAULT_PROXY, ...config};
    this.proxyDir = path.join(process.cwd(), defaultConfig.DATA_DIR,defaultConfig.PROXY_FILE);
  }

  async initialize(): Promise<void> {
    logger.info('Initializing Proxy Manager')

    await this.loadProxies();

    this.isRunning = true;
    
    this.startLoop().catch();

    logger.info('Proxy Manager initialized successfully');
  }

  private async startLoop(): Promise<void> {
    while (this.isRunning) {
      try {
        await this.validateCycle();
        await this.recoverBadProxies();
      } catch (error) {
        logger.error(`Error during proxy validation cycle: ${error}`);
      }
      await new Promise(resolve => setTimeout(resolve, this.config.validationInterval));
    }
  }

  private async validateCycle(): Promise<void> {
    const startTime = Date.now();
    logger.info('Starting proxy validation cycle');

    const proxies = [...this.allProxies];
    const validatedProxies: ProfileProxy[] = [];

    // Validate proxies concurrently in batches of 5
    const batchSize = 5;
    for (let i = 0; i < proxies.length; i += batchSize) {
      const batch = proxies.slice(i, i + batchSize);
      const results = await Promise.allSettled(
        batch.map(proxy => this.validateProxy(proxy))
      );

      results.forEach((result, idx) => {
        if (result.status === 'fulfilled' && result.value) {
          validatedProxies.push(batch[idx]);
        }
      });
    }

    if (validatedProxies.length === 0) {
      logger.warn('All proxies failed validation. Retaining existing proxies.');
      return;
    }

    this.workingProxies = new Set(validatedProxies.map(proxy => `${proxy.host}:${proxy.port}`));

    const endTime = Date.now();
    logger.info(`Proxy validation cycle completed in ${endTime - startTime} ms`);
    logger.info(`Valid proxies count: ${validatedProxies.length}/${proxies.length}`);
  }

  private async validateProxy(proxy: ProfileProxy): Promise<boolean> {
    const key = `${proxy.host}:${proxy.port}`;
    
    // Skip if banned and not ready for recovery
    if (this.badProxies.has(key)) {
      return false;
    }

    try {
      const startTime = Date.now();
      const isHealthy = await this.testProxyConnection(proxy);
      const latency = Date.now() - startTime;

      proxy.latency = latency;
      proxy.lastHealthCheck = new Date();
      proxy.isHealthy = isHealthy;

      if (isHealthy) {
        proxy.successCount++;
        proxy.failureCount = 0; // Reset consecutive failures
        logger.debug(`Proxy ${key} validated successfully (latency: ${latency}ms)`);
        return true;
      } else {
        proxy.failureCount++;
        logger.warn(`Proxy ${key} validation failed (failures: ${proxy.failureCount})`);
        
        // Ban if exceeds max failures
        if (proxy.failureCount >= this.config.maxFailuresBeforeBan) {
          this.markProxyAsBad(proxy);
        }
        return false;
      }
    } catch (error) {
      proxy.failureCount++;
      proxy.isHealthy = false;
      logger.error(`Error validating proxy ${key}: ${error}`);
      
      if (proxy.failureCount >= this.config.maxFailuresBeforeBan) {
        this.markProxyAsBad(proxy);
      }
      return false;
    }
  }

  private async testProxyConnection(proxy: ProfileProxy): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const timeout = setTimeout(() => {
        resolve(false);
      }, this.config.healthCheckTimeout);

      try {
        const url = new URL(this.config.healthCheckUrl);
        const isHttps = url.protocol === 'https:';
        const client = isHttps ? https : http;

        const proxyUrl = `http://${proxy.host}:${proxy.port}`;
        const options: any = {
          hostname: url.hostname,
          port: url.port || (isHttps ? 443 : 80),
          path: url.pathname + url.search,
          method: 'GET',
          timeout: this.config.healthCheckTimeout,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          },
        };

        // Add proxy authentication if available
        if (proxy.username && proxy.password) {
          const auth = Buffer.from(`${proxy.username}:${proxy.password}`).toString('base64');
          options.headers['Proxy-Authorization'] = `Basic ${auth}`;
        }

        const req = client.request(options, (res) => {
          clearTimeout(timeout);
          resolve(res.statusCode !== undefined && res.statusCode >= 200 && res.statusCode < 500);
          res.resume(); // Consume response data
        });

        req.on('error', () => {
          clearTimeout(timeout);
          resolve(false);
        });

        req.on('timeout', () => {
          req.destroy();
          clearTimeout(timeout);
          resolve(false);
        });

        req.end();
      } catch (error) {
        clearTimeout(timeout);
        resolve(false);
      }
    });
  }

  private async recoverBadProxies(): Promise<void> {
    const now = Date.now();
    const recoveredKeys: string[] = [];

    this.badProxies.forEach((bannedAt, key) => {
      if (now - bannedAt.getTime() >= this.config.recoveryInterval) {
        recoveredKeys.push(key);
      }
    });

    if (recoveredKeys.length > 0) {
      recoveredKeys.forEach(key => {
        this.badProxies.delete(key);
        // Reset failure count for recovery
        const proxy = this.allProxies.find(p => `${p.host}:${p.port}` === key);
        if (proxy) {
          proxy.failureCount = 0;
        }
      });
      logger.info(`Recovered ${recoveredKeys.length} proxies for retry`);
    }
  }

  private async loadProxies(): Promise<void> {
    try {
      logger.info(`Loading proxies from file: ${this.proxyDir}`);
      if (fs.existsSync(this.proxyDir)) {
        const result = await ProxyParser.parseFile(this.proxyDir);
        this.allProxies = result.proxies.map(proxy => ({
          ...proxy,
          latency: Infinity,
          lastUsed: null,
          onCooldown: false,
          usageCount: 0,
          successCount: 0,
          failureCount: 0,
          ipType: 'unknown',
          blockedWebsites: new Map(),
          lastHealthCheck: null,
          isHealthy: false,
        }));
        this.workingProxies = new Set(this.allProxies.map(proxy => `${proxy.host}:${proxy.port}`));
        logger.info(`Successfully loaded ${this.allProxies.length} proxies from file.`);
      }else {
        logger.warn(`Proxy file not found at ${this.proxyDir}. No proxies loaded.`);
      }

    } catch (error) {
      logger.error(`Failed to load proxies: ${error}`);
      throw error;
    }
  }

  async getProxy(website?: string): Promise<ProfileProxy | null> {
    if (this.allProxies.length === 0) {
      logger.warn('No proxies available to provide.');
      return null;
    }

    const now = new Date();
    
    // Filter available proxies
    const pool = this.allProxies.filter(proxy => {
      const key = `${proxy.host}:${proxy.port}`;
      
      // Skip banned proxies
      if (this.badProxies.has(key)) {
        return false;
      }
      
      // Skip proxies on cooldown
      if (proxy.onCooldown && proxy.lastUsed) {
        const timeSinceUse = now.getTime() - proxy.lastUsed.getTime();
        if (timeSinceUse < this.config.cooldownDuration) {
          return false;
        } else {
          proxy.onCooldown = false;
        }
      }
      
      // Skip if blocked by specific website
      if (website && proxy.blockedWebsites.has(website)) {
        const blockedAt = proxy.blockedWebsites.get(website)!;
        const timeSinceBlock = now.getTime() - blockedAt.getTime();
        if (timeSinceBlock < this.config.recoveryInterval) {
          return false;
        } else {
          // Recovery period passed, unblock
          proxy.blockedWebsites.delete(website);
        }
      }
      
      return true;
    });

    if (pool.length === 0) {
      logger.warn('No valid proxies available after filtering.');
      return null;
    }

    let proxy: ProfileProxy | null = null;

    switch (this.config.rotationStrategy) {
      case RotationStrategy.ROUND_ROBIN:
        // Sort by last used time ascending
        pool.sort((a, b) => {
          if (a.lastUsed === null) return -1;
          if (b.lastUsed === null) return 1;
          return a.lastUsed.getTime() - b.lastUsed.getTime();
        });
        proxy = pool[0];
        break;

      case RotationStrategy.LATENCY_BASED:
        // Sort by latency ascending (fastest first)
        pool.sort((a, b) => a.latency - b.latency);
        proxy = pool[0];
        break;

      case RotationStrategy.WEIGHTED:
        // Weight by success rate
        const weighted = pool.map(p => ({
          proxy: p,
          weight: p.successCount / Math.max(p.usageCount, 1)
        }));
        weighted.sort((a, b) => b.weight - a.weight);
        proxy = weighted[0].proxy;
        break;

      case RotationStrategy.RANDOM:
        const randomIndex = Math.floor(Math.random() * pool.length);
        proxy = pool[randomIndex];
        break;

      default:
        proxy = pool[0];
        break;
    }

    if (proxy) {
      this.updateProxyUsage(proxy);
    }

    return proxy;
  }

  private updateProxyUsage(proxy: ProfileProxy): void {
    proxy.lastUsed = new Date();
    proxy.usageCount++;
    proxy.onCooldown = true;
  }

  markProxyAsBad(proxy: ProfileProxy): void {
    const key = `${proxy.host}:${proxy.port}`;
    this.badProxies.set(key, new Date());
    this.workingProxies.delete(key);
    proxy.isHealthy = false;
    logger.info(`Marked proxy as bad: ${key}`);
  }

  markProxyAsBlockedByWebsite(proxy: ProfileProxy, website: string): void {
    const key = `${proxy.host}:${proxy.port}`;
    proxy.blockedWebsites.set(website, new Date());
    logger.info(`Marked proxy ${key} as blocked by website: ${website}`);
  }

  reportProxySuccess(proxy: ProfileProxy): void {
    proxy.successCount++;
    proxy.failureCount = 0; // Reset consecutive failures
    proxy.isHealthy = true;
  }

  reportProxyFailure(proxy: ProfileProxy, website?: string): void {
    proxy.failureCount++;
    
    if (website) {
      this.markProxyAsBlockedByWebsite(proxy, website);
    }
    
    if (proxy.failureCount >= this.config.maxFailuresBeforeBan) {
      this.markProxyAsBad(proxy);
    }
  }

  getStats() {
    const totalProxies = this.allProxies.length;
    const healthyProxies = this.allProxies.filter(p => p.isHealthy).length;
    const bannedProxies = this.badProxies.size;
    const averageLatency = this.allProxies.reduce((sum, p) => sum + (p.latency === Infinity ? 0 : p.latency), 0) / totalProxies;

    return {
      total: totalProxies,
      healthy: healthyProxies,
      banned: bannedProxies,
      working: this.workingProxies.size,
      averageLatency: Math.round(averageLatency),
    };
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    logger.info('Proxy Manager stopped');
  }
}
