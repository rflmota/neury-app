// Prepare, record to Full and export on the test build: its mock INTAN ramps
// ch0 = i and ch1 = i + 0x8000 (int16) from 0, and its capture area is 8 Pages.
import { expect, test } from '@playwright/test';
import { connect, field, open, saved } from './app';

const SAMPLES_PER_PAGE = 1020;

const s16 = (u: number) => ((u & 0xffff) << 16) >> 16;
const uv = (raw: number) => (raw * 195) / 1000;

for (const ch of [1, 2]) {
  test(`${ch} channel: erase, record to Full, export matches the ramp`, async ({ page }) => {
    await open(page);
    await connect(page);
    await expect(field(page, 'State')).toHaveText(/Menu mode|Full/);
    const erase = page.getByRole('button', { name: 'Erase and start new' });
    if (await erase.isVisible()) await erase.click();
    await expect(field(page, 'Memory')).toHaveText(/^\s*0 \//);

    await page.getByRole('radio', { name: String(ch), exact: true }).check();
    await expect(field(page, 'Channels')).toHaveText(String(ch));
    await page.getByRole('button', { name: 'Start Recording' }).click();
    await expect(page.getByText('Recording. Unplug the menu cable.')).toBeVisible();
    await expect(field(page, 'State')).toHaveText('Full', { timeout: 90_000 });

    await page.getByRole('button', { name: 'Export CSV' }).click();
    const notice = page.getByText(/^Exported to /);
    await expect(notice).toBeVisible();
    const name = (await notice.textContent())!.replace(/^Exported to (.+)\.$/, '$1');
    const lines = (await saved(page, name)).trimEnd().split('\n');

    const pages = Number(/(\d+) \//.exec((await field(page, 'Memory').textContent())!)![1]);
    const rows = lines.filter((l) => !l.startsWith('#')).slice(1);
    expect(lines[0]).toBe(ch === 1 ? 'sample_s,ch0_uV' : 'sample_s,ch0_uV,ch1_uV');
    expect(lines.filter((l) => l.startsWith('#'))).toEqual([expect.stringMatching(/^# segment \d+ first_sample_s=0 /)]);
    expect(rows.length).toBe((pages * SAMPLES_PER_PAGE) / ch);
    const want = (i: number) => [i / 200, uv(s16(i)), ...(ch === 2 ? [uv(s16(i + 0x8000))] : [])].join(',');
    expect(rows.findIndex((r, i) => r !== want(i))).toBe(-1);
  });
}
