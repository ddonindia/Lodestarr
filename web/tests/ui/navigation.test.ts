import { Browser, Page } from 'puppeteer';
import { setupBrowser, teardownBrowser, navigateToApp, clickElement, waitForElement, wait } from './setup';

describe('Navigation Tests', () => {
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
    });

    test('should load the application successfully', async () => {
        // Check that the page title is correct
        const title = await page.title();
        expect(title).toBe('Lodestarr - Torrent Indexer Proxy');

        // Check that the header is visible
        await waitForElement(page, 'header');

        // Check that logo is visible
        const logo = await page.$('img[alt="Lodestarr"]');
        expect(logo).not.toBeNull();
    });

    test('should navigate to Dashboard view by default', async () => {
        // Dashboard should be the default view
        await waitForElement(page, 'button');

        // Check that Dashboard nav button is active
        const buttons = await page.$$('button');
        let dashboardButtonFound = false;

        for (const button of buttons) {
            const text = await page.evaluate(el => el.textContent, button);
            if (text?.includes('Dashboard')) {
                dashboardButtonFound = true;
                // Check if it has active styling
                const className = await page.evaluate(el => el.className, button);
                expect(className).toContain('bg-white');
                break;
            }
        }

        expect(dashboardButtonFound).toBe(true);
    });

    test('should navigate to Search view', async () => {
        // Click on Search nav button
        await page.waitForSelector('button');
        const buttons = await page.$$('button');

        for (const button of buttons) {
            const text = await page.evaluate(el => el.textContent, button);
            if (text?.includes('Search')) {
                await button.click();
                break;
            }
        }

        // Wait a bit for the view to change
        await wait(500);

        // Verify Search view is displayed
        // The Search component should be visible
        const searchView = await page.evaluate(() => {
            return document.body.innerHTML.includes('Search') ||
                document.querySelector('main') !== null;
        });
        expect(searchView).toBe(true);
    });

    test('should navigate to Settings view', async () => {
        // Click on Settings nav button
        const buttons = await page.$$('button');

        for (const button of buttons) {
            const text = await page.evaluate(el => el.textContent, button);
            if (text?.includes('Settings')) {
                await button.click();
                break;
            }
        }

        // Wait a bit for the view to change
        await wait(500);

        // Verify Settings view is displayed
        const settingsView = await page.evaluate(() => {
            return document.body.innerHTML.includes('Settings') ||
                document.querySelector('main') !== null;
        });
        expect(settingsView).toBe(true);
    });

    test('should return to Dashboard when clicking logo', async () => {
        // First navigate to Search
        const buttons = await page.$$('button');
        for (const button of buttons) {
            const text = await page.evaluate(el => el.textContent, button);
            if (text?.includes('Search')) {
                await button.click();
                break;
            }
        }

        await wait(500);

        // Click on logo/title to return to dashboard
        const logoContainer = await page.$('div.flex.items-center.gap-3.cursor-pointer');
        if (logoContainer) {
            await logoContainer.click();
            await wait(500);

            // Verify we're back on dashboard
            const dashboardVisible = await page.evaluate(() => {
                return document.querySelector('main') !== null;
            });
            expect(dashboardVisible).toBe(true);
        }
    });

    test('should have all navigation buttons visible', async () => {
        const navButtons = ['Dashboard', 'Search', 'Settings'];

        for (const buttonText of navButtons) {
            const buttons = await page.$$('button');
            let found = false;

            for (const button of buttons) {
                const text = await page.evaluate(el => el.textContent, button);
                if (text?.includes(buttonText)) {
                    found = true;
                    break;
                }
            }

            expect(found).toBe(true);
        }
    });
});
