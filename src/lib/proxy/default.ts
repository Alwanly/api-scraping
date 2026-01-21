import { ProxyPoolConfig, RotationStrategy } from "./types";

export const DEFAULT_PROXY:ProxyPoolConfig = {
  maxSize: 10,
  minSize: 2,
  rotationStrategy: RotationStrategy.ROUND_ROBIN,
  validationInterval: 5 * 60 * 1000, // 5 minutes
  healthCheckTimeout: 10000, // 10 seconds
  healthCheckUrl: 'https://www.google.com',
  cooldownDuration: 30 * 1000, // 30 seconds
  maxFailuresBeforeBan: 3,
  recoveryInterval: 10 * 60 * 1000, // 10 minutes
}

export const DATA_DIR = 'data';

export const PROXY_FILE = 'proxies.txt';