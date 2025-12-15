import { Browser, Page } from 'puppeteer';
import { setupBrowser, teardownBrowser, navigateToApp, wait } from './setup';
import * as path from 'path';

describe('Demo Screenshots', () => {
    let browser: Browser;
    let page: Page;

    const screenshotDir = path.join(__dirname, 'screenshots');

    beforeAll(async () => {
        const setup = await setupBrowser();
        browser = setup.browser;
        page = setup.page;
    });

    afterAll(async () => {
        await teardownBrowser();
    });

    test('capture comprehensive application screenshots', async () => {
        // 1. Dashboard view
        await navigateToApp(page);
        await wait(1000);
        await page.screenshot({
            path: path.join(screenshotDir, '01-dashboard.png'),
            fullPage: true
        });

        // 2. Navigate to Search view
        const buttons = await page.$$('button');
        for (const button of buttons) {
            const text = await page.evaluate(el => el.textContent, button);
            if (text?.includes('Search')) {
                await button.click();
                break;
            }
        }
        await wait(1000);
        await page.screenshot({
            path: path.join(screenshotDir, '02-search-view.png'),
            fullPage: true
        });

        // 3. Navigate to Settings view
        const settingsButtons = await page.$$('button');
        for (const button of settingsButtons) {
            const text = await page.evaluate(el => el.textContent, button);
            if (text?.includes('Settings')) {
                await button.click();
                break;
            }
        }
        await wait(1000);
        await page.screenshot({
            path: path.join(screenshotDir, '03-settings-view.png'),
            fullPage: true
        });

        // 4. Fill in the Add Indexer form (but don't submit)
        const nameInput = await page.$('input[placeholder*="YTS"]');
        if (nameInput) {
            await nameInput.click();
            await nameInput.type('Demo Indexer');
        }

        const urlInputs = await page.$$('input');
        for (const input of urlInputs) {
            const placeholder = await page.evaluate(el => el.placeholder, input);
            if (placeholder?.includes('http')) {
                await input.click();
                await input.type('http://example.com/api/v2.0/indexers/demo/results/torznab/');
                break;
            }
        }

        const apikeyInput = await page.$('input[type="password"]');
        if (apikeyInput) {
            await apikeyInput.click();
            await apikeyInput.type('example-api-key-12345');
        }

        await wait(500);
        await page.screenshot({
            path: path.join(screenshotDir, '04-add-indexer-form.png'),
            fullPage: true
        });

        // 5. Theme toggle - switch to light mode
        // First go to Dashboard for cleaner screenshot
        const dashboardButtons = await page.$$('button');
        for (const button of dashboardButtons) {
            const text = await page.evaluate(el => el.textContent, button);
            if (text?.includes('Dashboard')) {
                await button.click();
                break;
            }
        }
        await wait(500);

        const themeButton = await page.$('button[title*="mode"]');
        if (themeButton) {
            await themeButton.click();
            await wait(1000); // Wait longer for theme to apply

            // Verify theme changed
            const isDark = await page.evaluate(() => {
                return document.documentElement.classList.contains('dark');
            });
            console.log(`Theme after toggle - Is Dark: ${isDark}`);

            await page.screenshot({
                path: path.join(screenshotDir, '05-light-theme.png'),
                fullPage: true
            });

            // Switch back to dark
            await themeButton.click();
            await wait(1000);
        }

        // 6. Navigate back to Dashboard
        const logoContainer = await page.$('div.flex.items-center.gap-3.cursor-pointer');
        if (logoContainer) {
            await logoContainer.click();
            await wait(500);
            await page.screenshot({
                path: path.join(screenshotDir, '06-dashboard-dark.png'),
                fullPage: true
            });
        }

        // 7. Responsive view - tablet size
        await page.setViewport({ width: 768, height: 1024 });
        await wait(500);
        await page.screenshot({
            path: path.join(screenshotDir, '07-tablet-view.png'),
            fullPage: true
        });

        // 8. Responsive view - mobile size
        await page.setViewport({ width: 375, height: 667 });
        await wait(500);
        await page.screenshot({
            path: path.join(screenshotDir, '08-mobile-view.png'),
            fullPage: true
        });

        // Reset viewport
        await page.setViewport({ width: 1280, height: 800 });

        console.log(`\n📸 Screenshots saved to: ${screenshotDir}\n`);
    });
});
