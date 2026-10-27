import { chromium, type Browser } from '@playwright/test'

export async function launchBrowser(): Promise<Browser> {
  try {
    return await chromium.launch()
  } catch (error) {
    throw new Error(
      'Chromium could not start.\n' +
        '  1. Download it once:                 npx playwright install chromium\n' +
        '  2. If it then says "error while loading shared libraries" (libnspr4, libnss3, libasound), install them once (needs sudo):\n' +
        '       sudo apt install libnspr4 libnss3 libasound2t64      (or: sudo npx playwright install-deps chromium)\n\n' +
        `Original error: ${String((error as Error).message).split('\n')[0]}`,
    )
  }
}
