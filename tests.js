import { parseStatus, formatDuration } from './lib/status.js';
import { parseCsvLine } from './lib/export.js';
import * as dfu from './lib/dfu.js';
import * as release from './lib/release.js';

const out = document.getElementById('out');
let passed = 0, failed = 0;

function assert(name, cond, detail) {
  const div = document.createElement('div');
  div.className = cond ? 'pass' : 'fail';
  div.textContent = `${cond ? 'PASS' : 'FAIL'}: ${name}${detail ? ' — ' + detail : ''}`;
  out.appendChild(div);
  cond ? passed++ : failed++;
}

function eq(name, actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  assert(name, a === e, a === e ? '' : `got ${a}, want ${e}`);
}

// Firmware emits stop as `<armed_bit>/<full_enter_ms>` — `0/0` or `1/<ms>`.
eq('parseStatus MENU (firmware format)',
  parseStatus('state=MENU ch=1 boots=6 pages=0/8 samples=0 fails=0 ms=12473 stop=0/0'),
  { state: 'MENU', ch: 1, boots: 6, pagesCur: 0, pagesCap: 8, samples: 0, fails: 0, uptimeMs: 12473, stopArmed: false, stopEnterMs: null });

eq('parseStatus REC',
  parseStatus('state=REC ch=2 boots=7 pages=42/131008 samples=8400 fails=0 ms=210000 stop=0/0'),
  { state: 'REC', ch: 2, boots: 7, pagesCur: 42, pagesCap: 131008, samples: 8400, fails: 0, uptimeMs: 210000, stopArmed: false, stopEnterMs: null });

eq('parseStatus FULL+armed (firmware format)',
  parseStatus('state=FULL ch=1 boots=1 pages=8/8 samples=8192 fails=0 ms=9999999 stop=1/4500'),
  { state: 'FULL', ch: 1, boots: 1, pagesCur: 8, pagesCap: 8, samples: 8192, fails: 0, uptimeMs: 9999999, stopArmed: true, stopEnterMs: 4500 });

// Tolerate the older spec format too.
eq('parseStatus accepts disarmed token',
  parseStatus('state=MENU ch=1 boots=3 pages=0/131008 samples=0 fails=0 ms=12345 stop=disarmed').stopArmed,
  false);
eq('parseStatus accepts armed/<ms> token',
  parseStatus('state=FULL ch=1 boots=1 pages=8/8 samples=0 fails=0 ms=10000 stop=armed/4500').stopEnterMs,
  4500);

eq('parseStatus malformed returns null', parseStatus('garbage'), null);
eq('parseStatus empty returns null', parseStatus(''), null);

eq('formatDuration 0', formatDuration(0), '0s');
eq('formatDuration 5000', formatDuration(5000), '5s');
eq('formatDuration 65000', formatDuration(65000), '1m 5s');
eq('formatDuration 3725000', formatDuration(3725000), '1h 2m 5s');

// parseCsvLine
eq('parseCsvLine 1ch', parseCsvLine('195;'), [195]);
eq('parseCsvLine 2ch', parseCsvLine('195,-390;'), [195, -390]);
eq('parseCsvLine empty line', parseCsvLine(''), null);
eq('parseCsvLine missing semicolon', parseCsvLine('195'), null);
eq('parseCsvLine negative', parseCsvLine('-1755;'), [-1755]);

// dfu module shape — confirms the public surface the app depends on.
assert('dfu.uploadFirmware exists', typeof dfu.uploadFirmware === 'function');
assert('dfu.requestBootloader exists', typeof dfu.requestBootloader === 'function');
assert('dfu.findExistingBootloader exists', typeof dfu.findExistingBootloader === 'function');
assert('dfu.isSupported returns boolean', typeof dfu.isSupported() === 'boolean');

// release.findDfuAsset
eq('findDfuAsset picks neury-dfu-v1.bin',
   release.findDfuAsset({ assets: [{ name: 'neury.elf' }, { name: 'neury-dfu-v1.bin' }] })?.name,
   'neury-dfu-v1.bin');
eq('findDfuAsset picks neurydfu.bin (no dash)',
   release.findDfuAsset({ assets: [{ name: 'neurydfu.bin' }] })?.name,
   'neurydfu.bin');
eq('findDfuAsset returns null when no match',
   release.findDfuAsset({ assets: [{ name: 'neury.elf' }, { name: 'neury.bin' }] }),
   null);
eq('findDfuAsset on null release returns null',
   release.findDfuAsset(null),
   null);
eq('findDfuAsset on empty assets returns null',
   release.findDfuAsset({ assets: [] }),
   null);

// last-flashed-tag round-trip
const _prev = release.getLastFlashedTag();
release.setLastFlashedTag('v0.0.test');
eq('setLastFlashedTag round-trip', release.getLastFlashedTag(), 'v0.0.test');
release.setLastFlashedTag(_prev || '');
if (!_prev) try { localStorage.removeItem('neury.lastFlashedTag'); } catch {}

document.title = failed ? `FAIL (${failed})` : `PASS (${passed})`;
