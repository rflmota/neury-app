import { streamLines, sendByte } from './cdc.js';

export function parseCsvLine(line) {
  if (typeof line !== 'string' || !line.endsWith(';')) return null;
  const body = line.slice(0, -1);
  if (body === '') return null;
  const parts = body.split(',');
  const nums = parts.map(Number);
  if (nums.some(n => Number.isNaN(n))) return null;
  return nums;
}

export async function exportCsv(port, { onProgress } = {}) {
  const handle = await window.showSaveFilePicker({
    suggestedName: `neury-${new Date().toISOString().replace(/[:.]/g,'-')}.csv`,
    types: [{ description: 'CSV', accept: { 'text/csv': ['.csv'] } }],
  });
  const writable = await handle.createWritable();
  let samples = 0, bytes = 0;

  try {
    await sendByte(port, 'e');
    const pending = [];
    await streamLines(port, (line) => {
      const parsed = parseCsvLine(line);
      if (!parsed) return;
      const out = line + '\n';
      pending.push(writable.write(out));
      samples++;
      bytes += out.length;
      if (onProgress && samples % 100 === 0) onProgress({ samples, bytes });
    }, { endToken: 'EOF', stallMs: 5000 });
    await Promise.all(pending);
  } finally {
    try { await writable.close(); } catch {}
  }
  return { samples, bytes };
}
