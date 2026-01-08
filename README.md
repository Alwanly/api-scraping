# Naver SmartStore API Scraper

A scalable, undetectable web scraping API for Naver SmartStore product data. Built with TypeScript, Playwright, and advanced anti-detection techniques.

## 🚀 Features

- **Anti-Detection**: Browser fingerprint rotation, realistic headers, random delays
- **Proxy Support**: Rotating proxies with Korean IP targeting
- **Rate Limiting**: Configurable request throttling to avoid detection
- **Caching**: Redis-based caching to reduce redundant requests
- **Monitoring**: Real-time metrics, health checks, and performance tracking
- **Error Handling**: Exponential backoff retry logic with jitter
- **Scalable**: Handles 1000+ products with <6s average latency

## 📋 Requirements

- Node.js 16+
- Redis server
- pnpm (or npm/yarn)
- self-host

## 🛠️ Installation

### 1. Clone the repository

```bash
git clone <your-repo-url>
cd api-scrapping
```

### 2. Install dependencies

```bash
pnpm install
```

### 3. Install Playwright browsers

```bash
pnpm exec playwright install chromium
```

### 4. Set up Redis

**Option A: Using Docker**
```bash
docker run -d -p 6379:6379 redis:alpine
```

**Option B: Local installation**
- Windows: Download from https://github.com/microsoftarchive/redis/releases
- Mac: `brew install redis && brew services start redis`
- Linux: `sudo apt-get install redis-server && sudo service redis-server start`

### 5. Configure environment variables

Create a `.env` file in the root directory:

```env
# Server Configuration
PORT=3000
NODE_ENV=production

# Redis Configuration
REDIS_URL=redis://localhost:6379

# Proxy Configuration (Primary)
PROXY_STRING=

# Additional Proxies (optional, comma-separated)
# ADDITIONAL_PROXIES=proxy1.com:8080:user:pass,proxy2.com:8080:user:pass

# Rate Limiting
MAX_CONCURRENT=3
MIN_TIME=500

# Caching
CACHE_TTL_SECONDS=3600

# Browserless Configuration
BROWSERLESS_ENABLED=true
BROWSERLESS_URL=ws://localhost:3301
```

## 🏃 Running the API

### Development Mode

```bash
pnpm dev
```

### Production Mode

```bash
pnpm build
pnpm start
```

The API will be available at `http://localhost:3000`

## 📡 API Endpoints

### 1. Scrape Product Data

**Endpoint:** `GET /naver`

**Query Parameters:**
- `productUrl` (required): Full Naver SmartStore product URL

**Example Request:**
```bash
curl "http://localhost:3000/naver?productUrl=https://smartstore.naver.com/rainbows9030/products/11102379008"
```

**Example Response:**
```json
{
  "productDetail": {
    "id": "11102379008",
    "name": "Product Name",
    "category": {...},
    "channel": {...},
    ...
  },
  "benefits": {
    "benefitList": [...],
    ...
  },
  "metadata": {
    "scrapedAt": "2026-01-04T12:00:00.000Z",
    "latency": 4523,
    "cached": false
  }
}
```

### 2. Health Check

**Endpoint:** `GET /health`

**Example Response:**
```json
{
  "status": "ok",
  "uptime": 3600,
  "timestamp": "2026-01-04T12:00:00.000Z",
  "metrics": {
    "totalRequests": 150,
    "totalErrors": 3,
    "errorRate": 2.0,
    "averageLatency": 4234
  }
}
```

### 3. Metrics

**Endpoint:** `GET /metrics`

**Example Response:**
```json
{
  "totalRequests": 150,
  "totalErrors": 3,
  "errorRate": 2.0,
  "averageLatency": 4234
}
```

### 4. Reset Metrics

**Endpoint:** `POST /metrics/reset`

## 🕵️ Anti-Detection Strategies

### 1. Browser Fingerprinting
- **Rotating User Agents**: 5+ realistic Chrome/Firefox/Safari user agents
- **Random Viewports**: Common resolutions (1920x1080, 1366x768, etc.)
- **Korean Locale**: `ko-KR` locale and `Asia/Seoul` timezone
- **Realistic Headers**: Accept-Language, Referer, Origin headers

