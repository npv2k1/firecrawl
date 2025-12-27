# Playwright Scrape API

This is a simple web scraping service built with Express and Playwright.

## Features

- Scrapes HTML content from specified URLs.
- Blocks requests to known ad-serving domains.
- Blocks media files to reduce bandwidth usage.
- Uses random user-agent strings to avoid detection.
- Strategy to ensure the page is fully rendered.
- Support for connecting to remote browsers via WebSocket (e.g., Browserless.io).

## Install
```bash
npm install
npx playwright install
```

## RUN
```bash
npm run build
npm start
```
OR
```bash
npm run dev
```

## USE

```bash
curl -X POST http://localhost:3000/scrape \
-H "Content-Type: application/json" \
-d '{
  "url": "https://example.com",
  "wait_after_load": 1000,
  "timeout": 15000,
  "headers": {
    "Custom-Header": "value"
  },
  "check_selector": "#content"
}'
```

## USING WITH FIRECRAWL

Add `PLAYWRIGHT_MICROSERVICE_URL=http://localhost:3003/scrape` to `/apps/api/.env` to configure the API to use this Playwright microservice for scraping operations.

## CONFIGURATION

### Environment Variables

- `PORT` (default: 3003) - The port the service will run on
- `BLOCK_MEDIA` (default: False) - Block media files (images, videos) to reduce bandwidth
- `MAX_CONCURRENT_PAGES` (default: 10) - Maximum number of concurrent pages
- `PROXY_SERVER` - Proxy server URL (optional)
- `PROXY_USERNAME` - Proxy authentication username (optional)
- `PROXY_PASSWORD` - Proxy authentication password (optional)
- `BROWSER_WS_ENDPOINT` - WebSocket endpoint to connect to an existing browser (optional)

### Using WebSocket Browser Connection

Instead of launching a local browser, you can connect to a remote browser via WebSocket. This is useful for:
- Scaling with external browser pools (e.g., Browserless.io)
- Running browsers in separate containers
- Better resource management

Example with Browserless.io:
```bash
export BROWSER_WS_ENDPOINT=wss://chrome.browserless.io?token=YOUR_TOKEN
npm start
```

Example with local Browserless container:
```bash
# Start Browserless container
docker run -p 3000:3000 browserless/chrome

# Connect to it
export BROWSER_WS_ENDPOINT=ws://localhost:3000
npm start
```

When `BROWSER_WS_ENDPOINT` is not set, the service will launch a local Chromium browser (default behavior).
