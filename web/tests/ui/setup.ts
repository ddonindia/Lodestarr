import puppeteer, { Browser, Page } from 'puppeteer';
import fs from 'fs';
import path from 'path';

// Read port from test server
const portFile = path.join(__dirname, '.test-port');
let testPort = '3420';
if (fs.existsSync(portFile)) {
    testPort = fs.readFileSync(portFile, 'utf8').trim();
}

// Test configuration
export const BASE_URL = process.env.BASE_URL || `http://localhost:${testPort}`;
export const HEADLESS = process.env.HEADLESS !== 'false';

let browser: Browser | null = null;
let page: Page | null = null;

/**
 * Launch browser and create a new page
 */
export async function setupBrowser(): Promise<{ browser: Browser; page: Page }> {
    const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium';

    browser = await puppeteer.launch({
        headless: HEADLESS,
        executablePath,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
        ],
        defaultViewport: {
            width: 1280,
            height: 800,
        },
    });

    page = await browser.newPage();

    // Set longer timeout for navigation
    page.setDefaultNavigationTimeout(10000);
    page.setDefaultTimeout(10000);

    return { browser, page };
}

/**
 * Close browser
 */
export async function teardownBrowser(): Promise<void> {
    if (page) {
        await page.close();
        page = null;
    }
    if (browser) {
        await browser.close();
        browser = null;
    }
}

/**
 * Navigate to the app home page
 */
export async function navigateToApp(page: Page): Promise<void> {
    await page.goto(BASE_URL, { waitUntil: 'networkidle0' });
}

/**
 * Wait for an element to be visible
 */
export async function waitForElement(page: Page, selector: string, timeout = 5000): Promise<void> {
    await page.waitForSelector(selector, { visible: true, timeout });
}

/**
 * Click an element
 */
export async function clickElement(page: Page, selector: string): Promise<void> {
    await page.waitForSelector(selector, { visible: true });
    await page.click(selector);
}

/**
 * Get text content of an element
 */
export async function getTextContent(page: Page, selector: string): Promise<string> {
    await page.waitForSelector(selector);
    const element = await page.$(selector);
    if (!element) {
        throw new Error(`Element not found: ${selector}`);
    }
    const text = await page.evaluate(el => el.textContent, element);
    return text || '';
}

/**
 * Check if an element exists
 */
export async function elementExists(page: Page, selector: string): Promise<boolean> {
    try {
        await page.waitForSelector(selector, { timeout: 2000 });
        return true;
    } catch {
        return false;
    }
}

/**
 * Take a screenshot (useful for debugging)
 */
export async function takeScreenshot(page: Page, name: string): Promise<void> {
    await page.screenshot({ path: `tests/ui/screenshots/${name}.png`, fullPage: true });
}

/**
 * Wait for a specific amount of time
 */
export async function wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}
