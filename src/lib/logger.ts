import { isFinal, parseReply, type Reply } from './reply';

export const USB_FILTER = { usbVendorId: 0x0483, usbProductId: 0x5740 };

// Idle timeout per command: how long to wait for the next bytes of its reply.
const TIMEOUT_MS: Record<string, number> = { a: 120_000, t: 120_000, x: 120_000, s: 1_000 };
const DEFAULT_TIMEOUT_MS = 3_000;

export interface StreamIo {
  readLine(): Promise<string>;
  read(n: number): Promise<Uint8Array>;
}

export async function grantedPorts(): Promise<SerialPort[]> {
  const ports = await navigator.serial.getPorts();
  return ports.filter((p) => {
    const info = p.getInfo();
    return info.usbVendorId === USB_FILTER.usbVendorId && info.usbProductId === USB_FILTER.usbProductId;
  });
}

export function requestPort(): Promise<SerialPort> {
  return navigator.serial.requestPort({ filters: [USB_FILTER] });
}

export class Logger {
  private reader: ReadableStreamDefaultReader<Uint8Array>;
  private writer: WritableStreamDefaultWriter<Uint8Array>;
  private buf = new Uint8Array(0);
  private pending: Promise<ReadableStreamReadResult<Uint8Array>> | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(readonly port: SerialPort) {
    this.reader = port.readable!.getReader();
    this.writer = port.writable!.getWriter();
  }

  static async open(port: SerialPort): Promise<Logger> {
    await port.open({ baudRate: 115200 });
    return new Logger(port);
  }

  async close() {
    await this.reader.cancel();
    this.reader.releaseLock();
    this.writer.releaseLock();
    await this.port.close();
  }

  cmd(letter: string, arg?: number): Promise<Reply> {
    const text = arg === undefined ? letter : `${letter}${arg}\n`;
    return this.exchange(text, TIMEOUT_MS[letter] ?? DEFAULT_TIMEOUT_MS, async (io) => {
      const lines = [await io.readLine()];
      while (!isFinal(lines[lines.length - 1])) lines.push(await io.readLine());
      return parseReply(lines);
    });
  }

  // Streaming commands (e, E, b): consume reads the reply up to its EOF.
  stream<T>(letter: string, timeoutMs: number, consume: (io: StreamIo) => Promise<T>): Promise<T> {
    return this.exchange(letter, timeoutMs, consume);
  }

  // One command at a time: the status poll and user actions share the port.
  private exchange<T>(text: string, timeoutMs: number, consume: (io: StreamIo) => Promise<T>): Promise<T> {
    const io: StreamIo = {
      readLine: () => this.readLine(timeoutMs),
      read: (n) => this.read(n, timeoutMs),
    };
    const run = this.queue.then(async () => {
      this.buf = new Uint8Array(0);
      await this.writer.write(new TextEncoder().encode(text));
      return consume(io);
    });
    this.queue = run.catch(() => {});
    return run;
  }

  private async readLine(timeoutMs: number): Promise<string> {
    let i;
    while ((i = this.buf.indexOf(10)) < 0) await this.fill(timeoutMs);
    const line = new TextDecoder().decode(this.buf.subarray(0, i));
    this.buf = this.buf.slice(i + 1);
    return line;
  }

  private async read(n: number, timeoutMs: number): Promise<Uint8Array> {
    while (this.buf.length < n) await this.fill(timeoutMs);
    const out = this.buf.slice(0, n);
    this.buf = this.buf.slice(n);
    return out;
  }

  // A read left pending by a timeout is kept and awaited again, never dropped.
  private async fill(timeoutMs: number) {
    this.pending ??= this.reader.read();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<null>((resolve) => (timer = setTimeout(() => resolve(null), timeoutMs)));
    const result = await Promise.race([this.pending, timeout]);
    clearTimeout(timer);
    if (!result) throw new Error('timeout');
    this.pending = null;
    if (result.done) throw new Error('closed');
    const merged = new Uint8Array(this.buf.length + result.value.length);
    merged.set(this.buf);
    merged.set(result.value, this.buf.length);
    this.buf = merged;
  }
}
