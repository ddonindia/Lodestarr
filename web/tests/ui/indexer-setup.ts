import { Page } from 'puppeteer';
import { BASE_URL, wait } from './setup';

/**
 * Download and enable Internet Archive indexer
 * This ensures tests have a consistent indexer to work with
 */
export async function setupInternetArchive(page: Page): Promise<boolean> {
    const maxRetries = 3;

    for (let i = 0; i < maxRetries; i++) {
        try {
            console.log(`Attempt ${i + 1}/${maxRetries} to setup Internet Archive indexer...`);

            // 1. Download Internet Archive indexer via API (Native endpoint)
            const downloadResponse = await fetch(`${BASE_URL}/api/native/download`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ names: ['internetarchive'] })
            });

            if (!downloadResponse.ok) {
                console.warn(`Download failed (Status: ${downloadResponse.status})`);
                await wait(1000);
                continue;
            }

            // Wait for download to process
            await wait(2000);

            // 2. Enable the indexer
            const enableResponse = await fetch(`${BASE_URL}/api/settings/indexer/internetarchive/status`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ enabled: true })
            });

            // Even if enable fails (e.g. already enabled), we check verification

            // 3. Verify it exists and is enabled
            if (await verifyInternetArchive(page)) {
                console.log('Internet Archive indexer setup successful.');
                return true;
            }

            console.warn('Verification failed, retrying...');
            await wait(2000);

        } catch (error) {
            console.error('Setup error:', error);
            await wait(1000);
        }
    }

    console.error('Failed to setup Internet Archive indexer after retries.');
    return false;
}

/**
 * Verify Internet Archive is installed and enabled
 */
export async function verifyInternetArchive(page: Page): Promise<boolean> {
    try {
        // Check native indexers first
        const nativeResponse = await fetch(`${BASE_URL}/api/native/local`);
        if (nativeResponse.ok) {
            const data = await nativeResponse.json();
            const ia = data.indexers?.find((idx: any) =>
                idx.id === 'internetarchive' || idx.name.toLowerCase().includes('internet archive')
            );
            if (ia) return ia.enabled !== false;
        }

        // Fallback to proxied indexers
        const response = await fetch(`${BASE_URL}/api/indexers`);
        const data = await response.json();

        const ia = data.indexers?.find((idx: any) =>
            idx.id === 'internetarchive' || idx.name.toLowerCase().includes('internet archive')
        );

        return ia !== undefined && ia.enabled !== false;
    } catch (error) {
        return false;
    }
}
