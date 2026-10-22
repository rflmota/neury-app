import { expect, type Page } from '@playwright/test';

export const field = (page: Page, name: string) => page.locator(`dt:text-is("${name}") + dd`);

export async function open(page: Page) {
  page.on('dialog', (d) => d.accept());
  // The native save dialog can't be driven: save into the origin private file system.
  await page.addInitScript(() => {
    window.showSaveFilePicker = async (o) =>
      (await navigator.storage.getDirectory()).getFileHandle(o!.suggestedName!, { create: true });
  });
  await page.goto('/');
}

export function saved(page: Page, name: string): Promise<string> {
  return page.evaluate(
    async (n) => (await (await (await navigator.storage.getDirectory()).getFileHandle(n)).getFile()).text(),
    name,
  );
}

// Connect skips the port chooser only when exactly one granted Logger is plugged in.
export async function connect(page: Page) {
  await expect
    .poll(() => page.evaluate(async () => (await navigator.serial.getPorts()).length), { timeout: 20_000 })
    .toBe(1);
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(field(page, 'State')).toBeVisible();
}
