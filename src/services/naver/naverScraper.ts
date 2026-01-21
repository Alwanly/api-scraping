import { Page } from 'playwright';
import { BrowserPool } from '../../lib/browser/browserPool';
import { logger } from '../../lib/logger';
import {
  NaverProduct,
  NaverScraperOptions,
  NaverScraperResult,
  NaverProductImage,
  NaverProductPrice,
  NaverApiResponse,
} from './types';
import { parseNaverProductUrl } from './urlParser';
import { response } from 'express';

export class NaverScraper {
  private browserPool: BrowserPool;
  private defaultTimeout: number = 30000;
  private warmedBrowsers: Set<string> = new Set();

  constructor(browserPool: BrowserPool) {
    this.browserPool = browserPool;
  }

  /**
   * Detect if page has CAPTCHA
   */
  private async detectCaptcha(page: Page): Promise<boolean> {
    try {
      let isCaptcha = false; 
      await page.on('response', async (response) => {
        const url = response.url();
        if (url.includes('/captcha/') || url.includes('naver.com/captcha')) {
          return true;
        }
        return false;
      })


      return isCaptcha;
    } catch (error) {
      return false;
    }
  }

  /**
   * Warm up browser by visiting homepage first (human-like behavior)
   */
  private async warmupBrowser(browserId: string, page: Page): Promise<void> {
    if (this.warmedBrowsers.has(browserId)) {
      return; // Already warmed
    }

    try {
      logger.info(`Warming up browser ${browserId}...`);
      
      // Visit Naver homepage first
      await page.goto('https://www.naver.com', { waitUntil: 'domcontentloaded', timeout: 10000 });
      
      // Random delay (1-3 seconds)
      await this.randomDelay(1000, 3000);
      
      // Simulate human scrolling
      await this.humanLikeScroll(page);
      
      // Random delay before actual scraping
      await this.randomDelay(500, 1500);
      
      this.warmedBrowsers.add(browserId);
      logger.debug(`Browser ${browserId} warmed up`);
    } catch (error) {
      logger.warn(`Browser warmup failed: ${error}`);
    }
  }

