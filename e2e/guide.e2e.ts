// Step-by-step guide to the App, captured on Target B (test build): one
// screenshot per step with its target outlined, written to
// test-results/.../guide/ as NN.png, steps.json and guide.md. Copy those into
// public/guide/. Runs only with NEURY_GUIDE=1; NEURY_BIN and NEURY_BIN_NEXT as
// in update.e2e.ts. Ends with NEURY_BIN back on the Logger.
import { readFileSync, writeFileSync } from 'node:fs';
import { expect, test, type Locator } from '@playwright/test';
import { connect, field, open } from './app';

test.skip(!process.env.NEURY_GUIDE, 'NEURY_GUIDE=1 captures the guide');
test.use({ viewport: { width: 720, height: 320 }, deviceScaleFactor: 2 });

const version = (bin: Buffer) => /fw=(\d+\.\d+\.\d+) proto/.exec(bin.toString('latin1'))![1];

const OUTLINE = '[data-guide]{outline:3px solid #e5482f !important;outline-offset:4px;border-radius:4px}';

test('guide', async ({ page }, info) => {
  test.setTimeout(600_000);
  const current = readFileSync(process.env.NEURY_BIN!);
  const next = readFileSync(process.env.NEURY_BIN_NEXT!);
  await page.route('**/firmware.json', (r) => r.fulfill({ json: { version: version(next), file: 'next.bin' } }));
  await page.route('**/firmware/next.bin', (r) => r.fulfill({ body: next }));

  const steps: { title: string; text: string; image: string }[] = [];
  async function step(title: string, text: string, target?: Locator) {
    const image = `${String(steps.length + 1).padStart(2, '0')}.png`;
    await target?.evaluate((el) => el.setAttribute('data-guide', ''));
    await page.screenshot({ path: info.outputPath('guide', image), fullPage: true, style: OUTLINE });
    await target?.evaluate((el) => el.removeAttribute('data-guide'));
    steps.push({ title, text, image });
  }
  const button = (name: string) => page.getByRole('button', { name, exact: true });

  // Start from an empty Logger.
  await open(page);
  await connect(page);
  const erase = button('Erase and start new');
  if (await erase.isVisible()) await erase.click();
  await expect(field(page, 'Memory')).toHaveText(/^\s*0 \//);
  await page.reload();

  await step(
    'Open the App',
    'Plug the Logger into the computer with its menu cable: it powers up in Menu mode. Open the App in Chrome or Edge on a desktop computer.',
  );
  await step(
    'Connect',
    'Press Connect. The first time, Chrome lists the serial ports: pick "Neury Logger" and press Connect. After that, the App connects straight away while it is the only Logger plugged in.',
    button('Connect'),
  );
  await connect(page);
  await step(
    'Check the status',
    'The App shows the Logger\'s state, channels, memory used with the hours left, and its firmware. On a Logger with a clock it also shows the Logger time, and sets the clock by itself.',
    page.locator('dl').first(),
  );
  await step(
    'Choose the channels',
    'Before the first Recording, choose 1 or 2 channels. A Logger records for about 98 hours with 1 channel, or about 50 hours with 2.',
    page.locator('fieldset'),
  );
  await step('Start Recording', 'Press Start Recording.', button('Start Recording'));
  await button('Start Recording').click();
  const recording = page.getByText('Recording. Unplug the menu cable.');
  await expect(recording).toBeVisible();
  await step(
    'Unplug the menu cable',
    'Unplug the menu cable. The Logger keeps recording on its battery, at 200 samples per second, until its memory is Full.',
    recording,
  );
  await expect(field(page, 'State')).toHaveText('Full', { timeout: 90_000 });
  await step(
    'Full',
    'When its memory is Full, the Logger stops recording. Left on its own, it blinks yellow at 10, 20 and 30 seconds, then sleeps. To export, power it up with the menu cable plugged in: it starts in Menu mode, and you connect as before.',
    field(page, 'State'),
  );
  await step(
    'Export CSV',
    'Press Export CSV, then choose where Chrome saves the file. It has one row per sample: the time in seconds and µV for each channel.',
    button('Export CSV'),
  );
  await button('Export CSV').click();
  const exported = page.getByText(/^Exported to /);
  await expect(exported).toBeVisible();
  await step(
    'Exported',
    'A comment line in the file marks where each Segment starts. The Pages stay on the Logger until you erase them.',
    exported,
  );

  const update = button(`Update firmware to ${version(next)}`);
  await step(
    'Update firmware',
    'When a newer firmware is released, the App offers Update firmware. Press it and confirm. The App restarts the Logger into its bootloader and installs the firmware over USB; recorded Pages are kept. The first time, press Select bootloader if the App asks, then pick "DAPBoot DFU Bootloader" in Chrome\'s list and press Connect.',
    update,
  );
  await update.click();
  const progress = page.locator('main > progress');
  await expect(progress).toBeVisible({ timeout: 20_000 });
  await step('Wait for the update', 'Keep the Logger plugged in until the update finishes.', progress);
  const updated = page.getByText('Firmware updated.', { exact: false });
  await expect(updated).toBeVisible({ timeout: 60_000 });
  await step('Connect again', 'The Logger restarts by itself. Press Connect again.', button('Connect'));
  await connect(page);
  await expect(field(page, 'Firmware')).toHaveText(version(next));

  // Custom firmware puts NEURY_BIN back on the Logger.
  await page.getByText('Custom firmware').click();
  const file = page.locator('input[type=file]');
  await step(
    'Custom firmware',
    'To install a .bin file you were given instead, open Custom firmware, choose the file and confirm. The update then runs as above.',
    file,
  );
  await file.setInputFiles(process.env.NEURY_BIN!);
  await expect(updated).toBeVisible({ timeout: 60_000 });
  await connect(page);
  await expect(field(page, 'Firmware')).toHaveText(version(current));

  await step(
    'Erase and start new',
    'To reuse a Logger, press Erase and start new and confirm. This deletes all Pages, so export first. Erasing takes up to about 2 minutes.',
    erase,
  );
  await erase.click();
  await expect(field(page, 'Memory')).toHaveText(/^\s*0 \//, { timeout: 150_000 });

  await page.getByText('Diagnostics').click();
  await step(
    'Diagnostics',
    'Open Diagnostics to see the memory chip, the INTAN, the clock and the error counters. Include them when you report a problem.',
    page.locator('details:has(> summary:text-is("Diagnostics")) dl'),
  );
  const selfTest = button('Run self-test');
  await step(
    'Run self-test',
    'Run self-test erases the Logger and checks every Page of its memory. It takes about 25 minutes: keep the App open and the Logger plugged in.',
    selfTest,
  );
  await selfTest.click();
  const passed = page.getByText(/^Passed: /);
  await expect(passed).toBeVisible({ timeout: 120_000 });
  await step(
    'Self-test result',
    'Passed shows how many Pages were checked. If it fails, the App shows the first bad Page: report it with the Diagnostics.',
    passed,
  );

  writeFileSync(info.outputPath('guide', 'steps.json'), JSON.stringify(steps, null, 2) + '\n');
  writeFileSync(
    info.outputPath('guide', 'guide.md'),
    '# How to use the Neury App\n\nCaptured on the test build, whose memory fills in about 40 seconds.\n' +
      steps.map((s, i) => `\n## ${i + 1}. ${s.title}\n\n${s.text}\n\n![${s.title}](${s.image})\n`).join(''),
  );
});
