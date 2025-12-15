# Lodestarr UI Automation Tests

This directory contains Puppeteer-based UI automation tests for the Lodestarr web application.

## Structure

- `ui/` - UI automation tests using Puppeteer
  - `setup.ts` - Test utilities and helper functions
  - `jest.config.js` - Jest configuration for Puppeteer tests
  - `tsconfig.json` - TypeScript configuration for test files
  - `*.test.ts` - Test files

## Running Tests

### Prerequisites

Make sure the Lodestarr server is running:
```bash
cd C:\Users\hemu\Lodestarr\target\debug
.\lodestarr.exe serve
```

The server should be accessible at `http://localhost:3420`

### Run all tests (headless mode)
```bash
npm test
```

### Run tests in headed mode (watch browser)
```bash
npm run test:headed
```

### Run tests in watch mode
```bash
npm run test:watch
```

## Test Suites

- **navigation.test.ts** - Tests for navigation between views (Dashboard, Search, Settings)
- **theme.test.ts** - Tests for theme toggle functionality (dark/light mode)
- **dashboard.test.ts** - Tests for dashboard layout and responsiveness

## Writing New Tests

1. Create a new `.test.ts` file in the `ui/` directory
2. Import utilities from `setup.ts`
3. Use `setupBrowser()` and `teardownBrowser()` in beforeAll/afterAll hooks
4. Write your test cases using Jest syntax

Example:
```typescript
import { Browser, Page } from 'puppeteer';
import { setupBrowser, teardownBrowser, navigateToApp } from './setup';

describe('My Test Suite', () => {
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

  test('my test case', async () => {
    await navigateToApp(page);
    // Your test code here
  });
});
```
