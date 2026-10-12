<script lang="ts">
  import { onMount } from 'svelte';
  import { newer, type Firmware } from './lib/release';

  // fw is null when the Logger is already in its bootloader.
  let {
    fw,
    busy,
    update,
  }: { fw: string | null; busy: boolean; update: (image: ArrayBuffer, name: string) => void } = $props();

  let release = $state<Firmware | null>(null);
  const offer = $derived(release && (!fw || newer(release.version, fw)) ? release : null);

  onMount(async () => {
    release = await fetch('firmware.json')
      .then((r) => r.json())
      .catch(() => null);
  });

  async function updateRelease() {
    const image = await (await fetch(`firmware/${offer!.file}`)).arrayBuffer();
    update(image, offer!.version);
  }

  async function pick(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files![0];
    input.value = '';
    update(await file.arrayBuffer(), file.name);
  }
</script>

<section>
  {#if offer}
    <button disabled={busy} onclick={updateRelease}>Update firmware to {offer.version}</button>
  {/if}
  <details open={!fw && !offer}>
    <summary>Custom firmware</summary>
    <input type="file" accept=".bin" disabled={busy} onchange={pick} />
  </details>
</section>

<style>
  section {
    margin-top: 1.5rem;
  }
</style>
