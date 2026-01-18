import UserAgent from "user-agents";

export interface BrowserFingerPrint {
  userAgent: string;
  viewport: { width: number; height: number };
  platform: string;
}
export class FingerPrintGenerator {
  private static instance: FingerPrintGenerator;


  private readonly COMMON_RESOLUTIONS = [
    { width: 1920, height: 1080, weight: 40 }, // Full HD (most common)
    { width: 1366, height: 768, weight: 20 }, // HD (laptops)
    { width: 1536, height: 864, weight: 15 }, // HD+ (laptops)
    { width: 1440, height: 900, weight: 10 }, // MacBook
    { width: 2560, height: 1440, weight: 10 }, // 2K
    { width: 1600, height: 900, weight: 5 }, // HD+
  ];

  private constructor() {}

  public static getInstance(): FingerPrintGenerator {
    if (!FingerPrintGenerator.instance) {
      FingerPrintGenerator.instance = new FingerPrintGenerator();
    }
    return FingerPrintGenerator.instance;
  }

  public generateUserAgent(): string {
    let userAgent;
    let uaStr = "";

    let attempts = 0;
    while (attempts < 10) {
      userAgent = new UserAgent({ deviceCategory: "desktop" });
      uaStr = userAgent.toString();
      if (
        !uaStr.includes("Linux") &&
        (uaStr.includes("Chrome") || uaStr.includes("Edge"))
      ) {
        break;
      }
      attempts++;
    }
    // Cap Chrome version with realistic 4-part version
    uaStr = uaStr.replace(/Chrome\/[\d.]+/g, (match) => {
      const versionMatch = match.match(/\d+/);
      if (versionMatch && parseInt(versionMatch[0]) > 131) {
        return `Chrome/131.0.6778.${Math.floor(Math.random() * 100) + 100}`;
      }
      return match;
    });

    // Cap Edge version with realistic 4-part version
    uaStr = uaStr.replace(/Edg\/[\d.]+/g, (match) => {
      const versionMatch = match.match(/\d+/);
      if (versionMatch && parseInt(versionMatch[0]) > 131) {
        return `Edg/131.0.2903.${Math.floor(Math.random() * 50) + 50}`;
      }
      return match;
    });

    return uaStr;
  }

  public generateViewport(): { width: number; height: number } {
    const totalWeight = this.COMMON_RESOLUTIONS.reduce((sum, res) => sum + res.weight, 0);
    let randomWeight = Math.random() * totalWeight;

    let selectedResolution = this.COMMON_RESOLUTIONS[0];
    for (const res of this.COMMON_RESOLUTIONS) {
      randomWeight -= res.weight;
      if (randomWeight <= 0) {
        selectedResolution = res;
        break;
      }
    }

    const widthVariation = Math.floor(Math.random() * 21) - 10; // -10 to +10
    const heightVariation = Math.floor(Math.random() * 21) - 10; // -10 to +10

    return {
      width: Math.max(1024, selectedResolution.width + widthVariation),
      height: Math.max(768, selectedResolution.height + heightVariation),
    };
  }

  private extractPlatform(userAgent: string): string {
    if (userAgent.includes('Windows')) return 'Win32';
    if (userAgent.includes('Macintosh') || userAgent.includes('Mac OS')) return 'MacIntel';
    if (userAgent.includes('Linux')) return 'Linux x86_64';
    return 'Win32'; // Default fallback
  }

  public generateFingerPrint(): BrowserFingerPrint {
    const userAgent = this.generateUserAgent();
    const viewport = this.generateViewport();
    const platform = this.extractPlatform(userAgent);
    return {
      userAgent,
      viewport,
      platform,
    };
  }
}
