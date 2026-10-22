<script lang="ts">
  import { onMount } from 'svelte';
  import { Logger, grantedPorts, requestPort } from './lib/logger';
  import { download, grantedBootloader, requestBootloader } from './lib/dfu';
  import { gate, type Gate } from './lib/gate';
  import { parseStatus, type Status } from './lib/status';
  import { errorMessage } from './lib/errors';
  import { exportCsv } from './lib/export';
  import type { Reply } from './lib/reply';
  import StatusView from './StatusView.svelte';
  import Start from './Start.svelte';
  import Diagnostics from './Diagnostics.svelte';
  import Update from './Update.svelte';

  const POLL_MS = 2000;
  const MAX_MISSED = 3;
  const GUIDE_URL = 'https://github.com/rflmota/neury-app#firmware';

  const supported = 'serial' in navigator && 'usb' in navigator;

  let logger = $state<Logger | null>(null);
  let version = $state<Gate | null>(null);
  let status = $state<Status | null>(null);
  let missed = $state(0);
  let busy = $state(false);
  let message = $state('');
  let notice = $state('');

  // Firmware update: a Logger sitting in dapboot, an image waiting for it, the download progress.
  let bootloader = $state.raw<USBDevice | null>(null);
  let pending = $state.raw<ArrayBuffer | null>(null);
  let written = $state<number | null>(null);
  let total = $state(0);

  // Export progress in Pages.
  let exported = $state<number | null>(null);
  let exportTotal = $state(0);

  onMount(() => {
    if (!supported) return;
    navigator.serial.addEventListener('disconnect', (e) => {
      if (e.target === logger?.port) disconnected();
    });
  });

  async function connect() {
    message = '';
    notice = '';
    const ports = await grantedPorts();
    const port = ports.length === 1 ? ports[0] : await requestPort().catch(() => null);
    if (!port) return;
    try {
      logger = await Logger.open(port);
    } catch (e) {
      message = `Could not open the Logger: ${(e as Error).message}`;
      return;
    }
    version = gate(await logger.cmd('v').catch(() => null));
    if (version !== 'ok') return;
    await refresh();
    if (status?.state === 'menu' && status.rtc) await logger.cmd('u', Math.floor(Date.now() / 1000));
    poll();
  }

  function disconnected() {
    logger?.close().catch(() => {});
    logger = null;
    version = null;
    status = null;
    missed = 0;
    busy = false;
  }

  async function poll() {
    const current = logger;
    while (logger === current) {
      await new Promise((r) => setTimeout(r, POLL_MS));
      if (logger === current) await refresh();
    }
  }

  async function refresh() {
    try {
      const r = await logger!.cmd('s');
      if (r.ok) status = parseStatus(r.kv);
      missed = 0;
    } catch {
      missed++;
    }
  }

  async function run(letter: string): Promise<Reply | null> {
    busy = true;
    message = '';
    try {
      const r = await logger!.cmd(letter);
      if (!r.ok) message = errorMessage(r.err);
      return r;
    } catch {
      message = errorMessage('timeout');
      return null;
    } finally {
      busy = false;
      await refresh();
    }
  }

  async function exportData() {
    const name = `neury-${new Date().toISOString().slice(0, 10)}.csv`;
    const handle = await window
      .showSaveFilePicker({ suggestedName: name, types: [{ description: 'CSV', accept: { 'text/csv': ['.csv'] } }] })
      .catch(() => null);
    if (!handle) return;
    const file = await handle.createWritable();
    busy = true;
    message = '';
    notice = '';
    exported = 0;
    try {
      await exportCsv(logger!, (text) => file.write(text), (n, t) => {
        exported = n;
        exportTotal = t;
      });
      await file.close();
      notice = `Exported to ${handle.name}.`;
    } catch (e) {
      await file.abort();
      message = errorMessage((e as Error).message);
    } finally {
      busy = false;
      exported = null;
    }
  }

  async function connectBootloader() {
    message = '';
    notice = '';
    const device = await requestBootloader().catch(() => null);
    if (device && pending) await flash(device, pending);
    else bootloader = device;
  }

  // In Menu mode, `D` reboots the Logger into dapboot; its port drops right after the OK.
  async function update(image: ArrayBuffer, name: string) {
    if (!confirm(`Update the Logger firmware to ${name}? Recorded Pages are kept.`)) return;
    message = '';
    if (bootloader) return flash(bootloader, image);
    const r = await logger!.cmd('D').catch(() => null);
    if (!r?.ok) {
      message = errorMessage(r ? r.err : 'timeout');
      return;
    }
    disconnected();
    pending = image;
    for (let i = 0; i < 20 && pending === image; i++) {
      await new Promise((r) => setTimeout(r, 500));
      const device = await grantedBootloader();
      if (device && pending === image) return flash(device, image);
    }
  }

  async function flash(device: USBDevice, image: ArrayBuffer) {
    pending = null;
    bootloader = null;
    total = image.byteLength;
    written = 0;
    try {
      await download(device, new Uint8Array(image), (n) => (written = n));
      notice = 'Firmware updated. The Logger restarts by itself; connect it again.';
    } catch (e) {
      message = `Update failed: ${(e as Error).message}. The Logger stays in its bootloader; connect the bootloader to retry.`;
    } finally {
      written = null;
    }
  }
</script>

<header><h1>Neury</h1></header>

<main>
  {#if !supported}
    <p class="warn">Neury needs Chrome or Edge on a desktop computer.</p>
  {:else if written !== null}
    <p>Updating firmware… Keep the Logger plugged in.</p>
    <progress max={total} value={written}></progress>
  {:else if pending}
    <p>The Logger is restarting into its bootloader.</p>
    <p>If nothing happens, select the bootloader ("DAPBoot DFU Bootloader") to continue.</p>
    <button onclick={connectBootloader}>Select bootloader</button>
  {:else if bootloader}
    <p>The Logger is in its bootloader. Choose the firmware to install.</p>
    <Update fw={null} busy={false} {update} />
  {:else if !logger}
    <p>Plug in the Logger with its menu cable, then connect.</p>
    <button onclick={connect}>Connect</button>
    <p class="hint">
      Logger stuck after an interrupted update?
      <button class="link" onclick={connectBootloader}>Connect bootloader</button>
    </p>
  {:else if version === 'old'}
    <p class="warn">
      Unsupported firmware. This Logger needs a one-time bench update.
      <a href={GUIDE_URL}>Flashing guide</a>
    </p>
  {:else if version === 'newer'}
    <p class="warn">This Logger is newer than the App. Reload the page to update the App.</p>
  {:else if status}
    {#if missed >= MAX_MISSED}<p class="warn">The Logger is not responding.</p>{/if}
    <StatusView {status} />
    <Start {status} {busy} {run} />
    {#if status.state !== 'rec' && status.pages > 0}
      <section>
        <button disabled={busy} onclick={exportData}>Export CSV</button>
        {#if exported !== null}
          <progress max={exportTotal} value={exported}></progress>
          {exported.toLocaleString()} / {exportTotal.toLocaleString()} Pages
        {/if}
      </section>
    {/if}
    {#if status.state !== 'rec'}<Update fw={status.fw} {busy} {update} />{/if}
    <Diagnostics {status} {busy} {run} />
  {:else}
    <p>Connecting…</p>
  {/if}

  {#if busy && exported === null}<p>Working… erasing can take up to 2 minutes.</p>{/if}
  {#if message}<p class="error">{message}</p>{/if}
  {#if notice}<p class="ok">{notice}</p>{/if}
</main>

<footer>App {__COMMIT__}</footer>
