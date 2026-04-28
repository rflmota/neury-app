import * as cdc from './lib/cdc.js';
import * as dfu from './lib/dfu.js';
import * as release from './lib/release.js';
import { parseStatus } from './lib/status.js';
import { renderStatus, setControlsForState, toast } from './lib/ui.js';
import { exportCsv } from './lib/export.js';

const POLL_MS = 1500;
const SLEEPING_THRESHOLD = 3;

const state = {
  port: null,
  serialBusy: false,
  status: null,
  pollTimer: null,
  missedPolls: 0,
  demoMode: false,
};

const dom = {
  btnConnect: document.getElementById('btn-connect'),
  btnDisconnect: document.getElementById('btn-disconnect'),
  btnInstall: document.getElementById('btn-install'),
  devicePill: document.getElementById('device-pill'),
  emptyState: document.getElementById('empty-state'),
  statusPanel: document.getElementById('status-panel'),
  statusContent: document.getElementById('status-content'),
  capacityWrap: document.getElementById('capacity-wrap'),
  capacityBar: document.getElementById('capacity-bar'),
  capacityText: document.getElementById('capacity-text'),
  sleepingBanner: document.getElementById('sleeping-banner'),
  controls: document.getElementById('controls'),
  exportSection: document.getElementById('export-section'),
  dfuSection: document.getElementById('dfu-section'),
  wsSupport: document.getElementById('ws-support'),
};

function setState(patch) {
  Object.assign(state, patch);
  render();
}

function render() {
  renderStatus(dom.statusContent, state.status);
  setControlsForState(state.status?.state, state.status?.ch);

  const connected = !!state.port || state.demoMode;
  dom.btnConnect.classList.toggle('hidden', connected);
  dom.btnDisconnect.classList.toggle('hidden', !connected);
  dom.emptyState.classList.toggle('hidden', connected);
  dom.statusPanel.classList.toggle('hidden', !connected);
  dom.controls.classList.toggle('hidden', !connected);
  dom.exportSection.classList.toggle('hidden', !connected);
  dom.dfuSection.classList.toggle('hidden', !connected);
  dom.sleepingBanner.classList.toggle('hidden', state.missedPolls < SLEEPING_THRESHOLD);

  if (state.demoMode) {
    dom.devicePill.textContent = `DEMO · ${state.status?.state ?? 'MENU'}`;
    dom.devicePill.className = 'pill pill-warn';
  } else if (connected && state.status) {
    dom.devicePill.textContent = `${state.status.state} · ch${state.status.ch}`;
    dom.devicePill.className = `pill pill-${state.status.state === 'REC' ? 'warn' : 'on'}`;
  } else if (connected) {
    dom.devicePill.textContent = 'Connecting…';
    dom.devicePill.className = 'pill pill-on';
  } else {
    dom.devicePill.textContent = 'Disconnected';
    dom.devicePill.className = 'pill pill-off';
  }

  if (connected && state.status?.pagesCap) {
    const pct = Math.round(100 * state.status.pagesCur / state.status.pagesCap);
    dom.capacityBar.value = pct;
    dom.capacityText.textContent = `${state.status.pagesCur.toLocaleString()} / ${state.status.pagesCap.toLocaleString()} pages (${pct}%)`;
    dom.capacityWrap.classList.remove('hidden');
  } else {
    dom.capacityWrap.classList.add('hidden');
  }
}

async function pollTick() {
  if (!state.port || state.serialBusy) return;
  state.serialBusy = true;
  try {
    await cdc.sendByte(state.port, 's');
    const line = await cdc.readLine(state.port, { timeoutMs: 2000 });
    const parsed = parseStatus(line);
    if (parsed) {
      setState({ status: parsed, missedPolls: 0 });
    }
  } catch (err) {
    setState({ missedPolls: state.missedPolls + 1 });
    if (state.missedPolls >= SLEEPING_THRESHOLD) stopPolling();
  } finally {
    state.serialBusy = false;
  }
}

function startPolling() {
  if (state.pollTimer) return;
  state.pollTimer = setInterval(pollTick, POLL_MS);
  pollTick();
}

function stopPolling() {
  if (state.pollTimer) clearInterval(state.pollTimer);
  state.pollTimer = null;
}

