import { BrowserPoolConfig, ProfileRotationStrategy } from "./types";

export const DEFAULT_BROWSER_CONFIG: BrowserPoolConfig = {
  maxBrowsers: 5,
  minBrowsers: 1,
  maxPagesPerBrowser: 5,
  browserTimeout: 5 * 60 * 1000, // 5 minutes
  pageTimeout: 30 * 1000, // 30 seconds
  usePlaywright: true,
  headless: true,
  stealth: true,
  profileRotationStrategy: ProfileRotationStrategy.LEAST_USED,
  profileRotationInterval: 10, // Rotate after 10 uses
  proxy: {
    enabled: false,
    rotatePerBrowser: true,
  },
};

export const COMMON_LOCALES = [
  'en-US',
  'en-GB',
  'en-CA',
  'en-AU',
];

export const COMMON_TIMEZONES = [
  'America/New_York',
  'America/Los_Angeles',
  'America/Chicago',
  'Europe/London',
  'Europe/Paris',
  'Asia/Tokyo',
  'Australia/Sydney',
];

export const COMMON_WEBGL_VENDORS = [
  { vendor: 'Google Inc. (Intel)', renderer: 'ANGLE (Intel, Intel(R) UHD Graphics 630, OpenGL 4.1)' },
  { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1080 Ti, OpenGL 4.5)' },
  { vendor: 'Google Inc. (AMD)', renderer: 'ANGLE (AMD, AMD Radeon RX 580, OpenGL 4.5)' },
  { vendor: 'Intel Inc.', renderer: 'Intel Iris OpenGL Engine' },
  { vendor: 'Google Inc. (Apple)', renderer: 'ANGLE (Apple, Apple M1, OpenGL 4.1)' },
];

export const COMMON_FONTS = [
  'Arial',
  'Arial Black',
  'Comic Sans MS',
  'Courier New',
  'Georgia',
  'Impact',
  'Times New Roman',
  'Trebuchet MS',
  'Verdana',
  'Webdings',
  'Wingdings',
];
