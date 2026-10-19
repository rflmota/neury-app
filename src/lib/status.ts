import type { Kv } from './reply';

export type State = 'menu' | 'rec' | 'full';

export interface Status {
  fw: string;
  proto: number;
  state: State;
  ch: number;
  nand: string;
  nandId: string;
  intan: boolean;
  pages: number;
  cap: number;
  rtc: boolean;
  time: number;
  start: number;
  efail: number;
  pfail: number;
  eccCorr: number;
  eccUnc: number;
  busyTo: number;
  overrun: number;
}

const RATE_HZ = 200;
const PAGE_SAMPLE_BYTES = 2040; // 2048-byte Page minus its 8-byte header
const SAMPLE_BYTES = 2;

export function parseStatus(kv: Kv): Status {
  const [pages, cap] = kv.pages.split('/').map(Number);
  return {
    fw: kv.fw,
    proto: Number(kv.proto),
    state: kv.state as State,
    ch: Number(kv.ch),
    nand: kv.nand,
    nandId: kv.nand_id,
    intan: kv.intan === '1',
    pages,
    cap,
    rtc: kv.rtc === '1',
    time: Number(kv.time),
    start: Number(kv.start),
    efail: Number(kv.efail),
    pfail: Number(kv.pfail),
    eccCorr: Number(kv.ecc_corr),
    eccUnc: Number(kv.ecc_unc),
    busyTo: Number(kv.busy_to),
    overrun: Number(kv.overrun),
  };
}

export function hoursLeft(s: Status): number {
  return ((s.cap - s.pages) * PAGE_SAMPLE_BYTES) / (SAMPLE_BYTES * s.ch * RATE_HZ * 3600);
}