async function handleConnect() {
  try {
    const { port } = await cdc.connect();
    setState({ port, missedPolls: 0 });
    startPolling();
    toast('Connected');
  } catch (err) {
    if (err.name === 'NotFoundError') return;
    toast(`Connect failed: ${err.message}`, 'error');
  }
}

async function handleDisconnect() {
  stopPolling();
  if (state.port) await cdc.disconnect(state.port);
  setState({ port: null, status: null, missedPolls: 0, demoMode: false });
  toast('Disconnected');
}

function enterDemoMode() {
  setState({
    demoMode: true,
    status: {
      state: 'MENU',
      ch: 1,
      boots: 7,
      pagesCur: 1234,
      pagesCap: 131008,
      samples: 1263616,
      fails: 0,
      uptimeMs: 7530000,
      stopArmed: false,
      stopEnterMs: null,
    },
    missedPolls: 0,
  });
  toast('Demo mode — buttons are no-ops');
}

const confirmModal = document.getElementById('confirm-modal');
const confirmMessage = document.getElementById('confirm-message');

function confirmDialog(message) {
  confirmMessage.textContent = message;
  confirmModal.showModal();
  return new Promise(resolve => {
    confirmModal.addEventListener('close', () => resolve(confirmModal.returnValue === 'ok'), { once: true });
  });
}

async function sendCommand(cmd, { expectLine = true } = {}) {
  if (state.demoMode) { toast(`(demo) would send '${cmd}'`); return 'OK demo'; }
  if (!state.port || state.serialBusy) { toast('Busy, try again', 'warn'); return null; }
  state.serialBusy = true;
  try {
    await cdc.sendByte(state.port, cmd);
    if (!expectLine) return null;
    return await cdc.readLine(state.port, { timeoutMs: 2000 });
  } catch (err) {
    toast(`Command failed: ${err.message}`, 'error');
    return null;
  } finally {
    state.serialBusy = false;
    pollTick();
  }
}

async function handleStart() {
  const ch = document.querySelector('input[name=ch]:checked')?.value;
  if (ch && ch !== String(state.status?.ch)) {
    const resp = await sendCommand(ch);
    if (!resp || !resp.startsWith('OK')) return;
  }
  if (!(await confirmDialog('Start recording? This will erase the capture area.'))) return;
  const resp = await sendCommand('x');
  if (resp) toast(resp);
}

async function handleResetCtr() {
  if (!(await confirmDialog('Reset page counter without erasing NAND?'))) return;
  const resp = await sendCommand('r');
  if (resp) toast(resp);
}

async function handleErase() {
  if (!(await confirmDialog('Erase all captured data? This cannot be undone.'))) return;
  const resp = await sendCommand('a');
  if (resp) toast(resp);
}

async function handleMcuReset() {
  if (!(await confirmDialog('Reset the MCU? Device will re-enumerate.'))) return;
  await sendCommand('R', { expectLine: false });
  await handleDisconnect();
  toast('MCU reset — reconnect when ready');
}

document.getElementById('btn-start').addEventListener('click', handleStart);
document.getElementById('btn-reset-ctr').addEventListener('click', handleResetCtr);
document.getElementById('btn-erase').addEventListener('click', handleErase);
document.getElementById('btn-mcu-reset').addEventListener('click', handleMcuReset);

const exportProgress = document.getElementById('export-progress');
const exportBar = document.getElementById('export-bar');
const exportLabel = document.getElementById('export-label');

async function handleExport() {
  if (state.demoMode) { toast('(demo) would stream CSV to disk'); return; }
  if (!state.port || state.serialBusy) { toast('Busy, try again', 'warn'); return; }
  state.serialBusy = true;
  stopPolling();
  exportProgress.classList.remove('hidden');
  exportBar.value = 0;
  exportLabel.textContent = '0 samples';

  const totalPages = state.status?.pagesCur || 0;
  const samplesPerPage = state.status?.ch === 2 ? 512 : 1024;
  const expectedSamples = totalPages * samplesPerPage;

  try {
    const { samples, bytes } = await exportCsv(state.port, {
      onProgress: ({ samples, bytes }) => {
        const pct = expectedSamples ? Math.min(100, Math.round(100 * samples / expectedSamples)) : 0;
        exportBar.value = pct;
        exportLabel.textContent = `${samples.toLocaleString()} samples (${(bytes/1024).toFixed(1)} KB)`;
      },
    });
    toast(`Exported ${samples.toLocaleString()} samples (${(bytes/1024).toFixed(1)} KB)`);
  } catch (err) {
    if (err.name === 'AbortError') {
      toast('Export cancelled');
    } else if (err.message === 'stream stalled') {
      toast('Export stalled — file may be truncated', 'error');
    } else {
      toast(`Export failed: ${err.message}`, 'error');
    }
  } finally {
    exportProgress.classList.add('hidden');
    state.serialBusy = false;
    startPolling();
  }
}

