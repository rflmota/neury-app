// WebSerial wrapper. Only module that touches SerialPort objects.

const ENCODER = new TextEncoder();
const DECODER = new TextDecoder();

export async function connect() {
  const port = await navigator.serial.requestPort();
  await port.open({ baudRate: 9600, dataBits: 8, stopBits: 1, parity: 'none', flowControl: 'none' });
  const info = port.getInfo();
  return { port, info };
}

export async function disconnect(port) {
  try { await port.close(); } catch {}
}

export async function sendByte(port, b) {
  const writer = port.writable.getWriter();
  try {
    await writer.write(ENCODER.encode(b));
  } finally {
    writer.releaseLock();
  }
}

export async function readLine(port, { timeoutMs = 2000 } = {}) {
  const reader = port.readable.getReader();
  let buf = '';
  const deadline = performance.now() + timeoutMs;
  try {
    while (true) {
      const remaining = deadline - performance.now();
      if (remaining <= 0) throw new Error('readLine timeout');
      const { value, done } = await Promise.race([
        reader.read(),
        new Promise(r => setTimeout(() => r({ value: undefined, done: false }), remaining)),
      ]);
      if (done) throw new Error('port closed');
      if (value === undefined) throw new Error('readLine timeout');
      buf += DECODER.decode(value, { stream: true });
      const nl = buf.indexOf('\n');
      if (nl >= 0) return buf.slice(0, nl);
    }
  } finally {
    reader.releaseLock();
  }
}

export async function streamLines(port, onLine, { endToken = 'EOF', stallMs = 5000 } = {}) {
  const reader = port.readable.getReader();
  let buf = '';
  let lastData = performance.now();
  try {
    while (true) {
      const remaining = stallMs - (performance.now() - lastData);
      if (remaining <= 0) throw new Error('stream stalled');
      const { value, done } = await Promise.race([
        reader.read(),
        new Promise(r => setTimeout(() => r({ value: undefined, done: false }), remaining)),
      ]);
      if (done) return;
      if (value === undefined) throw new Error('stream stalled');
      lastData = performance.now();
      buf += DECODER.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        if (line === endToken) return;
        onLine(line);
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// 1200bps + DTR-low pulse — maple bootloader's wake-up trick.
// Closes the existing port, reopens at 1200, asserts/deasserts DTR, closes.
// After this returns, the device re-enumerates as 1eaf:0003 in ~1-2s.
export async function triggerDfuReboot(port) {
  try { await port.close(); } catch {}
  await port.open({ baudRate: 1200, dataBits: 8, stopBits: 1, parity: 'none', flowControl: 'none' });
  try {
    await port.setSignals({ dataTerminalReady: true });
    await new Promise(r => setTimeout(r, 100));
    await port.setSignals({ dataTerminalReady: false });
    await new Promise(r => setTimeout(r, 200));
  } finally {
    try { await port.close(); } catch {}
  }
}
