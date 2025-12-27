"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const body_parser_1 = __importDefault(require("body-parser"));
const playwright_1 = require("playwright");
const dotenv_1 = __importDefault(require("dotenv"));
const user_agents_1 = __importDefault(require("user-agents"));
const get_error_1 = require("./helpers/get_error");
dotenv_1.default.config();
const app = (0, express_1.default)();
const port = process.env.PORT || 3003;
app.use(body_parser_1.default.json());
const BLOCK_MEDIA = (process.env.BLOCK_MEDIA || 'False').toUpperCase() === 'TRUE';
const MAX_CONCURRENT_PAGES = Math.max(1, Number.parseInt((_a = process.env.MAX_CONCURRENT_PAGES) !== null && _a !== void 0 ? _a : '10', 10) || 10);
const PROXY_SERVER = process.env.PROXY_SERVER || null;
const PROXY_USERNAME = process.env.PROXY_USERNAME || null;
const PROXY_PASSWORD = process.env.PROXY_PASSWORD || null;
const BROWSER_WS_ENDPOINT = process.env.BROWSER_WS_ENDPOINT || null;
class Semaphore {
    constructor(permits) {
        this.queue = [];
        this.permits = permits;
    }
    acquire() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.permits > 0) {
                this.permits--;
                return Promise.resolve();
            }
            return new Promise((resolve) => {
                this.queue.push(resolve);
            });
        });
    }
    release() {
        this.permits++;
        if (this.queue.length > 0) {
            const nextResolve = this.queue.shift();
            if (nextResolve) {
                this.permits--;
                nextResolve();
            }
        }
    }
    getAvailablePermits() {
        return this.permits;
    }
    getQueueLength() {
        return this.queue.length;
    }
}
const pageSemaphore = new Semaphore(MAX_CONCURRENT_PAGES);
const AD_SERVING_DOMAINS = [
    'doubleclick.net',
    'adservice.google.com',
    'googlesyndication.com',
    'googletagservices.com',
    'googletagmanager.com',
    'google-analytics.com',
    'adsystem.com',
    'adservice.com',
    'adnxs.com',
    'ads-twitter.com',
    'facebook.net',
    'fbcdn.net',
    'amazon-adsystem.com'
];
let browser;
const initializeBrowser = () => __awaiter(void 0, void 0, void 0, function* () {
    if (BROWSER_WS_ENDPOINT) {
        console.log(`🔌 Connecting to browser via WebSocket: ${BROWSER_WS_ENDPOINT}`);
        browser = yield playwright_1.chromium.connect(BROWSER_WS_ENDPOINT);
        console.log('✅ Successfully connected to remote browser');
    }
    else {
        console.log('🚀 Launching local browser');
        browser = yield playwright_1.chromium.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu'
            ]
        });
        console.log('✅ Local browser launched successfully');
    }
});
const createContext = (...args_1) => __awaiter(void 0, [...args_1], void 0, function* (skipTlsVerification = false) {
    const userAgent = new user_agents_1.default().toString();
    const viewport = { width: 1280, height: 800 };
    const contextOptions = {
        userAgent,
        viewport,
        ignoreHTTPSErrors: skipTlsVerification,
    };
    if (PROXY_SERVER && PROXY_USERNAME && PROXY_PASSWORD) {
        contextOptions.proxy = {
            server: PROXY_SERVER,
            username: PROXY_USERNAME,
            password: PROXY_PASSWORD,
        };
    }
    else if (PROXY_SERVER) {
        contextOptions.proxy = {
            server: PROXY_SERVER,
        };
    }
    const newContext = yield browser.newContext(contextOptions);
    if (BLOCK_MEDIA) {
        yield newContext.route('**/*.{png,jpg,jpeg,gif,svg,mp3,mp4,avi,flac,ogg,wav,webm}', (route, request) => __awaiter(void 0, void 0, void 0, function* () {
            yield route.abort();
        }));
    }
    // Intercept all requests to avoid loading ads
    yield newContext.route('**/*', (route, request) => {
        const requestUrl = new URL(request.url());
        const hostname = requestUrl.hostname;
        if (AD_SERVING_DOMAINS.some(domain => hostname.includes(domain))) {
            console.log(hostname);
            return route.abort();
        }
        return route.continue();
    });
    return newContext;
});
const shutdownBrowser = () => __awaiter(void 0, void 0, void 0, function* () {
    if (browser) {
        yield browser.close();
    }
});
const isValidUrl = (urlString) => {
    try {
        new URL(urlString);
        return true;
    }
    catch (_) {
        return false;
    }
};
const scrapePage = (page, url, waitUntil, waitAfterLoad, timeout, checkSelector) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    console.log(`Navigating to ${url} with waitUntil: ${waitUntil} and timeout: ${timeout}ms`);
    const response = yield page.goto(url, { waitUntil, timeout });
    if (waitAfterLoad > 0) {
        yield page.waitForTimeout(waitAfterLoad);
    }
    if (checkSelector) {
        try {
            yield page.waitForSelector(checkSelector, { timeout });
        }
        catch (error) {
            throw new Error('Required selector not found');
        }
    }
    let headers = null, content = yield page.content();
    let ct = undefined;
    if (response) {
        headers = yield response.allHeaders();
        ct = (_a = Object.entries(headers).find(([key]) => key.toLowerCase() === "content-type")) === null || _a === void 0 ? void 0 : _a[1];
        if (ct && (ct.toLowerCase().includes("application/json") || ct.toLowerCase().includes("text/plain"))) {
            content = (yield response.body()).toString("utf8"); // TODO: determine real encoding
        }
    }
    return {
        content,
        status: response ? response.status() : null,
        headers,
        contentType: ct,
    };
});
app.get('/health', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        if (!browser) {
            yield initializeBrowser();
        }
        const testContext = yield createContext();
        const testPage = yield testContext.newPage();
        yield testPage.close();
        yield testContext.close();
        res.status(200).json({
            status: 'healthy',
            maxConcurrentPages: MAX_CONCURRENT_PAGES,
            activePages: MAX_CONCURRENT_PAGES - pageSemaphore.getAvailablePermits()
        });
    }
    catch (error) {
        console.error('Health check failed:', error);
        res.status(503).json({
            status: 'unhealthy',
            error: error instanceof Error ? error.message : 'Unknown error occurred'
        });
    }
}));
app.post('/scrape', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { url, wait_after_load = 0, timeout = 15000, headers, check_selector, skip_tls_verification = false } = req.body;
    console.log(`================= Scrape Request =================`);
    console.log(`URL: ${url}`);
    console.log(`Wait After Load: ${wait_after_load}`);
    console.log(`Timeout: ${timeout}`);
    console.log(`Headers: ${headers ? JSON.stringify(headers) : 'None'}`);
    console.log(`Check Selector: ${check_selector ? check_selector : 'None'}`);
    console.log(`Skip TLS Verification: ${skip_tls_verification}`);
    console.log(`==================================================`);
    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }
    if (!isValidUrl(url)) {
        return res.status(400).json({ error: 'Invalid URL' });
    }
    if (!PROXY_SERVER) {
        console.warn('⚠️ WARNING: No proxy server provided. Your IP address may be blocked.');
    }
    if (!browser) {
        yield initializeBrowser();
    }
    yield pageSemaphore.acquire();
    let requestContext = null;
    let page = null;
    try {
        requestContext = yield createContext(skip_tls_verification);
        page = yield requestContext.newPage();
        if (headers) {
            yield page.setExtraHTTPHeaders(headers);
        }
        const result = yield scrapePage(page, url, 'load', wait_after_load, timeout, check_selector);
        const pageError = result.status !== 200 ? (0, get_error_1.getError)(result.status) : undefined;
        if (!pageError) {
            console.log(`✅ Scrape successful!`);
        }
        else {
            console.log(`🚨 Scrape failed with status code: ${result.status} ${pageError}`);
        }
        res.json(Object.assign({ content: result.content, pageStatusCode: result.status, contentType: result.contentType }, (pageError && { pageError })));
    }
    catch (error) {
        console.error('Scrape error:', error);
        res.status(500).json({ error: 'An error occurred while fetching the page.' });
    }
    finally {
        if (page)
            yield page.close();
        if (requestContext)
            yield requestContext.close();
        pageSemaphore.release();
    }
}));
app.listen(port, () => {
    initializeBrowser().then(() => {
        console.log(`Server is running on port ${port}`);
    });
});
if (require.main === module) {
    process.on('SIGINT', () => {
        shutdownBrowser().then(() => {
            console.log('Browser closed');
            process.exit(0);
        });
    });
}
