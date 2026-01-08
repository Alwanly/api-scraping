import { ProxyConfig } from '../types';
import { logger } from './logger';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Parse proxy string format: host:port:username:password
 */
export function parseProxyString(proxyStr: string): ProxyConfig | null {
  try {
    const parts = proxyStr.split(':');
    if (parts.length < 2) return null;

    return {
      host: parts[0],
      port: parseInt(parts[1]),
      username: parts[2] || undefined,
      password: parts[3] || undefined,
    };
  } catch (error) {
    logger.error(`Failed to parse proxy string: ${proxyStr}`, error);
    return null;
  }
}

interface ProxyHealth {
  proxy: ProxyConfig;
  failureCount: number;
  lastUsed: number;
  inCooldown: boolean;
}

/**
 * Proxy rotation manager with health tracking
 */
export class ProxyManager {
  private proxies: ProxyConfig[] = [];
  private currentIndex = 0;
  private proxyHealth: Map<string, ProxyHealth> = new Map();
  private readonly MAX_FAILURES = 3;
  private readonly COOLDOWN_TIME = 5 * 60 * 1000; // 5 minutes

  constructor() {
    this.loadProxies();
  }

  private loadProxies() {
    // Primary proxy from requirements
    const primaryProxy = process.env.PROXY_STRING || '';
    console.log('Primary Proxy:', primaryProxy);
    
    const parsed = parseProxyString(primaryProxy);
    if (parsed) {
      this.proxies.push(parsed);
      this.initProxyHealth(parsed);
      logger.info(`Loaded primary proxy: ${parsed.host}:${parsed.port}`);
    }

    // Add additional proxies from environment (optional)
    const additionalProxies = process.env.ADDITIONAL_PROXIES?.split(',') || [];
    additionalProxies.forEach(proxyStr => {
      const proxy = parseProxyString(proxyStr.trim());
      if (proxy) {
        this.proxies.push(proxy);
        this.initProxyHealth(proxy);
        logger.info(`Loaded additional proxy: ${proxy.host}:${proxy.port}`);
      }
    });

    if (this.proxies.length === 0) {
      logger.warn('No proxies configured, running without proxy');
    }
  }

  /**
   * Get next proxy in rotation
   */
  getNextProxy(): ProxyConfig | undefined {
    if (this.proxies.length === 0) return undefined;

    const proxy = this.proxies[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % this.proxies.length;
    return proxy;
  }

  /**
   * Get a random proxy
   */
  getRandomProxy(): ProxyConfig | undefined {
    if (this.proxies.length === 0) return undefined;
    return this.proxies[Math.floor(Math.random() * this.proxies.length)];
  }

  /**
   * Get all proxies
   */
  getAllProxies(): ProxyConfig[] {
    return [...this.proxies];
  }

  /**
   * Initialize health tracking for a proxy
   */
  private initProxyHealth(proxy: ProxyConfig): void {
    const key = `${proxy.host}:${proxy.port}`;
    this.proxyHealth.set(key, {
      proxy,
      failureCount: 0,
      lastUsed: 0,
      inCooldown: false,
    });
  }

  /**
   * Get a healthy proxy (skips proxies in cooldown)
   */
  getHealthyProxy(): ProxyConfig | undefined {
    if (this.proxies.length === 0) return undefined;

    const now = Date.now();
    let attempts = 0;
    const maxAttempts = this.proxies.length * 2;

    while (attempts < maxAttempts) {
      const proxy = this.proxies[this.currentIndex];
      const key = `${proxy.host}:${proxy.port}`;
      const health = this.proxyHealth.get(key);

      this.currentIndex = (this.currentIndex + 1) % this.proxies.length;
      attempts++;

      if (!health) continue;

      // Check if cooldown expired
      if (health.inCooldown && now - health.lastUsed > this.COOLDOWN_TIME) {
        health.inCooldown = false;
        health.failureCount = 0;
        logger.info(`Proxy ${key} cooldown expired, back in rotation`);
      }

      if (!health.inCooldown) {
        health.lastUsed = now;
        return proxy;
      }
    }

    // If all proxies are in cooldown, return the least recently used one
    logger.warn('All proxies in cooldown, using least recently used');
    return this.getLeastRecentlyUsedProxy();
  }

  /**
   * Mark proxy as failed
   */
  markProxyFailed(proxy: ProxyConfig): void {
    const key = `${proxy.host}:${proxy.port}`;
    const health = this.proxyHealth.get(key);

    if (health) {
      health.failureCount++;
      logger.warn(`Proxy ${key} failure count: ${health.failureCount}`);

      if (health.failureCount >= this.MAX_FAILURES) {
        health.inCooldown = true;
        health.lastUsed = Date.now();
        logger.warn(`Proxy ${key} entered cooldown for ${this.COOLDOWN_TIME / 1000}s`);
      }
    }
  }

  /**
   * Mark proxy as successful
   */
  markProxySuccess(proxy: ProxyConfig): void {
    const key = `${proxy.host}:${proxy.port}`;
    const health = this.proxyHealth.get(key);

    if (health && health.failureCount > 0) {
      health.failureCount = Math.max(0, health.failureCount - 1);
    }
  }

  /**
   * Get least recently used proxy
   */
  private getLeastRecentlyUsedProxy(): ProxyConfig | undefined {
    if (this.proxies.length === 0) return undefined;

    let oldestProxy: ProxyConfig | undefined;
    let oldestTime = Infinity;

    for (const [, health] of this.proxyHealth) {
      if (health.lastUsed < oldestTime) {
        oldestTime = health.lastUsed;
        oldestProxy = health.proxy;
      }
    }

    return oldestProxy || this.proxies[0];
  }
}

export const proxyManager = new ProxyManager();
