import { describe, expect, it } from 'vitest';
import { newer, pickRelease } from '../src/lib/release';
import { download } from '../src/lib/dfu';

describe('release', () => {
  it('compares versions numerically', () => {
    expect(newer('1.0.10', '1.0.9')).toBe(true);
    expect(newer('1.0.0', '1.0.0')).toBe(false);
    expect(newer('0.9.0', '1.0.0')).toBe(false);
  });

  it('picks the newest release of the protocol major', () => {
    const tags = ['fw-v1.0.0', 'fw-v1.2.0', 'fw-v1.10.1', 'fw-v2.0.0', 'v1.99.0', 'fw-v1.3'];
    expect(pickRelease(tags, 1)).toEqual({ version: '1.10.1', file: 'neury-fw-1.10.1.bin' });
    expect(pickRelease(tags, 3)).toBeNull();
  });
});

// A fake dapboot: busy once per block, then drops off the bus during manifest.
function fakeDapboot() {
  const blocks: number[][] = [];
  let state = 2;
  const status = (s: number) => ({ data: new DataView(new Uint8Array([0, 1, 0, 0, s, 0]).buffer) });
  const device = {
    configuration: {},
    open: async () => {},
    claimInterface: async () => {},
    selectAlternateInterface: async () => {},
    close: async () => {},
    controlTransferOut: async (setup: USBControlTransferParameters, data: Uint8Array) => {
      if (data.length) blocks[setup.value] = [...data];
      state = data.length ? 4 : 7;
    },
    controlTransferIn: async () => {
      if (state === 7) throw new Error('device disconnected');
      const s = status(state);
      if (state === 4) state = 5;
      return s;
    },
  };
  return { device: device as unknown as USBDevice, blocks };
}

describe('dfu', () => {
  it('downloads in 1024-byte blocks and treats the manifest reset as success', async () => {
    const { device, blocks } = fakeDapboot();
    const image = Uint8Array.from({ length: 2500 }, (_, i) => i & 0xff);
    const progress: number[] = [];
    await download(device, image, (n) => progress.push(n));
    expect(blocks.map((b) => b.length)).toEqual([1024, 1024, 452]);
    expect(blocks.flat()).toEqual([...image]);
    expect(progress).toEqual([1024, 2048, 2500]);
  });
});
