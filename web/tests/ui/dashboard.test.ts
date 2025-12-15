import { Browser, Page } from 'puppeteer';
import { setupBrowser, teardownBrowser, navigateToApp, waitForElement, wait } from './setup';

describe('Dashboard Tests', () => {
    let browser: Browser;
    let page: Page;

    beforeAll(async () => {
        const setup = await setupBrowser();
        browser = setup.browser;
        page = setup.page;
    });

    afterAll(async () => {
        await teardownBrowser();
    });

    beforeEach(async () => {
        await navigateToApp(page);
        // Ensure we're on dashboard
        const buttons = await page.$$('button');
        for (const button of buttons) {
            const text = await page.evaluate(el => el.textContent, button);
            if (text?.includes('Dashboard')) {
                await button.click();
                break;
            }
        }
        await wait(500);
    });

    test('should display dashboard on initial load', async () => {
        // Dashboard should be visible
        const main = await page.$('main');
        expect(main).not.toBeNull();

        // Check for common dashboard elements
        const hasDashboardContent = await page.evaluate(() => {
            return document.querySelector('main') !== null;
        });
        expect(hasDashboardContent).toBe(true);
    });

    test('should have main content area', async () => {
        // Check that main element exists
        const main = await page.$('main');
        expect(main).not.toBeNull();

        // Check that main has proper styling
        if (main) {
            const className = await page.evaluate(el => el.className, main);
            expect(className).toContain('py-8');
        }
    });

    test('should be responsive', async () => {
        // Test different viewport sizes
        const viewports = [
            { width: 1920, height: 1080 }, // Desktop
            { width: 768, height: 1024 },  // Tablet
            { width: 375, height: 667 },   // Mobile
        ];

        for (const viewport of viewports) {
            await page.setViewport(viewport);
            await wait(300);

            // Check that page still loads properly
            const main = await page.$('main');
            expect(main).not.toBeNull();

            // Check that header is still visible
            const header = await page.$('header');
            expect(header).not.toBeNull();
        }

        // Reset to default viewport
        await page.setViewport({ width: 1280, height: 800 });
    });

    test('should have sticky header', async () => {
        const header = await page.$('header');
        expect(header).not.toBeNull();

        if (header) {
            const className = await page.evaluate(el => el.className, header);
            expect(className).toContain('sticky');
            expect(className).toContain('top-0');
        }
    });

    test('should display logo and title in header', async () => {
        // Check for logo image
        const logo = await page.$('img[alt="Lodestarr"]');
        expect(logo).not.toBeNull();

        // Check for title
        const title = await page.evaluate(() => {
            const h1 = document.querySelector('h1');
            return h1?.textContent;
        });
        expect(title).toContain('Lodestarr');
    });

    test('should have proper layout structure', async () => {
        // Check for main structural elements
        const header = await page.$('header');
        const main = await page.$('main');

        expect(header).not.toBeNull();
        expect(main).not.toBeNull();

        // Check that header comes before main
        const order = await page.evaluate(() => {
            const header = document.querySelector('header');
            const main = document.querySelector('main');
            if (!header || !main) return false;

            return header.compareDocumentPosition(main) === Node.DOCUMENT_POSITION_FOLLOWING;
        });
        expect(order).toBe(true);
    });

    test('should have max-width container in header', async () => {
        const container = await page.$('header > div');
        expect(container).not.toBeNull();

        if (container) {
            const className = await page.evaluate(el => el.className, container);
            expect(className).toContain('max-w-7xl');
            expect(className).toContain('mx-auto');
        }
    });

    test('should load without console errors', async () => {
        const errors: string[] = [];

        page.on('console', (msg) => {
            if (msg.type() === 'error') {
                errors.push(msg.text());
            }
        });

        await page.reload({ waitUntil: 'networkidle0' });

        // Filter out known browser extension errors or irrelevant errors
        const relevantErrors = errors.filter(err =>
            !err.includes('Extension') &&
            !err.includes('chrome-extension')
        );

        expect(relevantErrors.length).toBe(0);
    });
});
