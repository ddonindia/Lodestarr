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

    test('should toggle color mode when clicking theme button', async () => {
        // Get initial theme
        const initialTheme = await page.evaluate(() => {
            return document.documentElement.className.includes('dark') ? 'dark' : 'light';
        });

        // Find and click the theme toggle button (now cycles through dark -> light -> auto)
        // Find and click the theme toggle button (now cycles through dark -> light -> auto)
        const themeButton = await page.waitForSelector('button[title*="mode"]', { timeout: 2000 });
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

    test('should show correct icon for current color mode', async () => {
        // In dark mode, should show Sun icon (to switch to light)
        const isDark = await page.evaluate(() => {
            return document.documentElement.className.includes('dark');
        });

        // Check for Sun or Moon icon based on theme
        if (isDark) {
            // Should show Moon icon in dark mode (current state)
            const moonIcon = await page.$('svg.lucide-moon');
            expect(moonIcon).not.toBeNull();
        } else {
            // Should show Sun icon in light mode (current state)
            const sunIcon = await page.$('svg.lucide-sun');
            expect(sunIcon).not.toBeNull();
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

    test('should apply CSS variables for theming', async () => {
        // Check that the root element has CSS variables set
        const cssVars = await page.evaluate(() => {
            const root = document.documentElement;
            const styles = getComputedStyle(root);
            return {
                themeBg: styles.getPropertyValue('--theme-bg').trim(),
                themeCard: styles.getPropertyValue('--theme-card').trim(),
                themeBorder: styles.getPropertyValue('--theme-border').trim(),
                themeAccent: styles.getPropertyValue('--theme-accent').trim(),
            };
        });

        // CSS variables should be set (not empty)
        expect(cssVars.themeBg).not.toBe('');
        expect(cssVars.themeCard).not.toBe('');
        expect(cssVars.themeBorder).not.toBe('');
        expect(cssVars.themeAccent).not.toBe('');
    });

    test('should have main container with theme background', async () => {
        // Check that the main container exists and has styling
        const mainContainer = await page.$('div.min-h-screen');
        expect(mainContainer).not.toBeNull();

        if (mainContainer) {
            // Check that it has inline style with CSS variable
            const style = await page.evaluate(el => el.getAttribute('style'), mainContainer);
            expect(style).toContain('--theme-bg');
        }
    });

    test('should update CSS variables when theme changes', async () => {
        // Get initial theme bg
        const initialBg = await page.evaluate(() => {
            return getComputedStyle(document.documentElement).getPropertyValue('--theme-bg').trim();
        });

        // Toggle theme
        const themeButton = await page.$('button[title*="mode"]');
        if (themeButton) {
            await themeButton.click();
            await wait(300);

            // Check that CSS variable has changed (different value for light vs dark)
            const newBg = await page.evaluate(() => {
                return getComputedStyle(document.documentElement).getPropertyValue('--theme-bg').trim();
            });

            expect(newBg).not.toBe(initialBg);
        }
    });

    test('should have header element with theme styling', async () => {
        // Get header element (target the sticky app header)
        const header = await page.waitForSelector('header.sticky', { timeout: 2000 });
        expect(header).not.toBeNull();

        if (header) {
            // Verify header has inline style with CSS variable
            const style = await page.evaluate(el => el.getAttribute('style'), header);
            expect(style).not.toBeNull();
            expect(style).toContain('--theme-card');
        }
    });
});

describe('Theme Preset Tests', () => {
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

    test('should have theme preset selector in settings', async () => {
        // Navigate to settings by finding the button by text content
        await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button'));
            const settingsBtn = buttons.find(b => b.textContent?.includes('Settings'));
            settingsBtn?.click();
        });
        await wait(500);

        // Check for Appearance section
        const appearanceHeading = await page.evaluate(() => {
            const headings = Array.from(document.querySelectorAll('h2'));
            return headings.some(h => h.textContent?.includes('Appearance'));
        });

        expect(appearanceHeading).toBe(true);
    });

    test('should display theme preset options', async () => {
        // Navigate to settings
        await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button'));
            const settingsBtn = buttons.find(b => b.textContent?.includes('Settings'));
            settingsBtn?.click();
        });
        await wait(500);

        // Check for theme preset buttons/cards
        const hasPresets = await page.evaluate(() => {
            const text = document.body.innerText;
            return text.includes('Classic') &&
                text.includes('Ocean') &&
                text.includes('Forest');
        });

        expect(hasPresets).toBe(true);
    });

    test('should display accent color options', async () => {
        // Navigate to settings
        await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button'));
            const settingsBtn = buttons.find(b => b.textContent?.includes('Settings'));
            settingsBtn?.click();
        });
        await wait(500);

        // Check for "Accent Color" label
        const hasAccentLabel = await page.evaluate(() => {
            const labels = Array.from(document.querySelectorAll('label'));
            return labels.some(l => l.textContent?.includes('Accent Color'));
        });

        expect(hasAccentLabel).toBe(true);
    });
});
