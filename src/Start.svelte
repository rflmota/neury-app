<script lang="ts">
  import type { Run } from './lib/reply';
  import type { Status } from './lib/status';

  let { status, busy, run }: { status: Status; busy: boolean; run: Run } = $props();

  let started = $state(false);

  async function record() {
    started = (await run('x'))?.ok ?? false;
  }

  async function eraseNew() {
    if (confirm(`Erase all ${status.pages} Pages? Export first if you need this data.`)) await run('a');
  }
</script>

<section>
  {#if status.state === 'rec'}
    {#if started}<p class="ok">Recording. Unplug the menu cable.</p>{/if}
  {:else if status.state === 'full'}
    <button disabled={busy} onclick={eraseNew}>Erase and start new</button>
  {:else if status.pages === 0}
    <fieldset disabled={busy}>
      <legend>Channels</legend>
      {#each [1, 2] as n (n)}
        <label><input type="radio" name="ch" checked={status.ch === n} onchange={() => run(String(n))} /> {n}</label>
      {/each}
    </fieldset>
    <button disabled={busy} onclick={record}>Start Recording</button>
  {:else}
    <button disabled={busy} onclick={record}>Continue Recording</button>
    <button disabled={busy} onclick={eraseNew}>Erase and start new</button>
  {/if}
</section>

<style>
  fieldset {
    border: none;
    padding: 0;
    margin: 0 0 0.5rem;
  }
  label {
    margin-right: 1rem;
  }
</style>
