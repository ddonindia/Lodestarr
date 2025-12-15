import { Browser, Page } from 'puppeteer';
import { setupBrowser, teardownBrowser, navigateToApp, wait } from './setup';

describe('Indexer Management Tests', () => {
    let browser: Browser;
    let page: Page;

    // Test data - API key is masked in the UI
    const TEST_INDEXER = {
        name: 'Internet Archive',
        url: 'http://192.168.3.11:9117/api/v2.0/indexers/internetarchive/results/torznab/',
        apikey: 'dlnpsedbkhoyvqsswzuixby3oeqrw7nh'
    };

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
        // Navigate to Settings
        const buttons = await page.$$('button');
        for (const button of buttons) {
            const text = await page.evaluate(el => el.textContent, button);
            if (text?.includes('Settings')) {
                await button.click();
                break;
            }
        }
        await wait(1000); // Wait for settings to load
    });

    test('should load Settings page successfully', async () => {
        // Verify Settings page content is visible (h1 is the logo "Lodestarr")
        // The actual Settings heading is an h1 within the page content
        const settingsVisible = await page.evaluate(() => {
            const headings = Array.from(document.querySelectorAll('h1, h2, h3'));
            return headings.some(h => h.textContent?.includes('Settings'));
        });
        expect(settingsVisible).toBe(true);

        // Check for Add Indexer form
        const addIndexerHeading = await page.evaluate(() => {
            const h2s = Array.from(document.querySelectorAll('h2'));
            return h2s.some(h => h.textContent?.includes('Add Indexer'));
        });
        expect(addIndexerHeading).toBe(true);
    });

    test('should have indexer form inputs', async () => {
        // Check for name input
        const nameInput = await page.$('input[placeholder*="YTS"]');
        expect(nameInput).not.toBeNull();

        // Check for URL input
        const urlInput = await page.$('input[placeholder*="http"]');
        expect(urlInput).not.toBeNull();

        // Check for API key input (password type)
        const apikeyInput = await page.$('input[type="password"]');
        expect(apikeyInput).not.toBeNull();
    });

    test('should add indexer with URL and API key', async () => {
        // Fill in the indexer name
        const nameInput = await page.$('input[placeholder*="YTS"]');
        if (nameInput) {
            await nameInput.click();
            await nameInput.type(TEST_INDEXER.name);
        }

        // Fill in the URL
        const urlInputs = await page.$$('input');
        let urlInput = null;
        for (const input of urlInputs) {
            const placeholder = await page.evaluate(el => el.placeholder, input);
            if (placeholder?.includes('http')) {
                urlInput = input;
                break;
            }
        }

        if (urlInput) {
            await urlInput.click();
            await urlInput.type(TEST_INDEXER.url);
        }

        // Fill in the API key (password field)
        const apikeyInput = await page.$('input[type="password"]');
        if (apikeyInput) {
            await apikeyInput.click();
            await apikeyInput.type(TEST_INDEXER.apikey);
        }

        // Verify the API key is masked (shows dots/asterisks)
        const apikeyType = await page.evaluate((input) => {
            return input?.getAttribute('type');
        }, apikeyInput);
        expect(apikeyType).toBe('password');

        await wait(500);

        // Click the Add Indexer button
        const buttons = await page.$$('button');
        let addButton = null;
        for (const button of buttons) {
            const text = await page.evaluate(el => el.textContent, button);
            if (text?.includes('Add Indexer')) {
                addButton = button;
                break;
            }
        }

        if (addButton) {
            await addButton.click();
            await wait(2000); // Wait for API call to complete
        }

        // Verify success message appears
        const successMessage = await page.evaluate(() => {
            const messages = Array.from(document.querySelectorAll('div'));
            return messages.some(div =>
                div.textContent?.includes('Indexer added') ||
                div.className?.includes('emerald')
            );
        });
        expect(successMessage).toBe(true);

        // Verify the indexer appears in the list
        await wait(1000);
        const indexerInList = await page.evaluate((name) => {
            const cells = Array.from(document.querySelectorAll('td'));
            return cells.some(td => td.textContent?.includes(name));
        }, TEST_INDEXER.name);
        expect(indexerInList).toBe(true);
    });

    test('should display indexer URL in the list', async () => {
        // First, check if indexer exists or add it
        const indexerExists = await page.evaluate((name) => {
            const cells = Array.from(document.querySelectorAll('td'));
            return cells.some(td => td.textContent?.includes(name));
        }, TEST_INDEXER.name);

        if (!indexerExists) {
            // Add the indexer first (reusing logic from previous test)
            const nameInput = await page.$('input[placeholder*="YTS"]');
            if (nameInput) {
                await nameInput.click();
                await nameInput.type(TEST_INDEXER.name);
            }

            const urlInputs = await page.$$('input');
            for (const input of urlInputs) {
                const placeholder = await page.evaluate(el => el.placeholder, input);
                if (placeholder?.includes('http')) {
                    await input.click();
                    await input.type(TEST_INDEXER.url);
                    break;
                }
            }

            const apikeyInput = await page.$('input[type="password"]');
            if (apikeyInput) {
                await apikeyInput.click();
                await apikeyInput.type(TEST_INDEXER.apikey);
            }

            const buttons = await page.$$('button');
            for (const button of buttons) {
                const text = await page.evaluate(el => el.textContent, button);
                if (text?.includes('Add Indexer')) {
                    await button.click();
                    break;
                }
            }
            await wait(2000);
        }

        // Verify URL is displayed (may be truncated in UI)
        const urlDisplayed = await page.evaluate(() => {
            const codeTags = Array.from(document.querySelectorAll('code'));
            return codeTags.some(code =>
                code.textContent?.includes('192.168.3.11') ||
                code.textContent?.includes('internetarchive')
            );
        });
        expect(urlDisplayed).toBe(true);
    });

    test('should mask API key in password field', async () => {
        // Verify that the API key input is of type password
        const apikeyInput = await page.$('input[type="password"]');
        expect(apikeyInput).not.toBeNull();

        // Fill in a dummy key
        if (apikeyInput) {
            await apikeyInput.click();
            await apikeyInput.type('test-api-key-12345');

            // Verify the value is not visible as plain text
            const inputType = await page.evaluate(el => el.type, apikeyInput);
            expect(inputType).toBe('password');

            // The displayed value should be dots/bullets (browser renders this)
            const displayValue = await page.evaluate(el => {
                // The actual form value exists but browser shows dots
                return el.value.length > 0 && el.type === 'password';
            }, apikeyInput);
            expect(displayValue).toBe(true);
        }
    });
});