document.getElementById('btn-export').addEventListener('click', handleExport);

// ---------- DFU flash ----------
const dfuFile = document.getElementById('dfu-file');
const dfuFileInfo = document.getElementById('dfu-file-info');
const btnDfuFlash = document.getElementById('btn-dfu-flash');
const dfuStep = document.getElementById('dfu-step');
const dfuProgress = document.getElementById('dfu-progress');
const dfuBar = document.getElementById('dfu-bar');
const dfuLabel = document.getElementById('dfu-label');

const releaseCardState = document.getElementById('release-state');
const releaseMeta = document.getElementById('release-meta');
const releaseTag = document.getElementById('release-tag');
const releaseSub = document.getElementById('release-sub');
const releaseCurrent = document.getElementById('release-current');
const releaseCachePill = document.getElementById('release-cache-pill');
const btnFlashRelease = document.getElementById('btn-flash-release');
const btnCacheRelease = document.getElementById('btn-cache-release');
const btnRefreshRelease = document.getElementById('btn-refresh-release');

let pickedFirmware = null;
let latestRelease = null;

dfuFile.addEventListener('change', () => {
  const f = dfuFile.files?.[0];
  if (!f) {
    pickedFirmware = null;
    dfuFileInfo.textContent = 'No file selected.';
    btnDfuFlash.disabled = true;
    return;
  }
  pickedFirmware = f;
  dfuFileInfo.textContent = `${f.name} · ${(f.size / 1024).toFixed(1)} KB`;
  btnDfuFlash.disabled = false;
});

async function performFlash(buf, displayName) {
  if (!dfu.isSupported()) { toast('WebUSB not supported in this browser', 'error'); return false; }
  if (!(await confirmDialog(
    `Flash ${displayName} (${(buf.byteLength/1024).toFixed(1)} KB)? ` +
    `The current firmware will reboot into the maple bootloader.`
  ))) return false;

  btnDfuFlash.disabled = true;
  btnFlashRelease.disabled = true;
  state.serialBusy = true;
  stopPolling();
  dfuProgress.classList.remove('hidden');
  dfuBar.value = 0;
  dfuLabel.textContent = `0 / ${buf.byteLength} bytes`;

  try {
    dfuStep.textContent = 'Triggering bootloader…';
    if (state.port) {
      try { await cdc.triggerDfuReboot(state.port); } catch {}
      setState({ port: null, status: null, missedPolls: 0 });
    }

    dfuStep.textContent = 'Waiting for bootloader to enumerate…';
    await new Promise(r => setTimeout(r, 1500));

    dfuStep.textContent = 'Pick the bootloader device when prompted…';
    let device = await dfu.findExistingBootloader();
    if (!device) {
      try {
        device = await dfu.requestBootloader();
      } catch (err) {
        if (err.name === 'NotFoundError') {
          dfuStep.textContent = 'Cancelled — no device picked.';
          toast('No bootloader device picked', 'warn');
          return false;
        }
        throw err;
      }
    }

    dfuStep.textContent = 'Uploading…';
    await dfu.uploadFirmware(device, buf, {
      onProgress: ({ written, total }) => {
        dfuBar.value = Math.round(100 * written / total);
        dfuLabel.textContent = `${written.toLocaleString()} / ${total.toLocaleString()} bytes`;
      },
    });

    dfuStep.textContent = 'Done — device should be re-enumerating with the new firmware.';
    toast('Flash complete — click Connect when ready');
    return true;
  } catch (err) {
    dfuStep.textContent = `Flash failed: ${err.message}`;
    toast(`Flash failed: ${err.message}`, 'error');
    return false;
  } finally {
    btnDfuFlash.disabled = !pickedFirmware;
    btnFlashRelease.disabled = !latestRelease?.asset;
    state.serialBusy = false;
  }
}

