import { NaverUrlParsed } from './types';

/**
 * Parse Naver SmartStore URL
 * Supports formats:
 * - https://smartstore.naver.com/{store}/products/{id}
 * - https://m.smartstore.naver.com/{store}/products/{id}
 * - https://brand.naver.com/{store}/products/{id}
 */
export function parseNaverProductUrl(url: string): NaverUrlParsed {
  const result: NaverUrlParsed = {
    storeName: '',
    productId: '',
    fullUrl: url,
    isValid: false,
  };

  try {
    const urlObj = new URL(url);
    
    // Check if it's a Naver domain
    if (!urlObj.hostname.includes('naver.com')) {
      return result;
    }

    // Extract pathname parts
    const pathParts = urlObj.pathname.split('/').filter(p => p);

    // Format: /{storeName}/products/{productId}
    if (pathParts.length >= 3 && pathParts[1] === 'products') {
      result.storeName = pathParts[0];
      result.productId = pathParts[2];
      result.isValid = true;
    }
    // Alternative format: /products/{productId}
    else if (pathParts.length >= 2 && pathParts[0] === 'products') {
      result.productId = pathParts[1];
      result.storeName = urlObj.hostname.split('.')[0]; // Use subdomain as store
      result.isValid = true;
    }

    return result;
  } catch (error) {
    return result;
  }
}

/**
 * Build Naver SmartStore URL
 */
export function buildNaverProductUrl(storeName: string, productId: string): string {
  return `https://smartstore.naver.com/${storeName}/products/${productId}`;
}

/**
 * Build mobile Naver SmartStore URL
 */
export function buildNaverMobileUrl(storeName: string, productId: string): string {
  return `https://m.smartstore.naver.com/${storeName}/products/${productId}`;
}

/**
 * Validate Naver product URL
 */
export function isValidNaverProductUrl(url: string): boolean {
  const parsed = parseNaverProductUrl(url);
  return parsed.isValid && !!parsed.productId;
}

/**
 * Extract product ID from URL
 */
export function extractProductId(url: string): string | null {
  const parsed = parseNaverProductUrl(url);
  return parsed.isValid ? parsed.productId : null;
}

/**
 * Extract store name from URL
 */
export function extractStoreName(url: string): string | null {
  const parsed = parseNaverProductUrl(url);
  return parsed.isValid ? parsed.storeName : null;
}
