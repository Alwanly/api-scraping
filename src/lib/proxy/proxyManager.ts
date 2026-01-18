import * as path from 'path';
import * as fs from 'fs';
import { logger } from "../logger";
import * as defaultConfig from "./default";
import { ProfileProxy, ProxyPoolConfig, RotationStrategy } from "./types";
import { ProxyParser } from './proxyParser';


export class ProxyManager {
  private config: ProxyPoolConfig;
  private allProxies: ProfileProxy[] = [];
  private badProxies: Set<string> = new Set();
  private workingProxies: Set<string> = new Set();
  private proxyDir = '';
  private isRunning = false;


  constructor(config?:Partial<ProxyPoolConfig>) {
    this.config = {...defaultConfig.DEFAULT_PROXY, ...config};
    this.proxyDir = path.join(process.cwd(), defaultConfig.DATA_DIR,defaultConfig.PROXY_FILE);
  }

  async initialize(): Promise<void> {
    logger.info('Initializing Proxy Manager')

    this.loadProxies();


    this.isRunning = true;
    
    this.startLoop().catch();

    logger.info('Proxy Manager initialized successfully');
  }

  private async startLoop(): Promise<void> {
    while (this.isRunning) {
      try {
        await this.validateCycle();
      } catch (error) {
        logger.error(`Error during proxy validation cycle: ${error}`);
      }
      await new Promise(resolve => setTimeout(resolve, this.config.validationInterval)); // 5 minutes
    }
  }
  private async validateCycle(): Promise<void> {
    const startTime = Date.now();
    logger.info('Starting proxy validation cycle');

    const proxies = [...this.allProxies];

    const newProxies = [];
    for (const proxy of proxies) {
      if (this.badProxies.has(`${proxy.host}:${proxy.port}`)) {
        continue;
      }
      newProxies.push(proxy);
    }

    if (newProxies.length === 0) {
      logger.warn('All proxies are marked as bad. Retaining existing proxies.');
      return;
    }

    this.workingProxies = new Set(newProxies.map(proxy => `${proxy.host}:${proxy.port}`));

    const endTime = Date.now();
    logger.info(`Proxy validation cycle completed in ${endTime - startTime} ms`);
    logger.info(`Valid proxies count: ${this.allProxies.length}`);
  }

  private async loadProxies(): Promise<void> {
    try {
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

  async getProxy(): Promise<ProfileProxy | null> {
    if (this.allProxies.length === 0) {
      logger.warn('No proxies available to provide.');
      return null;
    }
    const pool = this.allProxies.filter(proxy => !this.badProxies.has(`${proxy.host}:${proxy.port}`));
    if (pool.length === 0) {
      logger.warn('No valid proxies available after filtering bad proxies.');
      return null;
    }
    let proxy: ProfileProxy | null = null;

    switch (this.config.rotationStrategy) {
      case RotationStrategy.ROUND_ROBIN:
        
        // sort by last used time ascending
        pool.sort((a, b) => {
          if (a.lastUsed === null) return -1;
          if (b.lastUsed === null) return 1;
          return a.lastUsed.getTime() - b.lastUsed.getTime();
        });
        proxy = pool[0];
        break;
        case RotationStrategy.RANDOM:
        const randomIndex = Math.floor(Math.random() * pool.length);
        proxy = pool[randomIndex];
        break;
      default:
        proxy = pool[0];
        break;
    }
    return proxy;
  }

  markProxyAsBad(proxy: ProfileProxy): void {
    const key = `${proxy.host}:${proxy.port}`;
    this.badProxies.add(key);
    this.workingProxies.delete(key);
    logger.info(`Marked proxy as bad: ${key}`);
  }
}