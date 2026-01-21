import { randomUUID } from 'crypto';
import { BrowserProfile, ProfileRotationStrategy } from './types';
import { FingerPrintGenerator } from '../fingerPrints/FingerPrintGenerator';
import { COMMON_LOCALES, COMMON_TIMEZONES, COMMON_WEBGL_VENDORS, COMMON_FONTS } from './default';
import { logger } from '../logger';

export class BrowserProfileManager {
  private profiles: Map<string, BrowserProfile> = new Map();
  private activeProfiles: Set<string> = new Set();
  private rotationStrategy: ProfileRotationStrategy;
  private rotationInterval: number;
  private fingerPrintGenerator: FingerPrintGenerator;

  constructor(
    rotationStrategy: ProfileRotationStrategy = ProfileRotationStrategy.LEAST_USED,
    rotationInterval: number = 10
  ) {
    this.rotationStrategy = rotationStrategy;
    this.rotationInterval = rotationInterval;
    this.fingerPrintGenerator = FingerPrintGenerator.getInstance();
  }

  /**
   * Create a new browser profile with realistic fingerprint
   */
  createProfile(): BrowserProfile {
    const id = randomUUID();
    const fingerprint = this.fingerPrintGenerator.generateFingerPrint();
    
    const viewport = fingerprint.viewport;
    const platform = fingerprint.platform;
    const userAgent = fingerprint.userAgent;

    // Determine device type from user agent
    const isMobile = /Mobile|Android|iPhone/i.test(userAgent);
    const hasTouch = isMobile || Math.random() > 0.7; // Some desktops have touch

    // Generate realistic hardware specs
    const hardwareConcurrency = this.getRealisticCores(platform);
    const deviceMemory = this.getRealisticMemory(platform);
    const deviceScaleFactor = this.getRealisticScaleFactor(viewport.width);

    // Screen dimensions (larger than viewport)
    const screenWidth = viewport.width;
    const screenHeight = viewport.height;
    
    // Select random locale and timezone
    const locale = COMMON_LOCALES[Math.floor(Math.random() * COMMON_LOCALES.length)];
    const timezone = COMMON_TIMEZONES[Math.floor(Math.random() * COMMON_TIMEZONES.length)];
    const language = locale.split('-')[0];

    // Select WebGL vendor/renderer
    const webgl = COMMON_WEBGL_VENDORS[Math.floor(Math.random() * COMMON_WEBGL_VENDORS.length)];

    const profile: BrowserProfile = {
      id,
      userAgent,
      viewport,
      platform,
      deviceScaleFactor,
      isMobile,
      hasTouch,
      locale,
      timezone,
      permissions: [],
      fingerprint: {
        screen: {
          width: screenWidth,
          height: screenHeight,
          availWidth: screenWidth,
          availHeight: screenHeight - (isMobile ? 0 : 40), // Subtract taskbar height
          colorDepth: 24,
          pixelDepth: 24,
        },
        navigator: {
          hardwareConcurrency,
          deviceMemory,
          vendor: this.getVendor(userAgent),
          language,
          languages: this.getLanguages(locale),
          platform,
          maxTouchPoints: hasTouch ? (isMobile ? 5 : 1) : 0,
        },
        webgl: {
          vendor: webgl.vendor,
          renderer: webgl.renderer,
        },
        fonts: [...COMMON_FONTS],
      },
      lastUsed: null,
      usageCount: 0,
      successCount: 0,
      failureCount: 0,
      createdAt: new Date(),
    };

    this.profiles.set(id, profile);
    logger.debug(`Created new browser profile: ${id}`);
    
    return profile;
  }