async function handleFlashCustom() {
  if (state.demoMode) { toast('(demo) would flash custom firmware via WebUSB'); return; }
  if (!pickedFirmware) { toast('Pick a .bin file first', 'warn'); return; }
  const buf = await pickedFirmware.arrayBuffer();
  await performFlash(buf, pickedFirmware.name);
}

async function handleFlashRelease() {
  if (state.demoMode) { toast('(demo) would download + flash latest release'); return; }
  if (!latestRelease?.asset) { toast('No release asset available', 'warn'); return; }

  dfuStep.textContent = `Fetching ${latestRelease.asset.name}…`;
  dfuProgress.classList.remove('hidden');
  dfuBar.value = 0;
  dfuLabel.textContent = `0 / ${latestRelease.asset.size} bytes`;

  let buf;
  try {
    buf = await release.fetchAndCacheFirmware(latestRelease.asset.url, {
      onProgress: ({ loaded, total, fromCache }) => {
        const t = total || latestRelease.asset.size || loaded;
        dfuBar.value = t ? Math.round(100 * loaded / t) : 0;
        dfuLabel.textContent = fromCache
          ? `${loaded.toLocaleString()} bytes (from cache)`
          : `${loaded.toLocaleString()} / ${t.toLocaleString()} bytes`;
      },
    });
    await release.pruneOtherFirmwares(latestRelease.asset.url);
    await refreshReleaseCacheState();
  } catch (err) {
    dfuStep.textContent = `Download failed: ${err.message}`;
    toast(`Couldn't fetch release: ${err.message}`, 'error');
    dfuProgress.classList.add('hidden');
    return;
  }

  const ok = await performFlash(buf, latestRelease.asset.name);
  if (ok) {
    release.setLastFlashedTag(latestRelease.tag);
    renderRelease();
  }
}

async function handleCacheRelease() {
  if (!latestRelease?.asset) return;
  btnCacheRelease.disabled = true;
  dfuStep.textContent = `Downloading ${latestRelease.asset.name} for offline use…`;
  try {
    await release.fetchAndCacheFirmware(latestRelease.asset.url, {
      onProgress: ({ loaded, total }) => {
        const t = total || latestRelease.asset.size || loaded;
        dfuStep.textContent = `Downloading… ${(loaded/1024).toFixed(1)} / ${(t/1024).toFixed(1)} KB`;
      },
    });
    await release.pruneOtherFirmwares(latestRelease.asset.url);
    dfuStep.textContent = 'Cached for offline use.';
    toast('Firmware cached for offline use');
  } catch (err) {
    dfuStep.textContent = `Cache failed: ${err.message}`;
    toast(`Cache failed: ${err.message}`, 'error');
  } finally {
    await refreshReleaseCacheState();
  }
}

async function refreshReleaseCacheState() {
  if (!latestRelease?.asset) {
    releaseCachePill.classList.add('hidden');
    btnCacheRelease.disabled = true;
    return;
  }
  const cached = await release.isFirmwareCached(latestRelease.asset.url);
  releaseCachePill.classList.remove('hidden');
  releaseCachePill.textContent = cached ? 'cached offline' : 'not cached';
  releaseCachePill.className = cached ? 'pill pill-on' : 'pill pill-off';
  btnCacheRelease.disabled = cached;
}

let prefetchInflight = false;
async function autoPrefetchRelease() {
  if (prefetchInflight) return;
  if (!latestRelease?.asset) return;
  if (!navigator.onLine) return;
  if (await release.isFirmwareCached(latestRelease.asset.url)) return;
  prefetchInflight = true;
  releaseCachePill.textContent = 'caching…';
  try {
    await release.fetchAndCacheFirmware(latestRelease.asset.url);
    await release.pruneOtherFirmwares(latestRelease.asset.url);
  } catch {
    // Quiet failure — user can retry via "Download for offline".
  } finally {
    prefetchInflight = false;
    refreshReleaseCacheState();
  }
}

