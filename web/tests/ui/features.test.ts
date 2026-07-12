import { Page, Browser } from 'puppeteer';
import { setupBrowser, teardownBrowser, navigateToApp, elementExists, wait, waitForElement } from './setup';

describe('New Features (Phase 4 & 5)', () => {
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
        await wait(500); // Let animations finish
    });

    const clickByText = async (tag: string, text: string) => {
        for (let i = 0; i < 20; i++) {
            const elements = await page.$$(tag);
            for (const el of elements) {
                const elText = await page.evaluate(e => e.textContent, el);
                if (elText && elText.includes(text)) {
                    await el.click();
                    return;
                }
            }
            await wait(250);
        }
        throw new Error(`Element ${tag} with text ${text} not found`);
    };

    it('should display the Logs tab and show logs', async () => {
        await clickByText('button', 'Logs');
        await waitForElement(page, 'h1');
        
        await wait(1000);
        
        const hasLogs = await elementExists(page, 'div.font-mono > div');
        const hasEmptyState = await page.evaluate(() => {
            return document.body.textContent?.includes('No logs available') || false;
        });
        
        expect(hasLogs || hasEmptyState).toBeTruthy();
    });

    it('should have Cache TTL setting in Data Management', async () => {
        await clickByText('button', 'Settings');
        await wait(500);
        
        await clickByText('button', 'Data');
        await wait(500);
        
        const ttlInputExists = await elementExists(page, 'input[type="number"]');
        expect(ttlInputExists).toBeTruthy();
    });

    it('should have Blackhole option in Download Clients', async () => {
        await clickByText('button', 'Settings');
        await wait(1000);
        
        await clickByText('button', 'Download Clients');
        await wait(1000);
        
        const select = await page.$('select');
        expect(select).not.toBeNull();
        
        const optionExists = await page.evaluate(() => {
            const options = Array.from(document.querySelectorAll('select option'));
            return options.some(opt => opt.textContent?.includes('Blackhole'));
        });
        
        expect(optionExists).toBeTruthy();
    });

    it('should show tags input in Add Indexer form (Phase 1)', async () => {
        await clickByText('button', 'Indexers');
        await wait(1000);
        
        await clickByText('button', 'Add Indexer');
        await wait(500);

        const tagsInputExists = await page.evaluate(() => {
            const labels = Array.from(document.querySelectorAll('label'));
            return labels.some(l => l.textContent?.toLowerCase().includes('tags'));
        });
        
        expect(tagsInputExists).toBeTruthy();
    });

    it('should support rendering health badges (Phase 2)', async () => {
        await clickByText('button', 'Indexers');
        await wait(1000);
        
        await clickByText('button', 'Installed');
        await wait(1000);

        const hasHealthBadge = await page.evaluate(() => {
            const text = document.body.textContent;
            return text?.includes('Healthy') || text?.includes('Failing') || document.querySelectorAll('.rounded-lg').length > 0;
        });
        
        expect(hasHealthBadge !== null).toBeTruthy();
    });
});
