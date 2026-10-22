// Firmware update over D and WebUSB DFU: to a newer release, then back with a
// custom .bin. NEURY_BIN is the image on the Logger, NEURY_BIN_NEXT a newer one.
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { connect, field, open } from './app';

const version = (bin: Buffer) => /fw=(\d+\.\d+\.\d+) proto/.exec(bin.toString('latin1'))![1];

test('update to the release and back with a custom .bin, Pages kept', async ({ page }) => {
  const current = readFileSync(process.env.NEURY_BIN!);
  const next = readFileSync(process.env.NEURY_BIN_NEXT!);
  await page.route('**/firmware.json', (r) => r.fulfill({ json: { version: version(next), file: 'next.bin' } }));
  await page.route('**/firmware/next.bin', (r) => r.fulfill({ body: next }));
  await open(page);
  await connect(page);
  await expect(field(page, 'Firmware')).toHaveText(version(current));
  const memory = await field(page, 'Memory').textContent();

  await page.getByRole('button', { name: `Update firmware to ${version(next)}` }).click();
  await expect(page.getByText('Firmware updated.')).toBeVisible({ timeout: 60_000 });
  await connect(page);
  await expect(field(page, 'Firmware')).toHaveText(version(next));
  await expect(field(page, 'Memory')).toHaveText(memory!);

  await page.getByText('Custom firmware').click();
  await page.locator('input[type=file]').setInputFiles(process.env.NEURY_BIN!);
  await expect(page.getByText('Firmware updated.')).toBeVisible({ timeout: 60_000 });
  await connect(page);
  await expect(field(page, 'Firmware')).toHaveText(version(current));
  await expect(field(page, 'Memory')).toHaveText(memory!);
});
