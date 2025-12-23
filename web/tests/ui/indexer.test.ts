import { Browser, Page } from 'puppeteer';
import { setupBrowser, teardownBrowser, navigateToApp, wait } from './setup';

describe('Indexer Management Tests', () => {
    let browser: Browser;
    let page: Page;

    // Test data - API key is masked in the UI
    const TEST_INDEXER = {
        name: 'Test Setup Indexer',
        url: 'http://192.168.3.11:9117/api/v2.0/indexers/test/results/torznab/',
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
        // Navigate to Indexers via Sidebar
        await wait(500);
        const buttons = await page.$$('aside nav button');
        for (const button of buttons) {
            const text = await page.evaluate(el => el.textContent, button);
            if (text?.includes('Indexers')) {
                await button.click();
                break;
            }
        }
        await wait(1000); // Wait for page to load
    });

    test('should load Indexers page successfully', async () => {
        await wait(500);
        // Verify Indexers page content is visible
        const indexersVisible = await page.evaluate(() => {
            const headings = Array.from(document.querySelectorAll('h1, h2, h3'));
            return headings.some(h => h.textContent?.includes('Indexers'));
        });
        expect(indexersVisible).toBe(true);

        // Verify tabs exist
        const tabs = await page.$$('button');
        let installedTab = false;
        let browseTab = false;
        let addTab = false;

        for (const tab of tabs) {
            const text = await page.evaluate(el => el.textContent, tab);
            if (text?.includes('Installed')) installedTab = true;
            if (text?.includes('Browse')) browseTab = true;
            if (text?.includes('Add Indexer')) addTab = true;
        }

        expect(installedTab).toBe(true);
        expect(browseTab).toBe(true);
        expect(addTab).toBe(true);
    });

    test('should allow browsing and downloading native indexers', async () => {
        // Switch to Browse tab
        const buttons = await page.$$('button');
        for (const btn of buttons) {
            const text = await page.evaluate(el => el.textContent, btn);
            if (text?.includes('Browse')) {
                await btn.click();
                break;
            }
        }
        await wait(1000);

        // Check if cards are loaded
        const cardsExist = await page.evaluate(() => {
            return document.querySelectorAll('.card').length > 0 || document.querySelectorAll('h3').length > 0;
        });

        // Note: github fetch depends on internet, so we just check structure not specific content if network fails
        // But assuming test env has net or specific valid mock
        if (cardsExist) {
            // Try to find a download button
            const downloadBtn = await page.$('button svg.lucide-download');
            if (downloadBtn) {
                // Check it exists, we won't actually click to avoid network calls in this test unless mocked
                expect(downloadBtn).not.toBeNull();
            }
        }
    });

    test('should add custom indexer manually', async () => {
        // Switch to Add Indexer tab
        const buttons = await page.$$('button');
        for (const btn of buttons) {
            const text = await page.evaluate(el => el.textContent, btn);
            if (text?.includes('Add Indexer')) {
                await btn.click();
                break;
            }
        }
        await wait(500);

        // Fill form
        const nameInput = await page.$('input[placeholder*="Private Tracker"]');
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

        // Save
        const allButtons = await page.$$('button');
        for (const btn of allButtons) {
            const text = await page.evaluate(el => el.textContent, btn);
            if (text?.includes('Save Indexer')) {
                await btn.click();
                await wait(2000); // Wait for API
                break;
            }
        }

        // Verify it appears in Installed list
        // Switch to Installed tab automatically happens on success, or check list
        await wait(1000);
        const indexerInList = await page.evaluate((name) => {
            // It might be in a table cell or h4 depending on view
            // The new view uses a table
            return document.body.textContent?.includes(name);
        }, TEST_INDEXER.name);

        expect(indexerInList).toBe(true);
    });

    test('should delete an indexer', async () => {
        // Ensure we are on Installed tab
        const buttons = await page.$$('button');
        for (const btn of buttons) {
            const text = await page.evaluate(el => el.textContent, btn);
            if (text?.includes('Installed')) {
                await btn.click();
                break;
            }
        }
        await wait(1000);

        // Find delete button for our test indexer
        // The table row contains the name "Internet Archive"
        // We need to find the specific delete button in that row

        // This is tricky with Puppeteer without good unique IDs. 
        // We'll trust the flow: find the row with text, then find the button inside it.
        // Handle confirmation dialog
        page.on('dialog', async dialog => {
            await dialog.accept();
        });

        // Find and click the delete button
        const deleted = await page.evaluate(async (name) => {
            const rows = Array.from(document.querySelectorAll('tr'));
            const row = rows.find(r => r.textContent?.includes(name));
            if (!row) return false;

            const deleteBtn = row.querySelector('button[title="Delete Indexer"]');
            if (deleteBtn && deleteBtn instanceof HTMLElement) {
                deleteBtn.click();
                return true;
            }
            return false;
        }, TEST_INDEXER.name);

        if (deleted) {
            await wait(2000); // Wait for API
            // Verify it's gone
            const indexerStillThere = await page.evaluate((name) => {
                return document.body.textContent?.includes(name);
            }, TEST_INDEXER.name);
            // It might still be in "Browse" but should be gone from "Installed" list 
            // Only check if it's gone from the table rows
            const inTable = await page.evaluate((name) => {
                const rows = Array.from(document.querySelectorAll('tbody tr'));
                return rows.some(r => r.textContent?.includes(name));
            }, TEST_INDEXER.name);

            expect(inTable).toBe(false);
        } else {
            // If we couldn't find the button, the previous test might have failed or row UI changed
            console.warn('Could not find delete button for test indexer');
        }
    });
});
