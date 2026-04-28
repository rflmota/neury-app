export function parseStatus(line) {
  if (typeof line !== 'string' || !line.startsWith('state=')) return null;
  const kv = {};
  for (const tok of line.trim().split(/\s+/)) {
    const eq = tok.indexOf('=');
    if (eq < 0) return null;
    kv[tok.slice(0, eq)] = tok.slice(eq + 1);
  }
  const required = ['state','ch','boots','pages','samples','fails','ms','stop'];
  for (const k of required) if (!(k in kv)) return null;

  const pagesParts = kv.pages.split('/');
  if (pagesParts.length !== 2) return null;

  // Firmware format is `stop=<armed:0|1>/<full_enter_ms>`.
  // Older spec used `disarmed` / `armed/<ms>`; tolerate both shapes.
  let stopArmed, stopEnterMs;
  if (kv.stop === 'disarmed') {
    stopArmed = false; stopEnterMs = null;
  } else if (kv.stop.startsWith('armed')) {
    stopArmed = true;
    stopEnterMs = kv.stop.includes('/') ? Number(kv.stop.split('/')[1]) : null;
  } else {
    const parts = kv.stop.split('/');
    stopArmed = parts[0] === '1';
    stopEnterMs = stopArmed && parts.length === 2 ? Number(parts[1]) : null;
  }

  const state = kv.state;
  if (!['MENU','REC','FULL'].includes(state)) return null;

  const ch = Number(kv.ch);
  if (ch !== 1 && ch !== 2) return null;

  return {
    state,
    ch,
    boots: Number(kv.boots),
    pagesCur: Number(pagesParts[0]),
    pagesCap: Number(pagesParts[1]),
    samples: Number(kv.samples),
    fails: Number(kv.fails),
    uptimeMs: Number(kv.ms),
    stopArmed,
    stopEnterMs,
  };
}

export function formatDuration(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h) return `${h}h ${m}m ${sec}s`;
  if (m) return `${m}m ${sec}s`;
  return `${sec}s`;
}
