import { Browser, Page } from 'puppeteer';
import { setupBrowser, teardownBrowser, navigateToApp, wait } from './setup';

describe('Theme Toggle Tests', () => {
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

    test('should start with dark theme by default', async () => {
        // Check that html element has dark class
        const htmlClass = await page.evaluate(() => {
            return document.documentElement.className;
        });
        expect(htmlClass).toContain('dark');
    });

    test('should toggle theme when clicking theme button', async () => {
        // Get initial theme
        const initialTheme = await page.evaluate(() => {
            return document.documentElement.className.includes('dark') ? 'dark' : 'light';
        });

        // Find and click the theme toggle button
        // The button has a Sun or Moon icon
        const themeButton = await page.$('button[title*="mode"]');
        expect(themeButton).not.toBeNull();

        if (themeButton) {
            await themeButton.click();
            await wait(300); // Wait for theme transition

            // Check that theme has changed
            const newTheme = await page.evaluate(() => {
                return document.documentElement.className.includes('dark') ? 'dark' : 'light';
            });

            expect(newTheme).not.toBe(initialTheme);
        }
    });

    test('should show correct icon for current theme', async () => {
        // In dark mode, should show Sun icon (to switch to light)
        const isDark = await page.evaluate(() => {
            return document.documentElement.className.includes('dark');
        });

        // Check for Sun or Moon icon based on theme
        if (isDark) {
            // Should show Sun icon in dark mode
            const sunIcon = await page.$('svg.lucide-sun');
            expect(sunIcon).not.toBeNull();
        } else {
            // Should show Moon icon in light mode
            const moonIcon = await page.$('svg.lucide-moon');
            expect(moonIcon).not.toBeNull();
        }
    });

    test('should persist theme preference', async () => {
        // Toggle theme
        const themeButton = await page.$('button[title*="mode"]');
        if (themeButton) {
            await themeButton.click();
            await wait(300);

            // Get current theme
            const theme = await page.evaluate(() => {
                return document.documentElement.className.includes('dark') ? 'dark' : 'light';
            });

            // Reload page
            await page.reload({ waitUntil: 'networkidle0' });

            // Check that theme persisted
            const persistedTheme = await page.evaluate(() => {
                return document.documentElement.className.includes('dark') ? 'dark' : 'light';
            });

            expect(persistedTheme).toBe(theme);
        }
    });

    test('should apply theme classes to body background', async () => {
        // Check that the main container has appropriate theme classes
        const mainContainer = await page.$('div.min-h-screen');
        expect(mainContainer).not.toBeNull();

        if (mainContainer) {
            const className = await page.evaluate(el => el.className, mainContainer);

            // Should have both light and dark mode classes
            expect(className).toContain('bg-neutral-50');
            expect(className).toContain('dark:bg-neutral-900');
        }
    });

    test('should update header styling when theme changes', async () => {
        // Get initial theme state
        const initialDark = await page.evaluate(() => {
            return document.documentElement.className.includes('dark');
        });

        // Get header element
        const header = await page.$('header');
        expect(header).not.toBeNull();

        if (header) {
            // Toggle theme
            const themeButton = await page.$('button[title*="mode"]');
            if (themeButton) {
                await themeButton.click();
                await wait(300);

                // Check that theme state changed
                const newDark = await page.evaluate(() => {
                    return document.documentElement.className.includes('dark');
                });
                expect(newDark).not.toBe(initialDark);

                // Verify header still exists and has proper classes
                const headerClasses = await page.evaluate(el => el.className, header);
                expect(headerClasses).toContain('bg-white');
                expect(headerClasses).toContain('dark:bg-neutral-800');
            }
        }
    });
});
