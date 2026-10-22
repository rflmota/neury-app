// Transcripts recorded from Target B (HAL test build, 8-Page capture area).
import { describe, expect, it, vi } from 'vitest';
import transcripts from './fixtures/target-b.json';
import { parseReply } from '../src/lib/reply';
import { hoursLeft, parseStatus, type Status } from '../src/lib/status';
import { gate } from '../src/lib/gate';
import { clockSetter } from '../src/lib/clock';
import { fakeLogger } from './fake';

const reply = (cmd: string, note = '') =>
  parseReply(transcripts.find((t) => t.cmd === cmd && t.note === note)!.lines);

describe('reply', () => {
  it('parses OK with key=values', () => {
    expect(reply('2', 'set 2ch with pages=0')).toEqual({ ok: true, kv: { ch: '2' }, lines: [] });
  });

  it('parses ERR tokens', () => {
    expect(reply('1', 'refused while recording')).toEqual({ ok: false, err: 'rec', kv: {} });
    expect(reply('2', 'refused with pages>0')).toEqual({ ok: false, err: 'notempty', kv: {} });
    expect(reply('Z', 'unknown letter')).toEqual({ ok: false, err: 'unknown', kv: {} });
  });

  it('keeps the lines before OK', () => {
    const help = reply('?');
    expect(help.ok && help.lines).toHaveLength(14);
  });

  it('parses ERR with key=values', () => {
    expect(parseReply(['ERR fail page=12 efail=1 pfail=0 ecc_unc=0'])).toEqual({
      ok: false,
      err: 'fail',
      kv: { page: '12', efail: '1', pfail: '0', ecc_unc: '0' },
    });
  });
});

describe('status', () => {
  it('parses each state', () => {
    for (const [note, state] of [['', 'menu'], ['status while recording', 'rec'], ['status when full', 'full']]) {
      expect(parseStatus(reply('s', note).kv).state).toBe(state);
    }
  });

  it('reads pages, capacity and hardware', () => {
    const s = parseStatus(reply('s', 'status when full').kv);
    expect(s).toMatchObject({ pages: 8, cap: 8, ch: 1, nand: 'W25M02GV', nandId: 'EFAB21', intan: false, rtc: false });
    expect(hoursLeft(s)).toBe(0);
  });

  it('computes hours left from free Pages and channels', () => {
    const s = parseStatus(reply('s').kv);
    expect(hoursLeft({ ...s, pages: 0, cap: 131072, ch: 1 })).toBeCloseTo(185.7, 1);
    expect(hoursLeft({ ...s, pages: 0, cap: 131072, ch: 2 })).toBeCloseTo(92.8, 1);
  });
});

describe('gate', () => {
  it('accepts proto 1', () => {
    expect(gate(reply('v'))).toBe('ok');
  });

  it('flags old firmware and newer protocols', () => {
    expect(gate(null)).toBe('old');
    expect(gate(parseReply(['ERR unknown']))).toBe('old');
    expect(gate(parseReply(['OK fw=0.9.0']))).toBe('old');
    expect(gate(parseReply(['OK fw=2.0.0 proto=2']))).toBe('newer');
  });
});

describe('Logger', () => {
  it('reassembles chunked replies, one command at a time', async () => {
    const replies = Object.fromEntries(transcripts.slice(0, 9).map((t) => [t.cmd, t.lines.join('\n') + '\n']));
    const logger = fakeLogger(replies);
    const got = await Promise.all(transcripts.slice(0, 9).map((t) => logger.cmd(t.cmd)));
    expect(got).toEqual(transcripts.slice(0, 9).map((t) => parseReply(t.lines)));
  });

  it('sends arguments terminated by a newline', async () => {
    const logger = fakeLogger({ 'u1760000000\n': 'OK time=1760000000\n' });
    expect(await logger.cmd('u', 1760000000)).toEqual({ ok: true, kv: { time: '1760000000' }, lines: [] });
  });

  it('times out when the Logger is silent', async () => {
    await expect(fakeLogger({}).cmd('s')).rejects.toThrow('timeout');
  });
});

describe('clock', () => {
  it('sets the clock on the first rtc=1 in Menu mode, retrying after ERR rtc', async () => {
    vi.setSystemTime(1760000000_500);
    const menu = parseStatus(reply('s').kv);
    const rec = parseStatus(reply('s', 'status while recording').kv);
    const answers = [['ERR rtc'], ['OK time=1760000000']];
    const sent: string[] = [];
    const setClock = clockSetter({
      cmd: async (letter, arg) => {
        sent.push(`${letter}${arg}`);
        return parseReply(answers.shift()!);
      },
    });
    // Each status poll and how many `u` have been sent after it.
    const polls: [Status, number][] = [
      [menu, 0],
      [{ ...rec, rtc: true }, 0],
      [{ ...menu, rtc: true }, 1],
      [menu, 1],
      [{ ...menu, rtc: true }, 2],
      [{ ...menu, rtc: true }, 2],
    ];
    for (const [s, n] of polls) {
      await setClock(s);
      expect(sent).toHaveLength(n);
    }
    expect(sent).toEqual(['u1760000000', 'u1760000000']);
    vi.useRealTimers();
  });
});
