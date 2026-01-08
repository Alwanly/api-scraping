export interface NaverProductData {
  productDetail: any;
  benefits: any;
  metadata: {
    scrapedAt: string;
    latency: number;
    cached: boolean;
  };
}

export interface ParsedUrl {
  storeName: string;
  productId: string;
}

export interface ProxyConfig {
  host: string;
  port: number;
  username?: string;
  password?: string;
}

export interface BrowserFingerprint {
  userAgent: string;
  viewport: { width: number; height: number };
  locale: string;
  timezone: string;
}

export interface ScraperOptions {
  proxy?: ProxyConfig;
  fingerprint?: BrowserFingerprint;
  retries?: number;
  timeout?: number;
  timezone?: string;
  languages?: string[];
}
