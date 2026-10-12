// Reply grammar of docs/protocol.md: lines ending in `OK [k=v ...]` or `ERR <token> [k=v ...]`.

export type Kv = Record<string, string>;

export type Reply = { ok: true; kv: Kv; lines: string[] } | { ok: false; err: string; kv: Kv };

export type Run = (letter: string) => Promise<Reply | null>;

export function isFinal(line: string): boolean {
  return line === 'OK' || line.startsWith('OK ') || line.startsWith('ERR ');
}

function parseKv(words: string[]): Kv {
  return Object.fromEntries(words.map((w) => w.split('=', 2)));
}

export function parseReply(lines: string[]): Reply {
  const [head, ...words] = lines[lines.length - 1].split(' ');
  if (head === 'ERR') return { ok: false, err: words[0], kv: parseKv(words.slice(1)) };
  return { ok: true, kv: parseKv(words), lines: lines.slice(0, -1) };
}