  /**
   * Get a profile based on rotation strategy
   */
  getProfile(): BrowserProfile {
    if (this.profiles.size === 0) {
      return this.createProfile();
    }

    let profile: BrowserProfile | undefined;

    switch (this.rotationStrategy) {
      case ProfileRotationStrategy.SEQUENTIAL:
        profile = this.getSequentialProfile();
        break;
      case ProfileRotationStrategy.RANDOM:
        profile = this.getRandomProfile();
        break;
      case ProfileRotationStrategy.LEAST_USED:
        profile = this.getLeastUsedProfile();
        break;
      case ProfileRotationStrategy.ROUND_ROBIN:
        profile = this.getRoundRobinProfile();
        break;
      default:
        profile = this.getLeastUsedProfile();
    }

    // Create new profile if rotation interval exceeded
    if (profile && profile.usageCount >= this.rotationInterval) {
      logger.info(`Profile ${profile.id} reached rotation interval, creating new profile`);
      profile = this.createProfile();
    }

    if (!profile) {
      profile = this.createProfile();
    }

    this.activeProfiles.add(profile.id);
    return profile;
  }

  /**
   * Update profile usage statistics
   */
  updateProfileUsage(profileId: string, success: boolean): void {
    const profile = this.profiles.get(profileId);
    if (!profile) return;

    profile.lastUsed = new Date();
    profile.usageCount++;
    
    if (success) {
      profile.successCount++;
    } else {
      profile.failureCount++;
    }
  }

  /**
   * Release a profile from active use
   */
  releaseProfile(profileId: string): void {
    this.activeProfiles.delete(profileId);
  }

  /**
   * Delete a profile
   */
  deleteProfile(profileId: string): void {
    this.profiles.delete(profileId);
    this.activeProfiles.delete(profileId);
    logger.debug(`Deleted profile: ${profileId}`);
  }

  /**
   * Get all profiles
   */
  getAllProfiles(): BrowserProfile[] {
    return Array.from(this.profiles.values());
  }

  /**
   * Get profile by ID
   */
  getProfileById(id: string): BrowserProfile | undefined {
    return this.profiles.get(id);
  }

  /**
   * Clear all profiles
   */
  clearProfiles(): void {
    this.profiles.clear();
    this.activeProfiles.clear();
    logger.info('Cleared all browser profiles');
  }

  private getSequentialProfile(): BrowserProfile | undefined {
    const profiles = Array.from(this.profiles.values());
    return profiles[0];
  }

  private getRandomProfile(): BrowserProfile | undefined {
    const profiles = Array.from(this.profiles.values());
    const index = Math.floor(Math.random() * profiles.length);
    return profiles[index];
  }

  private getLeastUsedProfile(): BrowserProfile | undefined {
    const profiles = Array.from(this.profiles.values());
    return profiles.sort((a, b) => a.usageCount - b.usageCount)[0];
  }

  private getRoundRobinProfile(): BrowserProfile | undefined {
    const profiles = Array.from(this.profiles.values());
    return profiles.sort((a, b) => {
      if (a.lastUsed === null) return -1;
      if (b.lastUsed === null) return 1;
      return a.lastUsed.getTime() - b.lastUsed.getTime();
    })[0];
  }

  private getRealisticCores(platform: string): number {
    if (platform.includes('Mac')) {
      return [4, 8, 10, 12][Math.floor(Math.random() * 4)]; // Apple Silicon or Intel
    }
    return [4, 6, 8, 12, 16][Math.floor(Math.random() * 5)];
  }

  private getRealisticMemory(platform: string): number {
    if (platform.includes('Mac')) {
      return [8, 16, 32, 64][Math.floor(Math.random() * 4)];
    }
    return [4, 8, 16, 32][Math.floor(Math.random() * 4)];
  }

  private getRealisticScaleFactor(width: number): number {
    if (width >= 2560) return 2; // 4K/Retina
    if (width >= 1920) return Math.random() > 0.5 ? 1 : 1.25;
    return 1;
  }

  private getVendor(userAgent: string): string {
    if (userAgent.includes('Chrome') || userAgent.includes('Edge')) {
      return 'Google Inc.';
    }
    if (userAgent.includes('Safari')) {
      return 'Apple Computer, Inc.';
    }
    if (userAgent.includes('Firefox')) {
      return '';
    }
    return 'Google Inc.';
  }

  private getLanguages(locale: string): string[] {
    const language = locale.split('-')[0];
    return [locale, language];
  }

  getStats() {
    return {
      total: this.profiles.size,
      active: this.activeProfiles.size,
      averageUsage: Array.from(this.profiles.values()).reduce((sum, p) => sum + p.usageCount, 0) / this.profiles.size || 0,
    };
  }
}
