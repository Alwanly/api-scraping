# Naver SmartStore API Scraper

A production-ready web scraping API for Naver SmartStore products with advanced browser management, proxy rotation, and anti-detection.

## 🚀 Features

### Core Features
- ✅ **Browser Pool Management** - Auto-scaling browser instances with resource optimization
- ✅ **Profile Rotation** - Realistic browser fingerprints with multiple rotation strategies
- ✅ **Advanced Stealth** - Anti-detection techniques to avoid bot detection
- ✅ **Proxy Rotation** - Smart proxy management with health checking
- ✅ **Batch Processing** - Concurrent scraping with configurable concurrency
- ✅ **Auto Retry** - Intelligent retry logic with exponential backoff
- ✅ **Real-time Monitoring** - System statistics and health endpoints

### Anti-Detection & CAPTCHA Avoidance
- **Browser Warmup** - Visits homepage before scraping (human behavior)
- **Human-like Scrolling** - Random scrolls with variable delays
- **Mouse Movement** - Simulates cursor movements
- **Random Timing** - Variable delays between actions
- **Browser Fingerprint Rotation** - Unique profiles per browser
- **Enhanced Stealth** - 10+ anti-detection techniques
- **Korean Language Headers** - Optimized for Naver
- **CAPTCHA Detection** - Early detection with auto-retry
- **Proxy Rotation** - IP diversity with health checking

**📖 See [CAPTCHA_QUICK_REFERENCE.md](CAPTCHA_QUICK_REFERENCE.md) for CAPTCHA avoidance guide**

## 📋 Requirements

- Node.js 18+
- pnpm (or npm/yarn)
- Optional: Proxy list for IP rotation
- Optional: Browserless.io account for cloud browsers

## 🛠️ Installation

### 1. Clone and Install

```bash
git clone <your-repo-url>
cd api-scrapping
pnpm install
```

### 2. Install Playwright Browsers

```bash
npx playwright install chromium
```

### 3. Configure Environment

```bash
cp .env.example .env
```

Edit `.env`:
```env
PORT=3000
MAX_BROWSERS=3
HEADLESS=true
USE_PROXY=false
```

### 4. (Optional) Setup Proxies

Create `data/proxies.txt`:
```
192.168.1.1:8080
username:password@192.168.1.2:8080
http://proxy.com:3128
```

Enable in `.env`:
```env
USE_PROXY=true
```

## 🏃 Running the API

### Development Mode

```bash
pnpm dev
```

### Build and Run Production

```bash
pnpm build
pnpm start
```

The API will be available at `http://localhost:3000`

## 📡 API Endpoints

### 1. Health Check

```bash
GET /health
```

Check API status and uptime.

### 2. Scrape Single Product

```bash
GET /naver?productUrl={url}
```

**Example:**
```bash
curl "http://localhost:3000/naver?productUrl=https://smartstore.naver.com/ezbuy/products/5836562085"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "5836562085",
    "name": "남성 경량 패딩조끼",
    "price": {
      "salePrice": 25900,
      "originalPrice": 35900,
      "discountRate": 28,
      "currency": "KRW"
    },
    "images": [...],
    "brand": "이지바이",
    "rating": 4.8,
    "reviewCount": 1234,
    ...
  },
  "metadata": {
    "duration": 3456,
    "retries": 0
  }
}
```
### 4. System Statistics

```bash
GET /stats
```

Get browser pool and proxy statistics.

**Response:**
```json
{
  "browserPool": {
    "totalBrowsers": 3,
    "activeBrowsers": 2,
    "totalPages": 5
  },
  "proxyManager": {
    "total": 10,
    "healthy": 8,
    "averageLatency": 450
  },
  "uptime": 3600.5
}
```


## 👨‍💻 Author

Built for Naver SmartStore scraping challenge.