  /**
   * Random delay to simulate human behavior
   */
  private async randomDelay(min: number, max: number): Promise<void> {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  /**
   * Simulate human-like scrolling
   */
  private async humanLikeScroll(page: Page): Promise<void> {
    try {
      const scrollSteps = Math.floor(Math.random() * 3) + 2; // 2-4 scrolls
      
      for (let i = 0; i < scrollSteps; i++) {
        const scrollAmount = Math.floor(Math.random() * 500) + 200; // 200-700px
        await page.evaluate((amount) => {
          window.scrollBy({
            top: amount,
            behavior: 'smooth'
          });
        }, scrollAmount);
        
        await this.randomDelay(300, 800);
      }
      
      // Scroll back up a bit
      await page.evaluate(() => {
        window.scrollBy({
          top: -200,
          behavior: 'smooth'
        });
      });
      
      await this.randomDelay(200, 500);
    } catch (error) {
      logger.debug('Scroll simulation failed (non-critical)');
    }
  }

  /**
   * Simulate mouse movements (random)
   */
  private async simulateMouseMovement(page: Page): Promise<void> {
    try {
      const movements = Math.floor(Math.random() * 3) + 2; // 2-4 movements
      
      for (let i = 0; i < movements; i++) {
        const x = Math.floor(Math.random() * 800) + 100;
        const y = Math.floor(Math.random() * 600) + 100;
        
        await page.mouse.move(x, y, { steps: 10 });
        await this.randomDelay(100, 300);
      }
    } catch (error) {
      logger.debug('Mouse simulation failed (non-critical)');
    }
  }

  /**
   * Scrape a Naver product page
   */
  async scrapeProduct(
    url: string,
    options: NaverScraperOptions = {}
  ): Promise<NaverScraperResult> {
    const startTime = Date.now();
    let browserId: string | null = null;
    let page: Page | null = null;

    const {
      timeout = this.defaultTimeout,
      extractImages = true,
      extractOptions = true,
    } = options;

    try {
      // Validate URL
      const parsed = parseNaverProductUrl(url);
      if (!parsed.isValid) {
        return {
          success: false,
          error: 'Invalid Naver product URL',
        };
      }

      logger.info(`Scraping Naver product: ${parsed.productId}`);

      // Create page
      const result = await this.browserPool.createPage({
        url: 'about:blank', // Start with blank page
        waitUntil: 'domcontentloaded',
        timeout,
      });

      browserId = result.browserId;
      page = result.page;

      // Warm up browser with human-like behavior
      await this.warmupBrowser(browserId, page);

      // Random delay before visiting target
      await this.randomDelay(2000, 4000);  // Increased delay to avoid rate limiting

      // Set up response listener BEFORE navigation
      const responsePromise = page.waitForResponse(
        response => {
          const responseUrl = response.url();
          return responseUrl.includes('/products/') && responseUrl.includes('/v2/channels/');
        },
        { timeout: 30000 }
      );

      // Navigate to target URL
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout });

      // Check for rate limiting (429)
      const statusCode = await page.evaluate(() => {
        const metaStatus = document.querySelector('meta[http-equiv="status"]');
        if (metaStatus) {
          return parseInt(metaStatus.getAttribute('content') || '200', 10);
        }
        return 200;
      });

      if (statusCode === 429) {
        throw new Error('Rate limited (429) - waiting before retry');
      }

      // Check for CAPTCHA immediately
      const hasCaptcha = await this.detectCaptcha(page);
      if (hasCaptcha) {
        throw new Error('CAPTCHA detected - try using proxy or slower request rate');
      }

      // Simulate human behavior
      await this.simulateMouseMovement(page);
      await this.randomDelay(1000, 2000);  // Increased delay

      // Wait for main content
      await page.waitForSelector('div._2-I30XS1lA', { timeout: 10000 }).catch(() => {
        logger.warn('Product container not found, continuing anyway');
      });

      // Human-like scrolling
      await this.humanLikeScroll(page);

      // Wait for page to stabilize
      await this.randomDelay(2000, 3000);  // Increased delay

      // Extract API endpoint and fetch data from API
      const productData = await this.extractFromApi(page, parsed.productId, url, responsePromise, {
        extractImages,
        extractOptions,
      });

      this.browserPool.reportSuccess(browserId);
      await this.browserPool.closePage(browserId, page);

      const duration = Date.now() - startTime;

      return {
        success: true,
        data: productData,
        duration,
      };
    } catch (error: any) {
      logger.error(`Failed to scrape Naver product: ${error.message}`);

      if (browserId) {
        this.browserPool.reportFailure(browserId);
        if (page) {
          await this.browserPool.closePage(browserId, page);
        }
      }

      return {
        success: false,
        error: error.message,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Scrape with retry logic
   */
  async scrapeProductWithRetry(
    url: string,
    options: NaverScraperOptions = {},
    maxRetries: number = 3
  ): Promise<NaverScraperResult> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      logger.info(`Scraping attempt ${attempt}/${maxRetries} for ${url}`);

      const result = await this.scrapeProduct(url, options);

      if (result.success) {
        return { ...result, retries: attempt - 1 };
      }

      if (attempt < maxRetries) {
        // Longer delay for rate limiting errors (429)
        const isRateLimited = result.error?.includes('429') || result.error?.includes('Rate limited');
        const baseDelay = isRateLimited ? 30000 : 2000;  // 30s for 429, 2s for others
        const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), 60000);  // Max 60s
        
        logger.info(`Retrying in ${delay}ms... (${isRateLimited ? 'Rate limited' : 'Error'})`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    return {
      success: false,
      error: `Failed after ${maxRetries} attempts`,
      retries: maxRetries,
    };
  }

  /**
   * Extract product data from Naver API data in page response
   */
  private async extractFromApi(
    page: Page,
    productId: string,
    originalUrl: string,
    responsePromise: Promise<any>,
    options: { extractImages?: boolean; extractOptions?: boolean }
  ): Promise<NaverProduct> {
    try {
      logger.info('Extracting data from page API response...');

      // Wait for the API response that was set up before navigation
      const response = await responsePromise;
      const apiData: NaverApiResponse = await response.json();
      
      logger.debug('Successfully extracted API data from page response');

      // Transform and return
      return this.transformApiResponse(apiData, productId, originalUrl);

    } catch (error: any) {
      logger.warn(`Failed to extract from API data: ${error.message}, falling back to HTML extraction`);
      // Fallback to HTML extraction
      return this.extractProductData(page, productId, options);
    }
  }

  /**
   * Transform Naver API response to our product format
   */
  private transformApiResponse(apiData: NaverApiResponse, productId: string, originalUrl: string): any {
    const product = apiData.product || {};
    const channel = apiData.channel || {};

    if (!product || !channel) {
      throw new Error('Invalid API response structure');
    }
    // Extract images
    const images: NaverProductImage[] = [];
    if (product.images && Array.isArray(product.images)) {
      product.images.forEach((img: any) => {
        if (img.url) {
          images.push({
            url: img.url,
            thumbnail: img.representativeImageUrl || img.url,
          });
        }
      });
    }

    // Extract price
    const salePrice = product.discountedSalePrice || product.salePrice || 0;
    const originalPrice = product.salePrice || salePrice;
    const discountRate = originalPrice > 0 
      ? Math.round(((originalPrice - salePrice) / originalPrice) * 100)
      : 0;

    // Extract rating and reviews
    const rating = product.purchaseReview?.reviewAmount?.averageReviewScore || 0;
    const reviewCount = product.purchaseReview?.reviewAmount?.totalReviewCount || 0;

    // Extract delivery fee
    const deliveryFee = product.productDeliveryInfo?.deliveryFee || 0;

    // Stock status
    const stockQuantity = product.stockQuantity || 0;
    const stockStatus = stockQuantity > 0 ? 'available' : 'out of stock';

    // Build category
    const category = product.category ? {
      categoryId: product.category.categoryId || '',
      categoryName: product.category.wholeCategoryName || '',
      category1Id: product.category.category1Id,
      category2Id: product.category.category2Id,
      category3Id: product.category.category3Id,
      category4Id: product.category.category4Id,
      category1Name: product.category.category1Name,
      category2Name: product.category.category2Name,
      category3Name: product.category.category3Name,
      category4Name: product.category.category4Name,
      wholeCategoryId: product.category.wholeCategoryId,
      wholeCategoryName: product.category.wholeCategoryName,
    } : undefined;

    // Build channel info
    const channelInfo = {
      accountNo: channel.accountNo || 0,
      channelNo: channel.channelNo || '',
      channelUid: channel.channelUid || '',
      channelName: channel.channelName || '',
      representName: '',
      channelSiteUrl: channel.url || '',
      channelSiteFullUrl: channel.url || '',
      channelSiteMobileUrl: channel.url || '',
      accountId: channel.accountId || '',
    };

    return {
      id: productId,
      name: product.name || '',
      productUrl: originalUrl,
      mobileProductUrl: originalUrl.replace('smartstore.naver.com', 'm.smartstore.naver.com'),
      category,
      channel: channelInfo,
      price: {
        salePrice,
        originalPrice,
        discountRate: discountRate > 0 ? discountRate : undefined,
        currency: 'KRW',
      },
      images,
      description: product.detailInfos?.[0]?.value || '',
      options: [],  // Options need separate extraction
      deliveryFee,
      rating: rating > 0 ? rating : undefined,
      reviewCount: reviewCount > 0 ? reviewCount : undefined,
      stockStatus,
      brand: product.brandName,
      seller: {
        name: channel.channelName || '',
        url: channel.url || '',
      },
      scrapedAt: new Date(),
    };
  }

  /**
   * Extract product data from page (fallback method)
   */
  private async extractProductData(
    page: Page,
    productId: string,
    options: { extractImages?: boolean; extractOptions?: boolean }
  ): Promise<NaverProduct> {
    const data = await page.evaluate(
      ({ extractImages, extractOptions }) => {
        const result: any = {
          images: [],
          options: [],
        };

        // Product name
        const nameEl = document.querySelector('h3._22kNQuEXmb');
        result.name = nameEl?.textContent?.trim() || '';

        // Price
        const priceEl = document.querySelector('strong.bd_2jltp');
        const priceText = priceEl?.textContent?.replace(/[^0-9]/g, '') || '0';
        result.salePrice = parseInt(priceText, 10);

        // Original price (if discount)
        const originalPriceEl = document.querySelector('del._2L9V5i5Ha5');
        if (originalPriceEl) {
          const originalText = originalPriceEl.textContent?.replace(/[^0-9]/g, '') || '0';
          result.originalPrice = parseInt(originalText, 10);
        }

        // Discount rate
        const discountEl = document.querySelector('strong.yRRAAK5B_R');
        if (discountEl) {
          const discountText = discountEl.textContent?.replace(/[^0-9]/g, '') || '0';
          result.discountRate = parseInt(discountText, 10);
        }

        // Brand
        const brandEl = document.querySelector('a._22kNQuEXmb._2DzY_Y5K2p');
        result.brand = brandEl?.textContent?.trim() || '';

        // Seller info
        const sellerEl = document.querySelector('a._2L9V5i5Ha5._1gfH2O3Y_y');
        if (sellerEl) {
          result.sellerName = sellerEl.textContent?.trim() || '';
          result.sellerUrl = (sellerEl as HTMLAnchorElement).href || '';
        }

        // Review count and rating
        const reviewCountEl = document.querySelector('em._2L9V5i5Ha5._1LHJA4F7Sq');
        if (reviewCountEl) {
          result.reviewCount = parseInt(
            reviewCountEl.textContent?.replace(/[^0-9]/g, '') || '0',
            10
          );
        }

        const ratingEl = document.querySelector('span._2L9V5i5Ha5._2QdA8-z8Ss strong');
        if (ratingEl) {
          result.rating = parseFloat(ratingEl.textContent?.trim() || '0');
        }

        // Delivery fee
        const deliveryEl = document.querySelector('span._2L9V5i5Ha5._3a_r3cL6p5');
        if (deliveryEl) {
          const deliveryText = deliveryEl.textContent || '';
          if (deliveryText.includes('무료')) {
            result.deliveryFee = 0;
          } else {
            const feeMatch = deliveryText.match(/[\d,]+/);
            if (feeMatch) {
              result.deliveryFee = parseInt(feeMatch[0].replace(/,/g, ''), 10);
            }
          }
        }

        // Extract images if needed
        if (extractImages) {
          const imageElements = document.querySelectorAll('img._25CKxIKjAk');
          result.images = Array.from(imageElements).map((img: any) => ({
            url: img.src || img.dataset.src || '',
            thumbnail: img.src || '',
          }));

          // Also try product thumbnails
          const thumbElements = document.querySelectorAll('img.bd_3k6RF');
          if (thumbElements.length > 0) {
            result.images = Array.from(thumbElements).map((img: any) => ({
              url: img.src || img.dataset.src || '',
              thumbnail: img.src || '',
            }));
          }
        }

        // Extract options if needed
        if (extractOptions) {
          const optionSelects = document.querySelectorAll('select');
          result.options = Array.from(optionSelects).map((select: any) => {
            const label = select.previousElementSibling?.textContent?.trim() || 'Option';
            const options = Array.from(select.options)
              .filter((opt: any) => opt.value)
              .map((opt: any) => ({
                name: label,
                value: opt.textContent?.trim() || '',
                price: 0,
              }));
            return options;
          }).flat();
        }

        // Stock status
        const stockEl = document.querySelector('em._2L9V5i5Ha5._3iqDckB9Xy');
        result.stockStatus = stockEl?.textContent?.trim() || 'available';

        // Product description (first 500 chars)
        const descEl = document.querySelector('div._2DzY_Y5K2p.k9yS6DzHbW');
        result.description = descEl?.textContent?.trim().substring(0, 500) || '';

        return result;
      },
      { extractImages: options.extractImages, extractOptions: options.extractOptions }
    );

    // Get current URL (might have changed)
    const currentUrl = page.url();

    // Build product object
    const product: NaverProduct = {
      id: productId,
      name: data.name,
      productUrl: currentUrl,
      price: {
        salePrice: data.salePrice,
        originalPrice: data.originalPrice,
        discountRate: data.discountRate,
        currency: 'KRW',
      },
      images: data.images || [],
      description: data.description,
      options: data.options || [],
      deliveryFee: data.deliveryFee,
      rating: data.rating,
      reviewCount: data.reviewCount,
      stockStatus: data.stockStatus,
      brand: data.brand,
      seller: data.sellerName ? {
        name: data.sellerName,
        url: data.sellerUrl,
      } : undefined,
      scrapedAt: new Date(),
    };

    logger.info(`Successfully extracted product data: ${product.name}`);

    return product;
  }

  /**
   * Scrape multiple products
   */
  async scrapeProducts(
    urls: string[],
    options: NaverScraperOptions = {}
  ): Promise<NaverScraperResult[]> {
    logger.info(`Scraping ${urls.length} Naver products`);

    const results: NaverScraperResult[] = [];

    for (const url of urls) {
      const result = await this.scrapeProductWithRetry(url, options);
      results.push(result);

      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    const successful = results.filter(r => r.success).length;
    logger.info(`Completed: ${successful}/${urls.length} successful`);

    return results;
  }

  /**
   * Scrape products concurrently
   */
  async scrapeProductsConcurrent(
    urls: string[],
    options: NaverScraperOptions = {},
    concurrency: number = 3
  ): Promise<NaverScraperResult[]> {
    logger.info(`Scraping ${urls.length} Naver products (concurrency: ${concurrency})`);

    const results: NaverScraperResult[] = [];

    for (let i = 0; i < urls.length; i += concurrency) {
      const batch = urls.slice(i, i + concurrency);
      const batchResults = await Promise.all(
        batch.map(url => this.scrapeProductWithRetry(url, options))
      );
      results.push(...batchResults);

      logger.info(`Progress: ${Math.min(i + concurrency, urls.length)}/${urls.length}`);
      
      // Add delay between batches to avoid rate limiting (not on last batch)
      if (i + concurrency < urls.length) {
        const batchDelay = 5000 + Math.random() * 3000;  // 5-8 seconds between batches
        logger.debug(`Waiting ${Math.round(batchDelay)}ms before next batch...`);
        await new Promise(resolve => setTimeout(resolve, batchDelay));
      }
    }

    const successful = results.filter(r => r.success).length;
    logger.info(`Completed: ${successful}/${urls.length} successful`);

    return results;
  }
}
