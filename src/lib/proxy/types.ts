export interface RawProxy {
  host: string;
  port: number;
  username?: string;
  password?: string;
  protocol?: "http" | "https" | "socks5";
}

export interface ProfileProxy extends RawProxy {
  latency: number; // in milliseconds
  lastUsed: Date | null;
  onCooldown: boolean;
  usageCount: number;
  successCount: number;
  failureCount: number;
  ipType: "residential" | "datacenter" | "unknown";
}

export interface BrowserProfile {
  name: string;
  userAgent: string;
  viewport: { width: number; height: number };
  platform: string;
  vendor: string;
  language: string[];
  hardwareConcurrency: number;
  deviceMemory: number;
  secChUa: string;
  secChUaPlatform: string;
}

export interface ProxyPoolConfig {
  maxSize: number;
  minSize: number;
  rotationStrategy: RotationStrategy  ;
  validationInterval: number; // in milliseconds
}

export enum ProxyFormat {
  JSON = "json",
  TXT = "txt",
  CSV = "csv",
  INLINE = "inline",
  UNKNOWN = "unknown",
}

export interface ProxyParseResult {
  proxies: RawProxy[];
  format: ProxyFormat;
  errors: string[];
  total: number;
  valid: number;
}

export enum RotationStrategy {
  ROUND_ROBIN = "round-robin",
  LATENCY_BASED = "latency-based",
  WEIGHTED = "weighted",
  STICKY_SESSION = "sticky-session",
  RANDOM = "random",
}
