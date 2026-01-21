import { Browser, Page } from 'playwright';

export interface BrowserProfile {
  id: string;
  userAgent: string;
  viewport: { width: number; height: number };
  platform: string;
  deviceScaleFactor: number;
  isMobile: boolean;
  hasTouch: boolean;
  locale: string;
  timezone: string;
  permissions: string[];
  geolocation?: { latitude: number; longitude: number; accuracy: number };
  
  // Fingerprint details
  fingerprint: {
    screen: {
      width: number;
      height: number;
      availWidth: number;
      availHeight: number;
      colorDepth: number;
      pixelDepth: number;
    };
    navigator: {
      hardwareConcurrency: number;
      deviceMemory: number;
      vendor: string;
      language: string;
      languages: string[];
      platform: string;
      maxTouchPoints: number;
    };
    webgl: {
      vendor: string;
      renderer: string;
    };
    fonts: string[];
  };

  // Usage tracking
  lastUsed: Date | null;
  usageCount: number;
  successCount: number;
  failureCount: number;
  createdAt: Date;
}

export interface BrowserInstance {
  id: string;
  profile: BrowserProfile;
  browser: Browser | null;
  pages: Map<string, Page>;
  isActive: boolean;
  createdAt: Date;
  lastUsed: Date | null;
  proxy: {
    host: string;
    port: number;
    username?: string;
    password?: string;
  } | null;
}

export interface BrowserPoolConfig {
  maxBrowsers: number;
  minBrowsers: number;
  maxPagesPerBrowser: number;
  browserTimeout: number; // Browser idle timeout before cleanup
  pageTimeout: number; // Page navigation timeout
  browserlessEndpoint?: string; // Optional browserless.io endpoint
  usePlaywright: boolean; // true = Playwright, false = Puppeteer
  headless: boolean;
  stealth: boolean;
  profileRotationStrategy: ProfileRotationStrategy;
  profileRotationInterval: number; // Rotate profiles every X uses
  proxy?: {
    enabled: boolean;
    rotatePerBrowser: boolean;
  };
}

export enum ProfileRotationStrategy {
  SEQUENTIAL = 'sequential',
  RANDOM = 'random',
  LEAST_USED = 'least-used',
  ROUND_ROBIN = 'round-robin',
}

export enum BrowserEngine {
  CHROMIUM = 'chromium',
  FIREFOX = 'firefox',
  WEBKIT = 'webkit',
}

export interface PageOptions {
  url?: string;
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle';
  timeout?: number;
  userAgent?: string;
  viewport?: { width: number; height: number };
}

export interface BrowserContextOptions {
  profile?: BrowserProfile;
  proxy?: {
    server: string;
    username?: string;
    password?: string;
  };
  headless?: boolean;
  stealth?: boolean;
}

export interface BrowserPoolStats {
  totalBrowsers: number;
  activeBrowsers: number;
  totalPages: number;
  totalProfiles: number;
  profilesInUse: number;
  averagePageLoadTime: number;
}
