import { Scraper } from "../lib/scraper";
import { logger } from "../lib/logger";
import { randomDelay } from "../lib/fingerprints";
import * as path from "path";

/**
 * NaverScraper - Naver SmartStore specific scraper
 */
export class NaverScraper extends Scraper {
  /**
   * Extract channelUid from the product page
   */

  static folderLogScreenshots = path.join(__dirname, "../../logs/screenshots");

  private async extractProductMetadata(url: string): Promise<any | null> {
    const page = await this.createPage();

    try {
      logger.info(`Navigating to: ${url}`);

      // Create captcha detection promise that rejects early
      let captchaReject: ((reason: Error) => void) | null = null;
      const captchaPromise = new Promise<never>((_, reject) => {
        captchaReject = reject;
      });

      const captchaListener = (response: any) => {
        const status = response.status();
        const url = response.url();

        //
        if (url.includes(url) && status === 429) {
          logger.warn(`Rate limit detected (429) on URL: ${url}`);
          if (captchaReject) {
            captchaReject(new Error("429"));
          }
        }
        // Detect captcha
        if (url.includes("ncpt.naver.com") || url.includes("/captcha")) {
          logger.warn(`Captcha detected: ${url}`);
          if (captchaReject) {
            captchaReject(new Error("captcha"));
          }
        }

        // Detect 490 on critical APIs
        if (
          status === 490 &&
          (url.includes("/i/v2/channels/") ||
            url.includes("/benefits/by-product") ||
            url.includes("ambulance/pages"))
        ) {
          logger.warn(`Bot detected (490) on critical API: ${url}`);
          if (captchaReject) {
            captchaReject(new Error("490"));
          }
        }
      };

      page.on("response", captchaListener);

      // Add random mouse movements for human-like behavior
      const addHumanBehavior = async () => {
        await randomDelay(500, 1500);
        // Random mouse movement
        await page.mouse.move(
          Math.floor(Math.random() * 800) + 100,
          Math.floor(Math.random() * 600) + 100
        );
        await randomDelay(200, 800);
      };

      // Race between captcha detection and API responses
      const [productDetailResponse, benefitsResponse] = await Promise.race([
        captchaPromise,
        Promise.all([
          page.waitForResponse(
            (response) =>
              response.url().includes("/i/v2/channels/") &&
              response.status() === 200,
            { timeout: 60000 },
          ),
          page.waitForResponse(
            (response) =>
              response.url().includes("/benefits/by-product") &&
              response.status() === 200,
            { timeout: 60000 },
          ),
          (async () => {
            await addHumanBehavior();
            return page.goto(url, {
              waitUntil: "domcontentloaded",
              timeout: 45000 * 2,
            });
          })(),
        ]),
      ]);

      // Remove listener to prevent memory leak
      page.off("response", captchaListener);

      // Validate response status
      if (productDetailResponse.status() !== 200) {
        throw new Error(
          `Product detail API returned status ${productDetailResponse.status()}`,
        );
      }
      if (benefitsResponse.status() !== 200) {
        throw new Error(
          `Benefits API returned status ${benefitsResponse.status()}`,
        );
      }

      // Introduce random delays to mimic human behavior
      await randomDelay(10000, 30000);
      await this.autoScroll(page);
      await randomDelay(5000, 15000);

      // Parse both API responses
      const [productDetail, benefits] = await Promise.all([
        productDetailResponse.json(),
        benefitsResponse.json(),
      ]);

      // Validate both responses
      if (!productDetail || Object.keys(productDetail).length === 0) {
        throw new Error("Product detail data is empty");
      }

      if (!benefits || Object.keys(benefits).length === 0) {
        throw new Error("Benefits data is empty");
      }

      logger.info(`Successfully extracted product data from: ${url}`);
      return { productDetail, benefits };
    } catch (error) {
      logger.error(`Failed to extract product metadata: ${error}`);
      await page
        .waitForLoadState("networkidle", { timeout: 10000 })
        .catch(() => {});
      await page.screenshot({
        fullPage: true,
        path: path.join(
          NaverScraper.folderLogScreenshots,
          `error_screenshot_naver_${Date.now()}.png`,
        ),
      });
      throw error; // Re-throw to trigger retry logic
    } finally {
      try {
        await page.close();
      } catch (closeError) {
        logger.error(`Error closing page: ${closeError}`);
      }
    }
  }

  /**
   * Scrape product data by intercepting API responses
   */
  async scrapeProductData(
    url: string,
  ): Promise<{ productDetail: any; benefits: any }> {
    return await this.extractProductMetadata(url);
  }
}
