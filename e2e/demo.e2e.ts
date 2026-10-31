// Demo video of the App on Target B (test build), with captions burned in by
// the recording. Runs only with NEURY_DEMO=1; marks.json tells the edit where
// to cut and speed up. NEURY_BIN and NEURY_BIN_NEXT as in update.e2e.ts.
import { readFileSync, writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { connect, field, open } from './app';

test.skip(!process.env.NEURY_DEMO, 'NEURY_DEMO=1 records the demo');
test.use({
  viewport: { width: 1280, height: 720 },
  video: { mode: 'on', size: { width: 1280, height: 720 } },
  launchOptions: { slowMo: 400 },
});

const version = (bin: Buffer) => /fw=(\d+\.\d+\.\d+) proto/.exec(bin.toString('latin1'))![1];

function show(page: Page, card: boolean, text: string) {
  return page.evaluate(
    ([card, text]) => {
      // The App on the left, zoomed for the video; captions in a panel on the right.
      document.getElementById('app')!.style.zoom = '1.35';
      document.body.style.paddingRight = '440px';
      let el = document.getElementById('demo-caption');
      if (!el) {
        el = document.createElement('div');
        el.id = 'demo-caption';
        document.body.append(el);
      }
      el.style.cssText =
        'position:fixed;top:0;bottom:0;right:0;display:flex;flex-direction:column;justify-content:center;' +
        'background:#1d3b53;color:#fff;white-space:pre-line;z-index:9;' +
        (card ? 'left:0;align-items:center;text-align:center;font:34px/1.5 system-ui'
              : 'width:360px;padding:0 40px;font:24px/1.5 system-ui');
      el.textContent = text;
    },
    [card, text] as const,
  );
}

// Captions stay up long enough to read twice.
async function say(page: Page, text: string, ms = 4000) {
  await show(page, false, text);
  await page.waitForTimeout(ms * 1.6);
}

async function card(page: Page, text: string, ms = 4000) {
  await show(page, true, text);
  await page.waitForTimeout(ms);
  await show(page, false, '');
}

test('demo', async ({ page }, info) => {
  test.setTimeout(600_000);
  const t0 = Date.now();
  const marks: Record<string, number> = {};
  const mark = (name: string) => (marks[name] = (Date.now() - t0) / 1000);

  const current = readFileSync(process.env.NEURY_BIN!);
  const next = readFileSync(process.env.NEURY_BIN_NEXT!);
  await page.route('**/firmware.json', (r) => r.fulfill({ json: { version: version(next), file: 'next.bin' } }));
  await page.route('**/firmware/next.bin', (r) => r.fulfill({ body: next }));

  // Off camera: start from an empty Logger.
  await open(page);
  await connect(page);
  const erase = page.getByRole('button', { name: 'Erase and start new' });
  if (await erase.isVisible()) await erase.click();
  await expect(field(page, 'Memory')).toHaveText(/^\s*0 \//);
  await page.reload();

  mark('start');
  await card(page, 'Neury App\nRecord, export and update a Logger from Chrome or Edge', 4500);
  await card(page, 'This demo runs the test build:\nit records a synthetic ramp, not neural signals.', 5000);

  await say(page, 'Plug in the Logger with its menu cable: it powers up in Menu mode.\n\nOpen the App in Chrome or Edge.', 5000);
  await say(page, 'Connect. The first time, Chrome asks which port to use: pick the Logger.\n\n(Chrome\'s port list is not shown in this recording.)', 5000);
  await connect(page);
  await say(page, 'The Logger\'s status: its mode, channels, memory used and hours left.\n\nThe App sets the Logger\'s clock by itself when it has one.', 6000);

  await say(page, 'Before the first Recording, choose 1 or 2 channels.', 3000);
  await page.getByRole('radio', { name: '2', exact: true }).check();
  await expect(field(page, 'Channels')).toHaveText('2');
  await page.getByRole('radio', { name: '1', exact: true }).check();
  await expect(field(page, 'Channels')).toHaveText('1');
  await say(page, 'Start Recording. Then unplug the menu cable: the Logger keeps recording on its battery, at 200 samples per second.', 4000);
  await page.getByRole('button', { name: 'Start Recording' }).click();
  await expect(page.getByText('Recording. Unplug the menu cable.')).toBeVisible();
  await say(page, 'A Recording runs until the memory is Full.\n\nThe test build fills its 8 Pages in about 40 s (sped up here).', 2000);
  mark('fast');
  await expect(field(page, 'State')).toHaveText('Full', { timeout: 90_000 });
  mark('full');
  await say(page, 'Full. A Logger left Full on its own blinks yellow three times and sleeps.\n\nPowering it up with the menu cable brings it back to Menu mode.', 4000);

  await say(page, 'Export CSV: Chrome asks where to save (not shown here).\n\nOne row per sample: time in seconds and µV per channel.', 2000);
  await page.getByRole('button', { name: 'Export CSV' }).click();
  await expect(page.getByText(/^Exported to /)).toBeVisible();
  await say(page, 'Each Recording\'s start is noted in the file.\n\nThe Pages stay on the Logger until you erase them.', 5000);

  await say(page, 'Update firmware: the App restarts the Logger into its bootloader and installs the new version over USB. Pages are kept.\n\n(Demo release.)', 4000);
  await page.getByRole('button', { name: `Update firmware to ${version(next)}` }).click();
  await expect(page.getByText('Firmware updated.')).toBeVisible({ timeout: 60_000 });
  await say(page, 'Done. Connect again.', 2500);
  await connect(page);
  await expect(field(page, 'Firmware')).toHaveText(version(next));
  await say(page, 'Custom firmware installs a .bin file you choose instead.', 3500);

  await page.getByText('Diagnostics').click();
  await page.getByRole('button', { name: 'Run self-test' }).scrollIntoViewIfNeeded();
  await say(page, 'Diagnostics: the memory chip, INTAN, clock and error counters.\n\nSend these when you report a problem.', 6000);
  await say(page, 'Run self-test erases the Logger and checks every Page of its memory: about 25 minutes, seconds in the test build.', 2000);
  await page.getByRole('button', { name: 'Run self-test' }).click();
  await expect(page.getByText(/^Passed: /)).toBeVisible({ timeout: 120_000 });
  await page.waitForTimeout(2500);
  await card(page, 'rflmota.github.io/neury-app', 4000);
  mark('end');

  // Off camera: back to the image the Rig expects.
  await page.getByText('Custom firmware').click();
  await page.locator('input[type=file]').setInputFiles(process.env.NEURY_BIN!);
  await expect(page.getByText('Firmware updated.')).toBeVisible({ timeout: 60_000 });
  await connect(page);
  await expect(field(page, 'Firmware')).toHaveText(version(current));
  writeFileSync(info.outputPath('marks.json'), JSON.stringify(marks));
});
