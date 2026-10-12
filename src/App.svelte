<script lang="ts">
  import { onMount } from 'svelte';
  import { Logger, grantedPorts, requestPort } from './lib/logger';
  import { gate, type Gate } from './lib/gate';
  import { parseStatus, type Status } from './lib/status';
  import { errorMessage } from './lib/errors';
  import type { Reply } from './lib/reply';
  import StatusView from './StatusView.svelte';
  import Start from './Start.svelte';
  import Diagnostics from './Diagnostics.svelte';

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

  onMount(() => {
    if (!supported) return;
    navigator.serial.addEventListener('disconnect', (e) => {
      if (e.target === logger?.port) disconnected();
    });
  });

  async function connect() {
    message = '';
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
</script>

<header><h1>Neury</h1></header>

<main>
  {#if !supported}
    <p class="warn">Neury needs Chrome or Edge on a desktop computer.</p>
  {:else if !logger}
    <p>Plug in the Logger with its menu cable, then connect.</p>
    <button onclick={connect}>Connect</button>
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
    <Diagnostics {status} {busy} {run} />
  {:else}
    <p>Connecting…</p>
  {/if}

  {#if busy}<p>Working… erasing can take up to 2 minutes.</p>{/if}
  {#if message}<p class="error">{message}</p>{/if}
</main>

<footer>App {__COMMIT__}</footer>