### 2. Proxy Rotation
- **Primary Proxy**: Korean residential proxies via Thordata
- **Fallback Support**: Multiple proxy rotation for redundancy
- **Health Checks**: Automatic proxy switching on failures

### 3. Request Patterns
- **Random Delays**: 1-3 seconds between requests with jitter
- **Rate Limiting**: Max 60 requests per minute via Bottleneck
- **Exponential Backoff**: Smart retry logic with increasing delays

### 4. Stealth Techniques
- **navigator.webdriver**: Overridden to `undefined`
- **Chrome Runtime**: Mocked for authenticity
- **Permissions API**: Realistic permission responses
- **Network Idle**: Waits for all network requests to complete

### 5. Caching Strategy
- **Redis Cache**: 1-hour TTL to reduce repeat requests
- **Cache Key**: Unique per product ID
- **Cache Metadata**: Tracks if response is cached

## 🔧 Configuration Options

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3000 | Server port |
| `REDIS_URL` | redis://localhost:6379 | Redis connection string |
| `PROXY_STRING` | (provided) | Primary proxy (host:port:user:pass) |
| `ADDITIONAL_PROXIES` | - | Comma-separated additional proxies |
| `MAX_CONCURRENT` | 3 | Max concurrent requests |
| `MIN_TIME` | 500 | Minimum time (ms) between requests |
| `CACHE_TTL_SECONDS` | 3600 | Cache TTL in seconds | 
| `BROWSERLESS_ENABLED`|true | Using browserless external |
| `BROWSERLESS_URL` | ws://localhost:3301| Browserless connection string

### Adjusting Rate Limits

To handle higher throughput, adjust these variables:

```env
MAX_CONCURRENT=5          # More concurrent requests
MIN_TIME=300              # Shorter delay between requests
CACHE_TTL_SECONDS=7200    # Longer cache duration
```

⚠️ **Warning**: Higher values may increase detection risk.

## 🏗️ Architecture

```
┌─────────────┐
│   Client    │
└──────┬──────┘
       │
       ▼
┌─────────────────────┐
│   Express Server    │
│  (server.ts)        │
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│  Fetcher Service    │
│  - Rate Limiting    │
│  - Caching          │
│  - Retry Logic      │
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│  Playwright Scraper │
│  - Anti-Detection   │
│  - Proxy Rotation   │
│  - API Interception │
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│  Naver SmartStore   │
│  - Product API      │
│  - Benefits API     │
└─────────────────────┘
```

## 🐛 Troubleshooting

### Redis Connection Error

**Error**: `ECONNREFUSED 127.0.0.1:6379`

**Solution**: Ensure Redis is running
```bash
# Check if Redis is running
redis-cli ping
# Should return: PONG

# If not running, start it
# Docker: docker start <container-id>
# Mac: brew services start redis
# Linux: sudo service redis-server start
```

### Playwright Browser Not Found

**Error**: `browserType.launch: Executable doesn't exist`

**Solution**: Install Playwright browsers
```bash
pnpm exec playwright install chromium
```
## 📝 Code Structure

```
api-scrapping/
├── src/
│   ├── server.ts              # Express server & endpoints
│   ├── lib/
│   │   ├── logger.ts          # Pino logger
│   │   ├── parseURL.ts        # URL parser
│   │   ├── fingerprints.ts    # Browser fingerprint generation
│   │   └── proxyManager.ts    # Proxy rotation logic
│   ├── services/
│   │   ├── fetcherNew.ts      # Main fetcher with caching
│   │   └── scraper.ts         # Playwright scraper
│   └── types/
│       └── index.ts           # TypeScript interfaces
├── .env                       # Environment variables
├── package.json
├── tsconfig.json
└── README.md
```

## 🔐 Security Notes

- Never commit `.env` file to version control
- Rotate proxy credentials regularly
- Use HTTPS in production
- Implement rate limiting per IP in production
- Monitor for unusual patterns

## 👨‍💻 Author

Built for Naver SmartStore scraping challenge.

## 🆘 Support

For issues or questions:
1. Check logs in console
2. Verify Redis connection
3. Test proxy connectivity
4. Review metrics endpoint

---
