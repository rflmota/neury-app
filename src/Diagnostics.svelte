<script lang="ts">
  import type { Run } from './lib/reply';
  import type { Status } from './lib/status';

  let { status, busy, run }: { status: Status; busy: boolean; run: Run } = $props();

  let result = $state('');

  async function selfTest() {
    if (!confirm('The self-test erases all Pages and can take 2 minutes. Run it?')) return;
    result = '';
    const r = await run('t');
    if (r?.ok) result = `Passed: ${r.kv.pages} Pages checked.`;
    else if (r?.err === 'fail') result = `Failed at Page ${r.kv.page}.`;
  }
</script>

<details>
  <summary>Diagnostics</summary>
  <dl>
    <dt>NAND</dt>
    <dd>{status.nand} ({status.nandId})</dd>
    <dt>INTAN</dt>
    <dd>{status.intan ? 'detected' : 'not detected'}</dd>
    <dt>Clock</dt>
    <dd>{status.rtc ? 'running' : 'none'}</dd>
    <dt>Erase / program failures</dt>
    <dd>{status.efail} / {status.pfail}</dd>
    <dt>ECC corrected / uncorrectable</dt>
    <dd>{status.eccCorr} / {status.eccUnc}</dd>
    <dt>Busy timeouts</dt>
    <dd>{status.busyTo}</dd>
    <dt>Overruns</dt>
    <dd>{status.overrun}</dd>
  </dl>
  {#if status.state !== 'rec'}
    <button disabled={busy} onclick={selfTest}>Run self-test</button>
  {/if}
  {#if result}<p>{result}</p>{/if}
</details>

<style>
  details {
    margin-top: 1.5rem;
  }
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
</style>
