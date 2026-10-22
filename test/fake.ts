import { Logger } from '../src/lib/logger';

// A fake Logger port answering each write with a scripted reply, delivered in small chunks.
export function fakeLogger(replies: Record<string, string | Uint8Array>, chunk = 5) {
  let ctrl!: ReadableStreamDefaultController<Uint8Array>;
  const readable = new ReadableStream<Uint8Array>({ start: (c) => void (ctrl = c) });
  const writable = new WritableStream<Uint8Array>({
    write(bytes) {
      const reply = replies[new TextDecoder().decode(bytes)] ?? '';
      const out = typeof reply === 'string' ? new TextEncoder().encode(reply) : reply;
      for (let i = 0; i < out.length; i += chunk) ctrl.enqueue(out.slice(i, i + chunk));
    },
  });
  return new Logger({ readable, writable } as unknown as SerialPort);
}
