// Export via `b` (docs/protocol.md): raw Pages converted to a CSV of µV in the browser.
import { parseReply } from './reply';
import type { Logger } from './logger';

const PAGE_BYTES = 2048;
const HEADER_BYTES = 8;
const RATE_HZ = 200;
const UV_PER_LSB_X1000 = 195;
const IDLE_TIMEOUT_MS = 5_000;

const iso = (start: number) => (start ? new Date(start * 1000).toISOString() : 'unknown');

// CSV rows for one Page, preceded by a comment line where a new Segment begins.
export function csvConverter(ch: number) {
  let sample = 0;
  let segment = -1;
  return {
    header: ch === 1 ? 'sample_s,ch0_uV\n' : 'sample_s,ch0_uV,ch1_uV\n',
    page(page: Uint8Array): string {
      const view = new DataView(page.buffer, page.byteOffset, page.byteLength);
      let out = '';
      const seg = view.getUint16(2, true);
      if (seg !== segment) {
        segment = seg;
        out += `# segment ${seg} first_sample_s=${sample / RATE_HZ} start=${iso(view.getUint32(4, true))}\n`;
      }
      for (let off = HEADER_BYTES; off < PAGE_BYTES; off += 2 * ch) {
        out += sample++ / RATE_HZ;
        for (let c = 0; c < ch; c++) out += ',' + (view.getInt16(off + 2 * c, true) * UV_PER_LSB_X1000) / 1000;
        out += '\n';
      }
      return out;
    },
  };
}

// Streams `b` into write(); throws Error(<ERR token>) if the Logger refuses.
export function exportCsv(
  logger: Logger,
  write: (text: string) => Promise<void>,
  progress: (pages: number, total: number) => void,
): Promise<void> {
  return logger.stream('b', IDLE_TIMEOUT_MS, async (io) => {
    const magic = new TextDecoder().decode(await io.read(2));
    if (magic !== 'NB') {
      const r = parseReply([magic + (await io.readLine())]);
      throw new Error(r.ok ? 'unknown' : r.err);
    }
    const head = await io.read(5);
    const total = new DataView(head.buffer, head.byteOffset).getUint32(1);
    const csv = csvConverter(head[0]);
    await write(csv.header);
    for (let p = 0; p < total; p++) {
      await write(csv.page(await io.read(PAGE_BYTES)));
      progress(p + 1, total);
    }
    await io.readLine(); // EOF
  });
}
