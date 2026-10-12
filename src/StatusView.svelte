<script lang="ts">
  import { hoursLeft, type Status } from './lib/status';

  let { status }: { status: Status } = $props();

  const labels = { menu: 'Menu mode', rec: 'Recording', full: 'Full' };
  const when = (t: number) => new Date(t * 1000).toLocaleString();
</script>

{#if !status.intan}
  <p class="warn">No amplifier (INTAN) detected. This Logger can't record.</p>
{/if}
{#if status.nand === 'unknown'}
  <p class="warn">Unsupported memory chip ({status.nandId}). This Logger can't record or export.</p>
{/if}

<dl>
  <dt>State</dt>
  <dd>{labels[status.state]}</dd>
  <dt>Channels</dt>
  <dd>{status.ch}</dd>
  <dt>Memory</dt>
  <dd>
    <progress max={status.cap} value={status.pages}></progress>
    {status.pages.toLocaleString()} / {status.cap.toLocaleString()} Pages, {hoursLeft(status).toFixed(1)} h left
  </dd>
  {#if status.rtc}
    <dt>Logger time</dt>
    <dd>{when(status.time)}</dd>
    {#if status.start}
      <dt>Recording start</dt>
      <dd>{when(status.start)}</dd>
    {/if}
  {/if}
  <dt>Firmware</dt>
  <dd>{status.fw}</dd>
</dl>

<style>
  dl {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 0.25rem 1rem;
  }
  dt {
    color: var(--muted);
  }
  dd {
    margin: 0;
  }
  progress {
    width: 12rem;
    vertical-align: middle;
  }
</style>
