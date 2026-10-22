// `b` dump recorded from Target B (test build, 8-Page capture area): 2 channels,
// Segment 0 on Pages 0-1 and Segment 1 on Pages 2-7, clock unset. The mock INTAN
// ramps ch0 = i and ch1 = i + 0x8000 (int16) from 0 in each Segment.
import { describe, expect, it } from 'vitest';
import dumpUrl from './fixtures/target-b-2seg.bin?inline';
import { csvConverter, exportCsv } from '../src/lib/export';
import { fakeLogger } from './fake';

const dump = Uint8Array.from(atob(dumpUrl.split(',')[1]), (c) => c.charCodeAt(0));
const PAGES = 8;
const PAIRS = 510;

const s16 = (u: number) => ((u & 0xffff) << 16) >> 16;
const uv = (raw: number) => (raw * 195) / 1000;
const page = (p: number) => dump.subarray(7 + p * 2048, 7 + (p + 1) * 2048);

function convert() {
  const csv = csvConverter(dump[2]);
  let text = csv.header;
  for (let p = 0; p < PAGES; p++) text += csv.page(page(p));
  return text;
}

describe('export', () => {
  it('writes a column header and one comment per Segment', () => {
    const lines = convert().trimEnd().split('\n');
    expect(lines[0]).toBe('sample_s,ch0_uV,ch1_uV');
    expect(lines.filter((l) => l.startsWith('#'))).toEqual([
      '# segment 0 first_sample_s=0 start=unknown',
      '# segment 1 first_sample_s=5.1 start=unknown',
    ]);
    expect(lines[1 + 1 + 2 * PAIRS]).toBe('# segment 1 first_sample_s=5.1 start=unknown');
  });

  it('strips Page headers, keeps sample_s gapless and converts to µV', () => {
    const rows = convert()
      .split('\n')
      .filter((l) => /^\d/.test(l))
      .map((l) => l.split(',').map(Number));
    expect(rows).toHaveLength(PAGES * PAIRS);
    const segmentStart = (i: number) => (i < 2 * PAIRS ? 0 : 2 * PAIRS);
    const bad = rows.filter(([t, ch0, ch1], i) => {
      const k = i - segmentStart(i);
      return t !== i / 200 || ch0 !== uv(s16(k)) || ch1 !== uv(s16(k + 0x8000));
    });
    expect(bad).toEqual([]);
    expect(rows[0]).toEqual([0, 0, -6389.76]);
  });

  it('writes a known Segment start as ISO time', () => {
    const p = page(0).slice();
    new DataView(p.buffer).setUint32(4, 1760000000, true);
    expect(csvConverter(2).page(p).split('\n')[0]).toBe(
      '# segment 0 first_sample_s=0 start=2025-10-09T08:53:20.000Z',
    );
  });

  it('streams b from the Logger with progress, consuming EOF', async () => {
    const logger = fakeLogger({ b: dump, v: 'OK fw=1.0.0 proto=1\n' }, 64);
    let text = '';
    const progress: number[] = [];
    await exportCsv(logger, async (t) => void (text += t), (n, total) => progress.push(n / total));
    expect(text).toBe(convert());
    expect(progress).toHaveLength(PAGES);
    expect(progress.at(-1)).toBe(1);
    expect(await logger.cmd('v')).toEqual({ ok: true, kv: { fw: '1.0.0', proto: '1' }, lines: [] });
  });

  it('reports the ERR token when the Logger refuses', async () => {
    await expect(exportCsv(fakeLogger({ b: 'ERR nand\n' }), async () => {}, () => {})).rejects.toThrow('nand');
  });
});
