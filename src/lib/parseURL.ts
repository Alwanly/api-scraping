export function parseSmartStoreUrl(urlStr: string) {
  try {
    const url = new URL(urlStr);
    const parts = url.pathname.split("/").filter(Boolean);
    // path: /{store_name}/products/{product_id}
    const storeName = parts[0] || null;
    const productId = parts[2] || null;
    return { storeName, productId };
  } catch {
    return null;
  }
}