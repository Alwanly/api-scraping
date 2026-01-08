import { BrowserFingerprint } from '../types';
import * as crypto from 'crypto';

// Fingerprint pool state
let fingerprintIndex = 0;
const usedFingerprints = new Set<number>();


// Desktop User Agents (14 total - match viewport count)
const DESKTOP_USER_AGENTS = [
  // Chrome - Windows (5)
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 11.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  
  // Chrome - macOS (3)
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_1_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  
  // Edge - Windows (2)
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
  'Mozilla/5.0 (Windows NT 11.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
  
  // Firefox - Windows (2)
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0',
  
  // Firefox - macOS (1)
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.1; rv:133.0) Gecko/20100101 Firefox/133.0',
  
  // Safari - macOS (1)
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15',
];

// Mobile User Agents (7 total - match viewport count)
const MOBILE_USER_AGENTS = [
  // Android (4)
  'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (Linux; Android 13; Pixel 7 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (Linux; Android 13; SM-A515F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
  
  // iOS (3)
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.0.0 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
];

// Tablet User Agents (7 total - match viewport count)
const TABLET_USER_AGENTS = [
  // iPad (4)
  'Mozilla/5.0 (iPad; CPU OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (iPad; CPU OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.0.0 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (iPad; CPU OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
  
  // Android Tablet (3)
  'Mozilla/5.0 (Linux; Android 13; SM-X906C) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Linux; Android 12; Lenovo TB-X606F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Linux; Android 13; SM-T870) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
];

// Desktop Viewports (14 total - organized by OS/type to match user agents)
const DESKTOP_VIEWPORTS = [
  // Windows typical (5) - matches Windows Chrome
  { width: 1920, height: 1080 },  // Full HD - most common Windows
  { width: 1366, height: 768 },   // Most common laptop
  { width: 2560, height: 1440 },  // 2K QHD
  { width: 1536, height: 864 },   // Common laptop (150% scaling)
  { width: 1600, height: 900 },   // HD+
  
  // macOS typical (3) - matches macOS Chrome
  { width: 1440, height: 900 },   // MacBook Air
  { width: 2560, height: 1600 },  // MacBook Pro 13"
  { width: 1680, height: 1050 },  // MacBook Pro (older)
  
  // Windows (2) - matches Edge
  { width: 1280, height: 720 },   // HD
  { width: 3840, height: 2160 },  // 4K UHD
  
  // Windows (2) - matches Firefox Windows
  { width: 1280, height: 800 },   // WXGA
  { width: 1920, height: 1200 },  // WUXGA
  
  // macOS (1) - matches Firefox macOS
  { width: 3024, height: 1964 },  // MacBook Pro 14"
  
  // macOS (1) - matches Safari
  { width: 3456, height: 2234 },  // MacBook Pro 16"
];

// Mobile Viewports (Portrait)
const MOBILE_VIEWPORTS = [
  { width: 390, height: 844 },    // iPhone 14/15
  { width: 393, height: 851 },    // Pixel 7
  { width: 412, height: 915 },    // Samsung Galaxy
  { width: 414, height: 896 },    // iPhone 11/XR
  { width: 430, height: 932 },    // iPhone 14 Pro Max
  { width: 360, height: 800 },    // Common Android
  { width: 375, height: 667 },    // iPhone SE
];

// Tablet Viewports
const TABLET_VIEWPORTS = [
  // Portrait
  { width: 768, height: 1024 },   // iPad
  { width: 834, height: 1194 },   // iPad Pro 11"
  { width: 820, height: 1180 },   // iPad Air
  { width: 810, height: 1080 },   // Android tablet
  
  // Landscape
  { width: 1024, height: 768 },   // iPad
  { width: 1194, height: 834 },   // iPad Pro 11"
  { width: 1280, height: 800 },   // Android tablet
];

const LOCALES = ['ko-KR', 'ko'];
const TIMEZONES = ['Asia/Seoul'];

/**
 * Get cryptographically secure random integer
 */
function getSecureRandomInt(max: number): number {
  return crypto.randomInt(0, max);
}

/**
 * Get next fingerprint index using round-robin with jitter
 * Ensures even distribution across all fingerprints
 */
function getNextFingerprintIndex(totalFingerprints: number): number {
  // Reset if we've used all fingerprints
  if (usedFingerprints.size >= totalFingerprints) {
    usedFingerprints.clear();
  }
  
  // Get next unused index with some randomness
  let index: number;
  let attempts = 0;
  const maxAttempts = totalFingerprints * 2;
  
  do {
    // Start with round-robin, add small jitter
    const baseIndex = fingerprintIndex % totalFingerprints;
    const jitter = getSecureRandomInt(3) - 1; // -1, 0, or 1
    index = (baseIndex + jitter + totalFingerprints) % totalFingerprints;
    attempts++;
  } while (usedFingerprints.has(index) && attempts < maxAttempts);
  
  usedFingerprints.add(index);
  fingerprintIndex++;
  
  return index;
}

/**
 * Generate a random browser fingerprint for anti-detection
 * Uses crypto-random selection with round-robin distribution
 */
export function generateFingerprint(): BrowserFingerprint {
  // Calculate total fingerprints for each type
  const totalDesktop = DESKTOP_USER_AGENTS.length;
  const totalMobile = MOBILE_USER_AGENTS.length;
  const totalTablet = TABLET_USER_AGENTS.length;
  const totalFingerprints = totalDesktop + totalMobile + totalTablet;
  
  // Get next fingerprint index (round-robin with jitter)
  const globalIndex = getNextFingerprintIndex(totalFingerprints);
  
  let userAgent: string;
  let viewport: { width: number; height: number };

  if (globalIndex < totalDesktop) {
    // Desktop (70% of fingerprints)
    const desktopIndex = globalIndex % DESKTOP_USER_AGENTS.length;
    userAgent = DESKTOP_USER_AGENTS[desktopIndex];
    viewport = DESKTOP_VIEWPORTS[desktopIndex % DESKTOP_VIEWPORTS.length];
  } else if (globalIndex < totalDesktop + totalMobile) {
    // Mobile (20% of fingerprints)
    const mobileIndex = (globalIndex - totalDesktop) % MOBILE_USER_AGENTS.length;
    userAgent = MOBILE_USER_AGENTS[mobileIndex];
    viewport = MOBILE_VIEWPORTS[mobileIndex % MOBILE_VIEWPORTS.length];
  } else {
    // Tablet (10% of fingerprints)
    const tabletIndex = (globalIndex - totalDesktop - totalMobile) % TABLET_USER_AGENTS.length;
    userAgent = TABLET_USER_AGENTS[tabletIndex];
    viewport = TABLET_VIEWPORTS[tabletIndex % TABLET_VIEWPORTS.length];
  }
  
  // Rotate locale with secure random
  const locale = LOCALES[getSecureRandomInt(LOCALES.length)];
  const timezone = TIMEZONES[0];

  return {
    userAgent,
    viewport,
    locale,
    timezone,
  };
}

/**
 * Generate a random delay between min and max milliseconds
 * Uses crypto-random for better unpredictability
 */
export function randomDelay(min: number = 1000, max: number = 3000): Promise<void> {
  const delay = min + getSecureRandomInt(max - min + 1);
  return new Promise(resolve => setTimeout(resolve, delay));
}

/**
 * Reset fingerprint rotation (useful for testing)
 */
export function resetFingerprintRotation(): void {
  fingerprintIndex = 0;
  usedFingerprints.clear();
}
