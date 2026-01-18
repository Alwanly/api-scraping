import { ProxyPoolConfig, RotationStrategy } from "./types";

export const DEFAULT_PROXY:ProxyPoolConfig = {
  maxSize: 10,
  minSize: 2,
  rotationStrategy: RotationStrategy.ROUND_ROBIN,
  validationInterval: 5 * 60 * 1000, // 5 minutes
}

export const DATA_DIR = 'data';

export const PROXY_FILE = 'proxies.txt';