function renderRelease() {
  if (latestRelease === null) {
    releaseCardState.textContent = 'No published releases yet on GitHub.';
    releaseCardState.classList.remove('hidden');
    releaseMeta.classList.add('hidden');
    btnFlashRelease.disabled = true;
    btnCacheRelease.disabled = true;
    return;
  }
  if (!latestRelease.asset) {
    releaseCardState.textContent = `Latest release ${latestRelease.tag} has no DFU asset (looking for *neury-dfu*.bin).`;
    releaseCardState.classList.remove('hidden');
    releaseMeta.classList.add('hidden');
    btnFlashRelease.disabled = true;
    btnCacheRelease.disabled = true;
    return;
  }

  releaseCardState.classList.add('hidden');
  releaseMeta.classList.remove('hidden');
  releaseTag.textContent = latestRelease.tag;
  const date = latestRelease.publishedAt ? new Date(latestRelease.publishedAt).toLocaleDateString() : '?';
  const sizeKB = (latestRelease.asset.size / 1024).toFixed(1);
  releaseSub.textContent = `${latestRelease.asset.name} · ${sizeKB} KB · published ${date}`;

  const lastFlashed = release.getLastFlashedTag();
  if (!lastFlashed) {
    releaseCurrent.textContent = 'You haven\'t flashed via this app before.';
    btnFlashRelease.textContent = `Flash ${latestRelease.tag}`;
  } else if (lastFlashed === latestRelease.tag) {
    releaseCurrent.textContent = `Last flashed via this app: ${lastFlashed} — up to date.`;
    btnFlashRelease.textContent = `Re-flash ${latestRelease.tag}`;
  } else {
    releaseCurrent.textContent = `Last flashed via this app: ${lastFlashed} — update available.`;
    btnFlashRelease.textContent = `Update to ${latestRelease.tag}`;
    btnFlashRelease.classList.add('primary');
  }
  btnFlashRelease.disabled = false;

  refreshReleaseCacheState().then(() => autoPrefetchRelease());
}

async function checkRelease({ force = false } = {}) {
  releaseCardState.textContent = force ? 'Re-checking GitHub…' : 'Checking GitHub for latest release…';
  releaseCardState.classList.remove('hidden');
  try {
    latestRelease = await release.fetchLatestRelease({ force });
  } catch (err) {
    releaseCardState.textContent = `Couldn't reach GitHub (${err.message}).`;
    releaseMeta.classList.add('hidden');
    return;
  }
  renderRelease();
}

document.getElementById('btn-dfu-flash').addEventListener('click', handleFlashCustom);
btnFlashRelease.addEventListener('click', handleFlashRelease);
btnCacheRelease.addEventListener('click', handleCacheRelease);
btnRefreshRelease.addEventListener('click', () => checkRelease({ force: true }));

checkRelease();

dom.btnConnect.addEventListener('click', handleConnect);
dom.btnDisconnect.addEventListener('click', handleDisconnect);
document.getElementById('link-demo')?.addEventListener('click', (e) => {
  e.preventDefault();
  enterDemoMode();
});

if (new URLSearchParams(location.search).has('demo')) enterDemoMode();

window.addEventListener('beforeunload', () => {
  if (state.port) cdc.disconnect(state.port);
});

// ---------- PWA: service worker + install prompt ----------
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('./sw.js').catch(err =>
    console.warn('SW register failed', err)
  );
}

let deferredInstall = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstall = e;
  dom.btnInstall.classList.remove('hidden');
});
dom.btnInstall.addEventListener('click', async () => {
  if (!deferredInstall) return;
  deferredInstall.prompt();
  await deferredInstall.userChoice;
  deferredInstall = null;
  dom.btnInstall.classList.add('hidden');
});
window.addEventListener('appinstalled', () => {
  dom.btnInstall.classList.add('hidden');
  toast('Installed');
});

// ---------- Browser support indicator ----------
const hasSerial = 'serial' in navigator;
const hasUsb = 'usb' in navigator;
if (hasSerial && hasUsb) {
  dom.wsSupport.textContent = 'WebSerial + WebUSB ok';
} else {
  const missing = [
    !hasSerial && 'WebSerial',
    !hasUsb && 'WebUSB',
  ].filter(Boolean).join(' + ');
  dom.wsSupport.textContent = `${missing} unavailable — use Chrome or Edge`;
  if (!hasSerial) {
    toast(`${missing} not supported — use Chrome or Edge`, 'error');
    dom.btnConnect.disabled = true;
  }
}

render();
