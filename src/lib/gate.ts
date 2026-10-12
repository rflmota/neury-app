import type { Reply } from './reply';

export const PROTO = 1;

export type Gate = 'ok' | 'old' | 'newer';

// Firmware without `proto` in its `v` reply (or no reply at all) predates this App.
export function gate(v: Reply | null): Gate {
  const proto = v?.ok ? Number(v.kv.proto) : 0;
  if (!proto) return 'old';
  return proto > PROTO ? 'newer' : 'ok';
}
