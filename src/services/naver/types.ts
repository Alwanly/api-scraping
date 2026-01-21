export interface NaverProductCategory {
  categoryId: string;
  categoryName: string;
  category1Id?: string;
  category2Id?: string;
  category3Id?: string;
  category4Id?: string;
  category1Name?: string;
  category2Name?: string;
  category3Name?: string;
  category4Name?: string;
  wholeCategoryId?: string;
  wholeCategoryName?: string;
}

export interface NaverChannel {
  accountNo: number;
  channelNo: string;
  channelUid: string;
  channelName: string;
  representName: string;
  channelSiteUrl: string;
  channelSiteFullUrl: string;
  channelSiteMobileUrl: string;
  accountId: string;
}

export interface NaverProductImage {
  url: string;
  thumbnail?: string;
}

export interface NaverProductPrice {
  salePrice: number;
  discountRate?: number;
  originalPrice?: number;
  currency?: string;
}

export interface NaverProductOption {
  name: string;
  value: string;
  price?: number;
}

export interface NaverProduct {
  id: string;
  name: string;
  productUrl: string;
  mobileProductUrl?: string;
  category?: NaverProductCategory;
  channel?: NaverChannel;
  price: NaverProductPrice;
  images: NaverProductImage[];
  description?: string;
  options?: NaverProductOption[];
  deliveryFee?: number;
  rating?: number;
  reviewCount?: number;
  stockStatus?: string;
  brand?: string;
  seller?: {
    name: string;
    url: string;
  };
  scrapedAt: Date;
}

export interface NaverScraperOptions {
  waitForSelector?: string;
  timeout?: number;
  extractImages?: boolean;
  extractOptions?: boolean;
  extractReviews?: boolean;
  useApi?: boolean;  // Use API endpoint instead of HTML scraping (faster, no CAPTCHA)
}

export interface NaverUrlParsed {
  storeName: string;
  productId: string;
  fullUrl: string;
  isValid: boolean;
}

export interface NaverScraperResult {
  success: boolean;
  data?: NaverProduct;
  error?: string;
  retries?: number;
  duration?: number;
}

export interface NaverApiResponse {
  product?: {
    A?: string;  // Product ID
    productNo?: number;
    channelProductNo?: string;
    name?: string;
    detailInfos?: any[];
    images?: Array<{
      url?: string;
      representativeImageUrl?: string;
    }>;
    category?: {
      categoryId?: string;
      wholeCategoryId?: string;
      wholeCategoryName?: string;
      category1Id?: string;
      category2Id?: string;
      category3Id?: string;
      category4Id?: string;
      category1Name?: string;
      category2Name?: string;
      category3Name?: string;
      category4Name?: string;
    };
    salePrice?: number;
    discountedSalePrice?: number;
    saleAmount?: number;
    productDeliveryInfo?: {
      deliveryFee?: number;
      deliveryFeeType?: string;
    };
    stockQuantity?: number;
    productInfoProvidedNotice?: any;
    purchaseReview?: {
      purchaseReviewExposureCount?: number;
      reviewAmount?: {
        averageReviewScore?: number;
        totalReviewCount?: number;
      };
    };
    brandName?: string;
  };
  channel?: {
    channelNo?: string;
    accountNo?: number;
    channelUid?: string;
    channelName?: string;
    accountId?: string;
    url?: string;
  };
}
