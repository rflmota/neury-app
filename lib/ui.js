import { formatDuration } from './status.js';

function row(label, value, valueClass) {
  const r = document.createElement('div');
  r.className = 'status-row';
  const l = document.createElement('span');
  l.textContent = label;
  const v = document.createElement('span');
  v.textContent = value;
  if (valueClass) v.className = valueClass;
  r.append(l, v);
  return r;
}

export function renderStatus(el, status) {
  el.textContent = '';
  if (!status) {
    const empty = document.createElement('div');
    empty.className = 'status-empty';
    empty.textContent = 'Not connected';
    el.appendChild(empty);
    return;
  }
  const pct = status.pagesCap ? Math.round(100 * status.pagesCur / status.pagesCap) : 0;
  el.appendChild(row('State', status.state, `status-state status-${status.state.toLowerCase()}`));
  el.appendChild(row('Channels', String(status.ch)));
  el.appendChild(row('Pages', `${status.pagesCur} / ${status.pagesCap} (${pct}%)`));
  el.appendChild(row('Samples', status.samples.toLocaleString()));
  el.appendChild(row('Boots', String(status.boots)));
  el.appendChild(row('Uptime', formatDuration(status.uptimeMs)));
  el.appendChild(row('Fails', String(status.fails)));
  if (status.stopArmed) el.appendChild(row('STOP', `armed in ${status.stopEnterMs}ms`));
}

export function setControlsForState(state, ch) {
  const btns = {
    start:    document.getElementById('btn-start'),
    resetCtr: document.getElementById('btn-reset-ctr'),
    erase:    document.getElementById('btn-erase'),
    mcuReset: document.getElementById('btn-mcu-reset'),
  };
  const chRadios = document.querySelectorAll('input[name=ch]');

  if (!state) {
    for (const b of Object.values(btns)) if (b) b.disabled = true;
    chRadios.forEach(r => { r.disabled = true; });
    return;
  }

  const inRec = state === 'REC';
  if (btns.start)    btns.start.disabled    = inRec;
  if (btns.resetCtr) btns.resetCtr.disabled = inRec;
  if (btns.erase)    btns.erase.disabled    = inRec;
  if (btns.mcuReset) btns.mcuReset.disabled = false;

  chRadios.forEach(r => {
    r.disabled = inRec;
    r.checked = Number(r.value) === ch;
  });
}

export function toast(message, level = 'info') {
  const el = document.createElement('div');
  el.className = `toast toast-${level}`;
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}
